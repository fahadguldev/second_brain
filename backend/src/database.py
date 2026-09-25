from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    Filter,
    FieldCondition,
    MatchValue,
)
from src.config import settings

_client = None


def get_client():
    global _client

    if _client is None:
        _client = QdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY,
            timeout=120,
        )

    return _client


def get_collection_name() -> str:
    return settings.QDRANT_COLLECTION


def ensure_collection(vector_size: int = 3072) -> bool:
    """Check that the Qdrant collection exists."""
    try:
        client = get_client()
        client.get_collection(
            collection_name=get_collection_name()
        )
        return True

    except Exception as e:
        print(f"Could not connect to Qdrant collection: {e}")
        return False


def _get_client():
    """Get the Qdrant client."""
    try:
        return get_client()
    except Exception:
        return None


def insert_points(points: list) -> bool:
    """Insert points into the collection."""
    if not points:
        return True

    client = _get_client()

    if client is None:
        return False


def delete_points(point_ids: list[str]) -> bool:
    """Delete known derived points after a replacement has been indexed."""
    if not point_ids:
        return True
    client = _get_client()
    if client is None:
        return False
    try:
        from qdrant_client.models import PointIdsList
        client.delete(
            collection_name=get_collection_name(),
            points_selector=PointIdsList(points=point_ids),
        )
        return True
    except Exception as e:
        print(f"Error deleting points: {e}")
        return False

    try:
        client.upsert(
            collection_name=get_collection_name(),
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
    """Search for similar vectors."""

    client = _get_client()

    if client is None:
        return []

    must_filters = []

    if filter_dict:
        for key, value in filter_dict.items():
            must_filters.append(
                FieldCondition(
                    key=key,
                    match=MatchValue(value=value),
                )
            )

    query_filter = (
        Filter(must=must_filters)
        if must_filters
        else None
    )

    try:
        results = client.query_points(
            collection_name=get_collection_name(),
            query=query_vector,
            limit=top_k,
            query_filter=query_filter,
            with_payload=True,
        )

        return [
            {
                "id": point.id,
                "score": point.score,
                "payload": point.payload,
            }
            for point in results.points
        ]

    except Exception as e:
        print(f"Error searching points: {e}")
        return []
