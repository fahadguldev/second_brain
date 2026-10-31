import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.chat_database import Conversation, Message, SessionLocal, User, get_db, utcnow
from src.chat_service import get_current_user, owned_conversation, serialize_message
from src.config import settings
from src.database import ensure_collection
from src.llm import GenerationError
from src.message_queue import message_queue
from src.rag import generate_answer, generate_answer_stream
from fastapi import File, Form, UploadFile
from src.voice_service import (
    get_voice_status,
    get_audio_media_type,
    synthesize_speech,
    synthesize_speech_stream,
    clone_voice,
    VoiceConfigurationError,
    VoiceServiceError,
)
import src.elevenlabs_service as elevenlabs_svc

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
    hybrid_search: Optional[bool] = None


@router.on_event("startup")
def startup_event():
    ensure_collection(vector_size=settings.EMBEDDING_DIMENSION)


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
        hybrid_search=settings.RAG_HYBRID_SEARCH,
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

    try:
        result = generate_answer(
            question=req.question, top_k=req.top_k, filter_dict=req.filter_dict,
            conversation_history=previous_messages,
        )
    except GenerationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
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
        conversation_id=conversation.id,
        user_message_id=user_message.id, assistant_message_id=assistant_message.id,
    )


@router.post("/ask/stream")
def ask_question_stream(
    req: AskRequest,
    response: Response,
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    # 1. Zero DB blocking: resolve history and IDs in memory in < 1ms
    conversation_id = req.conversation_id or str(uuid4())
    previous_messages = message_queue.get_conversation_history(req.conversation_id, limit=10)
    user_message_id = str(uuid4())
    assistant_message_id = str(uuid4())

    try:
        result = generate_answer_stream(
            question=req.question,
            top_k=req.top_k,
            filter_dict=req.filter_dict,
            conversation_history=previous_messages,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not prepare response") from exc

    user_id = user.id
    user_question = req.question

    def events():
        # Stream starts immediately: 0ms database overhead
        yield json.dumps({
            "type": "metadata",
            "sources": result["sources"],
            "latency": result["latency"],
            "model": result["model"],
            "embedding_model": result["embedding_model"],
        }) + "\n"

        answer_parts: list[str] = []
        try:
            for text in result["stream"]:
                answer_parts.append(text)
                yield json.dumps({"type": "delta", "text": text}) + "\n"

            full_answer = "".join(answer_parts)

            # Asynchronously enqueue for batch persistence in background (0ms blocking!)
            message_queue.enqueue(
                user_id=user_id,
                conversation_id=conversation_id,
                user_message_id=user_message_id,
                question=user_question,
                assistant_message_id=assistant_message_id,
                answer=full_answer,
                model=result["model"],
                embedding_model=result["embedding_model"],
                latency=result["latency"],
                sources=result["sources"],
            )

            yield json.dumps({
                "type": "done",
                "conversation_id": conversation_id,
                "user_message_id": user_message_id,
                "assistant_message_id": assistant_message_id,
            }) + "\n"
        except Exception:
            yield json.dumps({
                "type": "error",
                "message": "Response generation was interrupted.",
            }) + "\n"

    stream_response = StreamingResponse(
        events(), media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
    for k, v in response.headers.items():
        if k.lower() not in ("content-type", "content-length"):
            stream_response.headers[k] = v
    for header_name, header_value in response.raw_headers:
        if header_name.lower() == b"set-cookie":
            stream_response.raw_headers.append((header_name, header_value))
    return stream_response


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=50_000)
    voice_id: Optional[str] = Field(default=None, max_length=128)
    speed: Optional[float] = Field(default=None, ge=0.5, le=2.0)
    provider: Optional[str] = Field(default=None, max_length=32)
    model_id: Optional[str] = Field(default=None, max_length=64)


class VoiceStatusResponse(BaseModel):
    provider: str = "elevenlabs"
    configured: bool
    voice_id: Optional[str] = None
    model_id: Optional[str] = None
    speed: float = 1.0
    has_user_id: bool = False
    available_providers: List[str] = Field(default_factory=list)
    key_pool: Dict[str, Any] = Field(default_factory=dict)


class VoiceCloneResponse(BaseModel):
    success: bool
    voice_id: Optional[str]
    name: str
    gender: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    provider: Optional[str] = "elevenlabs"


@router.get("/voice/status", response_model=VoiceStatusResponse)
def voice_status() -> VoiceStatusResponse:
    return VoiceStatusResponse(**get_voice_status())


@router.get("/tts/status", response_model=VoiceStatusResponse)
def tts_status() -> VoiceStatusResponse:
    return VoiceStatusResponse(**get_voice_status())


@router.get("/voice/voices")
async def get_voices_list():
    """Fetch available voices for voice calls and listening."""
    try:
        voices = await elevenlabs_svc.list_voices()
        return {"provider": "elevenlabs", "voices": voices}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch voices: {str(exc)}") from exc


@router.post("/tts")
async def generate_speech(req: TTSRequest):
    try:
        audio_bytes = await synthesize_speech(
            req.text,
            voice_id=req.voice_id,
            speed=req.speed,
            provider=req.provider,
            model_id=req.model_id,
        )
        media_type = get_audio_media_type(req.provider)
        ext = "mp3" if "mpeg" in media_type else "wav"
        return Response(
            content=audio_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'inline; filename="speech.{ext}"',
                "Cache-Control": "public, max-age=86400",
            },
        )
    except VoiceConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except VoiceServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(exc)}") from exc


@router.post("/tts/stream")
async def stream_speech(req: TTSRequest):
    try:
        media_type = get_audio_media_type(req.provider)
        return StreamingResponse(
            synthesize_speech_stream(
                req.text,
                voice_id=req.voice_id,
                speed=req.speed,
                provider=req.provider,
                model_id=req.model_id,
            ),
            media_type=media_type,
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except VoiceConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS stream failed: {str(exc)}") from exc


@router.post("/voice/clone", response_model=VoiceCloneResponse)
async def clone_voice_endpoint(
    audio: UploadFile = File(...),
    name: str = Form(...),
    gender: str = Form(default="Male"),
    language: str = Form(default="en"),
    provider: Optional[str] = Form(default=None),
):
    """
    Clone a voice from an audio sample via ElevenLabs.
    """
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file provided.")
    try:
        result = await clone_voice(
            audio_bytes=audio_bytes,
            name=name,
            gender=gender,
            language=language,
            filename=audio.filename or "sample.wav",
            provider=provider,
        )
        return VoiceCloneResponse(**result)
    except VoiceConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except VoiceServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Voice cloning failed: {str(exc)}") from exc
