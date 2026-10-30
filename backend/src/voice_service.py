import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
from src.config import settings
from src.voice_text import clean_text_for_speech
import src.elevenlabs_service as elevenlabs_svc
from src.elevenlabs_keys import elevenlabs_key_manager

logger = logging.getLogger("second_brain.voice")

AUDIO_CACHE_DIR = elevenlabs_svc.AUDIO_CACHE_DIR


class VoiceConfigurationError(Exception):
    """Raised when ElevenLabs credentials or voice configuration are missing."""
    pass


class VoiceServiceError(Exception):
    """Raised when ElevenLabs API call fails across all available keys or endpoints."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def is_elevenlabs_configured() -> bool:
    """Check if any ElevenLabs API keys are configured."""
    return elevenlabs_svc.is_elevenlabs_configured()


def is_voice_configured() -> bool:
    """Check if ElevenLabs voice synthesis is configured."""
    return is_elevenlabs_configured()


def get_active_provider(requested_provider: Optional[str] = None) -> str:
    """Always returns elevenlabs as the dedicated voice provider."""
    return "elevenlabs"


def get_audio_media_type(provider: Optional[str] = None) -> str:
    """Return appropriate MIME media type for ElevenLabs audio (audio/mpeg)."""
    return "audio/mpeg"


def get_voice_status() -> Dict[str, Any]:
    """Return ElevenLabs voice configuration and key pool health status."""
    configured = is_voice_configured()
    el_status = elevenlabs_svc.get_elevenlabs_status()
    return {
        "provider": "elevenlabs",
        "configured": configured,
        "voice_id": settings.ELEVENLABS_VOICE_ID if configured else None,
        "model_id": settings.ELEVENLABS_MODEL_ID if configured else None,
        "speed": 1.0,
        "available_providers": ["elevenlabs"] if configured else [],
        "key_pool": el_status.get("key_pool", {}),
    }


def _compute_cache_key(text: str, voice_id: Optional[str] = None, model_id: Optional[str] = None) -> str:
    """Generate deterministic hash for text and ElevenLabs synthesis parameters."""
    return elevenlabs_svc._compute_cache_key(
        text=text,
        voice_id=voice_id or settings.ELEVENLABS_VOICE_ID,
        model_id=model_id or settings.ELEVENLABS_MODEL_ID,
    )


async def synthesize_speech(
    text: str,
    voice_id: Optional[str] = None,
    speed: Optional[float] = None,
    provider: Optional[str] = None,
    model_id: Optional[str] = None,
) -> bytes:
    """
    Synthesize speech directly using ElevenLabs with disk caching and automated key rotation.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError(
            "ElevenLabs credentials are not configured. Set ELEVENLABS_API_KEY in backend/.env"
        )

    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    try:
        return await elevenlabs_svc.synthesize_speech(
            text=clean_text,
            voice_id=voice_id or settings.ELEVENLABS_VOICE_ID,
            model_id=model_id or settings.ELEVENLABS_MODEL_ID,
        )
    except elevenlabs_svc.ElevenLabsServiceError as exc:
        raise VoiceServiceError(str(exc), status_code=exc.status_code) from exc
    except elevenlabs_svc.ElevenLabsConfigurationError as exc:
        raise VoiceConfigurationError(str(exc)) from exc


async def synthesize_speech_stream(
    text: str,
    voice_id: Optional[str] = None,
    speed: Optional[float] = None,
    provider: Optional[str] = None,
    model_id: Optional[str] = None,
) -> AsyncGenerator[bytes, None]:
    """
    Stream audio chunks directly from ElevenLabs for ultra-low latency real-time voice calls.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError(
            "ElevenLabs credentials are not configured. Set ELEVENLABS_API_KEY in backend/.env"
        )

    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    try:
        async for chunk in elevenlabs_svc.synthesize_speech_stream(
            text=clean_text,
            voice_id=voice_id or settings.ELEVENLABS_VOICE_ID,
            model_id=model_id or settings.ELEVENLABS_MODEL_ID,
        ):
            yield chunk
    except elevenlabs_svc.ElevenLabsServiceError as exc:
        raise VoiceServiceError(str(exc), status_code=exc.status_code) from exc
    except elevenlabs_svc.ElevenLabsConfigurationError as exc:
        raise VoiceConfigurationError(str(exc)) from exc


async def clone_voice(
    audio_bytes: bytes,
    name: str,
    gender: str = "Male",
    language: str = "en",
    filename: str = "sample.wav",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Clone a voice using ElevenLabs voice cloning endpoint.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError("ElevenLabs credentials are not configured.")

    try:
        return await elevenlabs_svc.clone_voice(
            audio_bytes=audio_bytes,
            name=name,
            description=f"Cloned voice ({name}) for Second Brain",
            filename=filename,
        )
    except elevenlabs_svc.ElevenLabsServiceError as exc:
        raise VoiceServiceError(str(exc), status_code=exc.status_code) from exc
