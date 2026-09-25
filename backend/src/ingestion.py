import hashlib
from uuid import NAMESPACE_URL, uuid4, uuid5

from qdrant_client.models import PointStruct

from src.chat_database import IngestionJob, KnowledgeChunk, KnowledgeItem, SessionLocal, utcnow
from src.database import delete_points, insert_points
from src.embeddings import embedding_generator


def chunk_text(text: str, size: int = 1500, overlap: int = 200) -> list[str]:
    clean = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    if not clean:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(clean):
        end = min(start + size, len(clean))
        if end < len(clean):
            boundary = clean.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunks.append(clean[start:end].strip())
        if end == len(clean):
            break
        start = max(end - overlap, start + 1)
    return chunks


def run_ingestion_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(IngestionJob, job_id)
        item = db.get(KnowledgeItem, job.knowledge_item_id) if job else None
        if not job or not item or item.status != "approved":
            raise ValueError("Only approved knowledge can be indexed")
        job.status = "indexing"
        db.commit()
        canonical = (
            f"Question: {item.question}\nAnswer: {item.content}"
            if item.source_type == "chat" and item.question else item.content
        )
        chunks = chunk_text(canonical)
        if not chunks:
            raise ValueError("Knowledge item has no indexable text")
        job.chunks_total = len(chunks)
        vectors = embedding_generator.embed_batch(chunks)
        points = []
        rows = []
        for position, (text, vector) in enumerate(zip(chunks, vectors)):
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            point_id = str(uuid5(NAMESPACE_URL, f"knowledge:{item.id}:{position}:{digest}"))
            points.append(PointStruct(
                id=point_id, vector=vector,
                payload={"text": text, "metadata": {
                    "source": {"type": item.source_type, "knowledge_item_id": item.id},
                    "approved_at": item.approved_at.isoformat() if item.approved_at else None,
                }},
            ))
            rows.append(KnowledgeChunk(
                id=str(uuid4()), knowledge_item_id=item.id, qdrant_point_id=point_id,
                position=position, content_hash=digest, text=text,
            ))
        old_rows = db.query(KnowledgeChunk).filter(KnowledgeChunk.knowledge_item_id == item.id).all()
        if not insert_points(points):
            raise RuntimeError("Qdrant rejected the batch")
        new_ids = {row.qdrant_point_id for row in rows}
        stale_ids = [row.qdrant_point_id for row in old_rows if row.qdrant_point_id not in new_ids]
        if stale_ids and not delete_points(stale_ids):
            raise RuntimeError("New vectors were indexed but stale vectors could not be removed")
        db.query(KnowledgeChunk).filter(KnowledgeChunk.knowledge_item_id == item.id).delete()
        db.add_all(rows)
        job.chunks_indexed = len(rows)
        job.status = "indexed"
        job.finished_at = utcnow()
        item.status = "indexed"
        item.updated_at = utcnow()
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.get(IngestionJob, job_id)
        if job:
            job.status = "failed"
            job.error = str(exc)[:2000]
            job.finished_at = utcnow()
            db.commit()
    finally:
        db.close()
