import hashlib
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.admin_auth import AdminUser, require_admin
from src.chat_database import Conversation, IngestionJob, KnowledgeItem, Message, get_db, utcnow
from src.ingestion import run_ingestion_job

router = APIRouter(prefix="/api/admin", tags=["admin"])
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


class KnowledgeCreate(BaseModel):
    question: Optional[str] = Field(default=None, max_length=10_000)
    content: str = Field(min_length=1, max_length=500_000)
    source_type: str = Field(default="chat", max_length=32)
    source_message_id: Optional[str] = None


class KnowledgeUpdate(BaseModel):
    question: Optional[str] = Field(default=None, max_length=10_000)
    content: str = Field(min_length=1, max_length=500_000)


class KnowledgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    source_type: str
    source_message_id: Optional[str]
    question: Optional[str]
    content: str
    status: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime]


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    knowledge_item_id: str
    status: str
    chunks_total: int
    chunks_indexed: int
    error: Optional[str]
    created_at: datetime
    finished_at: Optional[datetime]


@router.get("/conversations")
def all_conversations(
    admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db)
):
    rows = db.scalars(select(Conversation).order_by(Conversation.updated_at.desc()).limit(200)).all()
    return [{
        "id": row.id, "user_id": row.user_id, "title": row.title,
        "created_at": row.created_at, "updated_at": row.updated_at,
        "messages": [{"id": msg.id, "role": msg.role, "text": msg.content} for msg in row.messages],
    } for row in rows]


@router.get("/knowledge", response_model=list[KnowledgeResponse])
def list_knowledge(
    status: Optional[str] = None,
    admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db),
):
    query = select(KnowledgeItem).order_by(KnowledgeItem.updated_at.desc())
    if status:
        query = query.where(KnowledgeItem.status == status)
    return db.scalars(query).all()


@router.post("/knowledge", response_model=KnowledgeResponse, status_code=201)
def create_knowledge(
    payload: KnowledgeCreate, admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db)
):
    if payload.source_message_id and not db.get(Message, payload.source_message_id):
        raise HTTPException(status_code=404, detail="Source message not found")
    if payload.source_message_id:
        duplicate = db.scalar(select(KnowledgeItem).where(
            KnowledgeItem.source_type == payload.source_type,
            KnowledgeItem.source_message_id == payload.source_message_id,
        ))
        if duplicate:
            raise HTTPException(status_code=409, detail="This source is already in review")
    item = KnowledgeItem(
        id=str(uuid4()), source_type=payload.source_type,
        source_message_id=payload.source_message_id, question=payload.question,
        content=payload.content.strip(), created_by=admin.email,
    )
    db.add(item)
    db.commit()
    return item


@router.put("/knowledge/{item_id}", response_model=KnowledgeResponse)
def update_knowledge(
    item_id: str, payload: KnowledgeUpdate,
    admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db),
):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    item.question = payload.question
    item.content = payload.content.strip()
    item.status = "draft"
    item.approved_at = None
    item.updated_at = utcnow()
    db.commit()
    return item


@router.post("/knowledge/{item_id}/approve", response_model=KnowledgeResponse)
def approve_knowledge(
    item_id: str, admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db)
):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    item.status = "approved"
    item.approved_at = utcnow()
    item.updated_at = utcnow()
    db.commit()
    return item


@router.post("/knowledge/{item_id}/ingest", response_model=JobResponse, status_code=202)
def ingest_knowledge(
    item_id: str, tasks: BackgroundTasks,
    admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db),
):
    item = db.get(KnowledgeItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    if item.status != "approved":
        raise HTTPException(status_code=409, detail="Approve the item before ingestion")
    active = db.scalar(select(IngestionJob).where(
        IngestionJob.knowledge_item_id == item_id,
        IngestionJob.status.in_(["queued", "indexing"]),
    ))
    if active:
        return active
    job = IngestionJob(id=str(uuid4()), knowledge_item_id=item_id)
    db.add(job)
    db.commit()
    tasks.add_task(run_ingestion_job, job.id)
    return job


@router.post("/uploads", response_model=KnowledgeResponse, status_code=201)
async def upload_text(
    file: UploadFile = File(...),
    admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db),
):
    filename = file.filename or "upload.txt"
    if not filename.lower().endswith((".txt", ".md")):
        raise HTTPException(status_code=415, detail="Only .txt and .md files are supported")
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 2 MB limit")
    try:
        content = raw.decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="File must be UTF-8 encoded") from exc
    if not content:
        raise HTTPException(status_code=422, detail="File is empty")
    digest = hashlib.sha256(raw).hexdigest()
    duplicate = db.scalar(select(KnowledgeItem).where(
        KnowledgeItem.source_type == "upload", KnowledgeItem.source_message_id == digest
    ))
    if duplicate:
        raise HTTPException(status_code=409, detail="This file has already been uploaded")
    item = KnowledgeItem(
        id=str(uuid4()), source_type="upload", source_message_id=digest,
        question=filename[:160], content=content, created_by=admin.email,
    )
    db.add(item)
    db.commit()
    return item


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(admin: AdminUser = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(IngestionJob).order_by(IngestionJob.created_at.desc()).limit(100)).all()
