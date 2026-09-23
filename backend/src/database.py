from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
)
from src.config import settings

_client: any = None

def get_client():
    global _client
    if _client is None:
        _client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
    return _client

def get_collection_name() -> str:
    return settings.QDRANT_COLLECTION

def ensure_collection(vector_size: int = 768) -> bool:
    """Create collection if it doesn't exist. Returns True if successful."""
    global _client
    try:
        client = get_client()
        col_name = get_collection_name()
        client.get_collection(collection_name=col_name)
        return True  # Collection already exists
    except Exception:
        try:
            client = get_client()
            client.create_collection(
                collection_name=get_collection_name(),
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=Distance.COSINE,
                ),
            )
            return True  # Created successfully
        except Exception as e:
            print(f"Could not create collection: {e}")
            return False  # Qdrant not available

def _get_client():
    """Get the Qdrant client, returns None if not available."""
    try:
        return get_client()
    except Exception:
        return None

def insert_points(points: list) -> bool:
    """Insert points into the collection. Returns True if successful."""
    if not points:
        return True
    client = _get_client()
    if client is None:
        return False
    col_name = get_collection_name()
    try:
        client.upsert(
            collection_name=col_name,
            points=points,
        )
        return True
    except Exception as e:
        print(f"Error inserting points: {e}")
        return False

def search_points(
    query_vector: list[float],
    top_k: int = 5,
    filter_dict: dict | None = None,
) -> list[dict]:
    """Search for similar vectors and return scored points."""
    client = _get_client()
    if client is None:
        return []
    
    col_name = get_collection_name()
    must_filters = []
    if filter_dict:
        for key, value in filter_dict.items():
            must_filters.append(
                FieldCondition(key=key, match=MatchValue(value=value))
            )

    query_filter = Filter(must=must_filters) if must_filters else None

    try:
        results = client.search(
            collection_name=col_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=query_filter,
        )
        return [
            {
                "id": point.id,
                "score": point.score,
                "payload": point.payload,
            }
            for point in results
        ]
    except Exception as e:
        print(f"Error searching points: {e}")
        return []