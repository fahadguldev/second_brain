from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.chat_database import Conversation, Message, User, get_db, utcnow
from src.chat_service import get_current_user, owned_conversation, serialize_message
from src.config import settings
from src.database import ensure_collection
from src.rag import generate_answer

router = APIRouter(prefix="/api", tags=["second-brain"])


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=10_000)
    top_k: int = Field(default=5, ge=1, le=20)
    filter_dict: Optional[dict] = None
    conversation_id: Optional[str] = None


class AskResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    latency: float
    top_k: int
    model: str
    embedding_model: str
    context_used: str
    conversation_id: str
    user_message_id: str
    assistant_message_id: str


class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: str
    role: str
    text: str
    created_at: datetime
    info: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str
    qdrant: str
    embedding_model: str
    generation_model: str


@router.on_event("startup")
def startup_event():
    ensure_collection(vector_size=3072)


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    from src.database import _get_client
    qdrant_status = "connected"
    try:
        client = _get_client()
        if client is None:
            raise RuntimeError("Qdrant unavailable")
        client.get_collection(collection_name=settings.QDRANT_COLLECTION)
    except Exception:
        qdrant_status = "error"
    return HealthResponse(
        status="ok" if qdrant_status == "connected" else "degraded",
        qdrant=qdrant_status,
        embedding_model=settings.EMBEDDING_MODEL,
        generation_model=settings.GENERATION_MODEL,
    )


@router.get("/conversations", response_model=List[ConversationResponse])
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Conversation).where(Conversation.user_id == user.id)
        .order_by(Conversation.updated_at.desc())
    ).all()


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
def create_conversation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = Conversation(id=str(uuid4()), user_id=user.id)
    db.add(conversation)
    db.commit()
    return conversation


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
def conversation_messages(
    conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    conversation = owned_conversation(db, conversation_id, user.id)
    return [serialize_message(message) for message in conversation.messages]


@router.post("/ask", response_model=AskResponse)
def ask_question(
    req: AskRequest,
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
) -> AskResponse:
    if req.conversation_id:
        conversation = owned_conversation(db, req.conversation_id, user.id)
    else:
        conversation = Conversation(id=str(uuid4()), user_id=user.id)
        db.add(conversation)

    previous_messages = [
        {"role": message.role, "content": message.content}
        for message in conversation.messages[-10:]
    ]
    user_message = Message(id=str(uuid4()), conversation=conversation, role="user", content=req.question)
    db.add(user_message)
    if not previous_messages:
        conversation.title = req.question.strip()[:80]
    conversation.updated_at = utcnow()
    db.commit()

    result = generate_answer(
        question=req.question, top_k=req.top_k, filter_dict=req.filter_dict,
        conversation_history=previous_messages,
    )
    assistant_message = Message(
        id=str(uuid4()), conversation_id=conversation.id, role="assistant",
        content=result["answer"], model=result["model"], embedding_model=result["embedding_model"],
        latency=result["latency"], sources=result["sources"],
    )
    db.add(assistant_message)
    conversation.updated_at = utcnow()
    db.commit()

    return AskResponse(
        answer=result["answer"], sources=result["sources"], latency=result["latency"],
        top_k=req.top_k, model=result["model"], embedding_model=result["embedding_model"],
        context_used=result["context"], conversation_id=conversation.id,
        user_message_id=user_message.id, assistant_message_id=assistant_message.id,
    )
