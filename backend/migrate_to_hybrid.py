"""Migration script: Migrate existing Qdrant collection to Hybrid (Dense + BM25 Sparse).

This script reads all existing points (with their pre-computed Gemini 3072-dim dense vectors)
from the source collection, computes BM25 sparse vectors locally via FastEmbed in seconds,
and writes them to the new hybrid collection without making any paid Gemini API calls.
"""

from __future__ import annotations

import os
import sys
import time
from typing import List

from dotenv import load_dotenv

load_dotenv()

from qdrant_client import QdrantClient, models
from src.sparse_embeddings import sparse_embedding_generator

QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
SOURCE_COLLECTION = os.getenv("QDRANT_COLLECTION", "second_brain")
TARGET_COLLECTION = os.getenv("QDRANT_TARGET_COLLECTION", "second_brain_hybrid")
SPARSE_VECTOR_NAME = os.getenv("SPARSE_VECTOR_NAME", "bm25")
VECTOR_SIZE = int(os.getenv("EMBEDDING_DIMENSION", "3072"))
BATCH_SIZE = 100


def get_client() -> QdrantClient:
    return QdrantClient(
        url=QDRANT_URL,
        api_key=QDRANT_API_KEY,
        timeout=120,
    )


def setup_target_collection(client: QdrantClient, target_name: str) -> None:
    """Create target hybrid collection if it does not exist."""
    collections = [c.name for c in client.get_collections().collections]
    if target_name in collections:
        print(f"Target collection '{target_name}' already exists.")
        info = client.get_collection(target_name)
        print(f"Existing target collection vectors: {info.config.params.vectors}")
        print(f"Existing target collection sparse vectors: {info.config.params.sparse_vectors}")
        return

    print(f"Creating new hybrid collection '{target_name}' with Dense (3072) + Sparse BM25...")
    client.create_collection(
        collection_name=target_name,
        vectors_config={"dense": models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE)},
        sparse_vectors_config={
            SPARSE_VECTOR_NAME: models.SparseVectorParams(
                index=models.SparseIndexParams(on_disk=False)
            )
        },
    )

    print(f"Creating payload indexes on '{target_name}'...")
    try:
        client.create_payload_index(
            collection_name=target_name,
            field_name="metadata.source.type",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        client.create_payload_index(
            collection_name=target_name,
            field_name="metadata.topics",
            field_schema=models.PayloadSchemaType.KEYWORD,
        )
        print("Payload indexes created successfully.")
    except Exception as e:
        print(f"Notice during payload index creation: {e}")


def extract_dense_vector(vector_data: any) -> List[float]:
    """Extract dense float list from Point vector (whether dict or list)."""
    if isinstance(vector_data, list):
        return vector_data
    if isinstance(vector_data, dict):
        if "dense" in vector_data:
            return vector_data["dense"]
        if "" in vector_data:
            return vector_data[""]
        first_key = next(iter(vector_data))
        return vector_data[first_key]
    raise ValueError(f"Unknown vector format: {type(vector_data)}")


def run_migration() -> None:
    start_time = time.time()
    print("=" * 60)
    print("Starting Migration: Source -> Hybrid Collection")
    print(f"Source: {SOURCE_COLLECTION}")
    print(f"Target: {TARGET_COLLECTION}")
    print("=" * 60)

    client = get_client()

    # 1. Ensure target collection exists
    setup_target_collection(client, TARGET_COLLECTION)

    # 2. Check total points in source
    source_count = client.count(collection_name=SOURCE_COLLECTION).count
    print(f"\nTotal points in source collection '{SOURCE_COLLECTION}': {source_count}")

    if source_count == 0:
        print("Source collection is empty. Nothing to migrate.")
        return

    # 3. Stream points in batches from source, compute BM25, and upsert to target
    next_offset = None
    migrated_total = 0
    batch_num = 0

    while True:
        records, next_offset = client.scroll(
            collection_name=SOURCE_COLLECTION,
            limit=BATCH_SIZE,
            offset=next_offset,
            with_payload=True,
            with_vectors=True,
        )

        if not records:
            break

        batch_num += 1
        texts = [r.payload.get("text", "") if r.payload else "" for r in records]

        # Compute FastEmbed BM25 sparse vectors locally (milliseconds)
        sparse_embeddings = sparse_embedding_generator.embed_batch(texts)

        points_to_upsert = []
        for r, sparse in zip(records, sparse_embeddings):
            dense_vec = extract_dense_vector(r.vector)
            point = models.PointStruct(
                id=r.id,
                vector={
                    "dense": dense_vec,
                    SPARSE_VECTOR_NAME: models.SparseVector(
                        indices=sparse["indices"],
                        values=sparse["values"],
                    ),
                },
                payload=r.payload,
            )
            points_to_upsert.append(point)

        client.upsert(
            collection_name=TARGET_COLLECTION,
            points=points_to_upsert,
            wait=True,
        )

        migrated_total += len(points_to_upsert)
        print(f"Batch {batch_num:02d}: Upserted {len(points_to_upsert)} points [{migrated_total}/{source_count}] ({migrated_total / source_count * 100:.1f}%)")

        if next_offset is None:
            break

    target_count = client.count(collection_name=TARGET_COLLECTION).count
    elapsed = time.time() - start_time

    print("\n" + "=" * 60)
    print(f"Migration Complete in {elapsed:.2f} seconds!")
    print(f"Target Collection '{TARGET_COLLECTION}' Total Points: {target_count}")
    print("Zero Gemini embedding API calls were made (Dense embeddings were reused 100%).")
    print("=" * 60)

    # 4. Verify hybrid retrieval
    print("\nVerifying Hybrid Retrieval on Target Collection...")
    test_query = "FastAPI AWS lambda cloud"
    sparse_q = sparse_embedding_generator.embed(test_query)
    
    # We do a test query with a dummy/sample dense query from first point to verify RRF pipeline
    sample_pt = client.scroll(collection_name=TARGET_COLLECTION, limit=1, with_vectors=True)[0][0]
    sample_dense = extract_dense_vector(sample_pt.vector)

    results = client.query_points(
        collection_name=TARGET_COLLECTION,
        prefetch=[
            models.Prefetch(query=sample_dense, using="dense", limit=10),
            models.Prefetch(
                query=models.SparseVector(indices=sparse_q["indices"], values=sparse_q["values"]),
                using=SPARSE_VECTOR_NAME,
                limit=10,
            ),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        limit=3,
        with_payload=True,
    )

    print(f"Verified! Test hybrid query returned {len(results.points)} points:")
    for i, pt in enumerate(results.points, 1):
        txt = (pt.payload or {}).get("text", "")[:80].replace("\n", " ")
        print(f"  [{i}] ID: {pt.id} | Score: {pt.score:.4f} | Preview: {txt}...")


if __name__ == "__main__":
    run_migration()
