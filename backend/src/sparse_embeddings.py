"""Sparse BM25 embedding generator for Hybrid Search using FastEmbed."""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Any, Dict, List, Optional
from fastembed import SparseTextEmbedding
from src.config import settings

logger = logging.getLogger(__name__)


def _get_cache_dir() -> str:
    """Ensure cache directory is in /tmp on serverless environments like Vercel."""
    base = (
        os.getenv("FASTEMBED_CACHE_DIR")
        or os.getenv("HF_HOME")
        or os.path.join(tempfile.gettempdir(), "fastembed_cache")
    )
    try:
        os.makedirs(base, exist_ok=True)
    except Exception:
        pass
    return base


class SparseEmbeddingGenerator:
    """Wrapper around FastEmbed SparseTextEmbedding for BM25 vector generation."""

    def __init__(self, model_name: Optional[str] = None) -> None:
        self.model_name = model_name or settings.SPARSE_MODEL
        self._model: Optional[SparseTextEmbedding] = None

    def _get_model(self) -> SparseTextEmbedding:
        if self._model is None:
            cache_dir = _get_cache_dir()
            logger.info("Initializing FastEmbed BM25 sparse model: %s (cache: %s)", self.model_name, cache_dir)
            self._model = SparseTextEmbedding(model_name=self.model_name, cache_dir=cache_dir)
        return self._model

    def embed(self, text: str) -> Dict[str, List[Any]]:
        """Generate sparse BM25 vector for a single text.

        Returns:
            dict with 'indices' (List[int]) and 'values' (List[float]).
        """
        if not text or not text.strip():
            return {"indices": [], "values": []}

        model = self._get_model()
        results = list(model.embed([text]))
        if not results:
            return {"indices": [], "values": []}

        first = results[0]
        return {
            "indices": first.indices.tolist(),
            "values": [float(v) for v in first.values.tolist()],
        }

    def embed_batch(self, texts: List[str]) -> List[Dict[str, List[Any]]]:
        """Generate sparse BM25 vectors for multiple texts."""
        if not texts:
            return []

        model = self._get_model()
        sparse_vectors = []
        for result in model.embed(texts):
            sparse_vectors.append({
                "indices": result.indices.tolist(),
                "values": [float(v) for v in result.values.tolist()],
            })
        return sparse_vectors


# Global singleton instance
sparse_embedding_generator = SparseEmbeddingGenerator()
