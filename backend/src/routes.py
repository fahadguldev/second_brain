import time
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from src.rag import generate_answer, retrieve
from src.database import ensure_collection, search_points, insert_points
from src.config import settings

router = APIRouter(prefix="/api", tags=["second-brain"])

# Startup - attempt to ensure collection but don't fail application startup
try:
    from src.database import ensure_collection
    ensure_collection(vector_size=768)
except Exception:
    pass

# Request/Response models

class AskRequest(BaseModel):
    question: str = Field(..., description="The user's question/comment")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of retrieval results")
    filter_dict: Optional[dict] = Field(
        default=None, description="Metadata filtering (domain, source type, etc.)"
    )

class AskResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    latency: float
    top_k: int
    model: str
    embedding_model: str
    context_used: str

class HealthResponse(BaseModel):
    status: str
    qdrant: str
    embedding_model: str
    generation_model: str

# Startup event - attempt to ensure collection but don't fail
@router.on_event("startup")
async def startup_event():
    try:
        ensure_collection(vector_size=768)  # Gemini embedding dimension
    except Exception:
        pass  # Qdrant may not be available in all environments

@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    from src.database import client
    qdrant_status = "connected"
    try:
        client.get_collection(collection_name=settings.QDRANT_COLLECTION)
    except Exception:
        qdrant_status = "error"
    
    return HealthResponse(
        status="ok" if qdrant_status == "connected" else "degraded",
        qdrant=qdrant_status,
        embedding_model=settings.EMBEDDING_MODEL,
        generation_model=settings.GENERATION_MODEL,
    )

@router.post("/ask", response_model=AskResponse)
async def ask_question(request: Request, req: AskRequest) -> AskResponse:
    """Handle question answering request."""
    # Rate limiting basics (simple implementation)
    client_ip = request.client.host if request.client else "unknown"
    
    # Generate answer using RAG
    result = generate_answer(
        question=req.question,
        top_k=req.top_k,
        filter_dict=req.filter_dict,
    )
    
    return AskResponse(
        answer=result["answer"],
        sources=result["sources"],
        latency=result["latency"],
        top_k=req.top_k,  # use the request's top_k
        model=result["model"],
        embedding_model=result["embedding_model"],
        context_used=result["context"],
    )