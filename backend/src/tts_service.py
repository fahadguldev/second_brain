import hashlib
import logging
from pathlib import Path
from typing import AsyncGenerator, Optional
import httpx
from src.config import settings

logger = logging.getLogger("second_brain.tts")

# Directory for caching synthesized audio to conserve ElevenLabs character credits
AUDIO_CACHE_DIR = Path("audio_cache")
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class TTSConfigurationError(Exception):
    """Raised when ElevenLabs credentials or settings are missing."""
    pass


class TTSServiceError(Exception):
    """Raised when ElevenLabs API call fails."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def is_tts_configured() -> bool:
    """Check if ElevenLabs API key is configured."""
    return bool(settings.ELEVENLABS_API_KEY and settings.ELEVENLABS_API_KEY.strip())


def get_tts_status() -> dict:
    """Return public TTS configuration metadata without leaking secrets."""
    return {
        "configured": is_tts_configured(),
        "voice_id": settings.ELEVENLABS_VOICE_ID if is_tts_configured() else None,
        "model_id": settings.ELEVENLABS_MODEL_ID if is_tts_configured() else None,
    }


def _compute_cache_key(text: str, voice_id: str, model_id: str) -> str:
    """Generate deterministic hash for text and voice settings."""
    raw = f"{voice_id}:{model_id}:{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def synthesize_speech(text: str, voice_id: Optional[str] = None) -> bytes:
    """
    Synthesize speech using ElevenLabs API with persistent disk caching.
    Returns the MP3 audio bytes.
    """
    if not is_tts_configured():
        raise TTSConfigurationError(
            "ElevenLabs API key is not configured. Set ELEVENLABS_API_KEY in backend/.env"
        )

    clean_text = text.strip()
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    target_voice_id = voice_id or settings.ELEVENLABS_VOICE_ID
    model_id = settings.ELEVENLABS_MODEL_ID

    # Check disk cache first to conserve character quota
    cache_key = _compute_cache_key(clean_text, target_voice_id, model_id)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    if cache_path.exists():
        logger.info(f"TTS cache hit for key {cache_key[:12]}")
        return cache_path.read_bytes()

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{target_voice_id}"
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": clean_text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"ElevenLabs TTS failed [{response.status_code}]: {response.text}")
                error_detail = response.text
                try:
                    error_json = response.json()
                    error_detail = error_json.get("detail", {}).get("message", response.text)
                except Exception:
                    pass
                raise TTSServiceError(
                    f"ElevenLabs error ({response.status_code}): {error_detail}",
                    status_code=response.status_code,
                )

            audio_data = response.content
            
            # Persist to disk cache
            cache_path.write_bytes(audio_data)
            logger.info(f"Synthesized and cached TTS for key {cache_key[:12]} ({len(audio_data)} bytes)")
            return audio_data

    except httpx.RequestError as exc:
        logger.exception("HTTP error communicating with ElevenLabs")
        raise TTSServiceError(f"Network error connecting to ElevenLabs: {str(exc)}", status_code=502) from exc


async def synthesize_speech_stream(
    text: str, voice_id: Optional[str] = None
) -> AsyncGenerator[bytes, None]:
    """
    Stream audio chunks directly from ElevenLabs or from disk cache.
    """
    clean_text = text.strip()
    target_voice_id = voice_id or settings.ELEVENLABS_VOICE_ID
    model_id = settings.ELEVENLABS_MODEL_ID
    cache_key = _compute_cache_key(clean_text, target_voice_id, model_id)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    if cache_path.exists():
        # Stream from cache in 16KB chunks
        with open(cache_path, "rb") as f:
            while chunk := f.read(16384):
                yield chunk
        return

    # If not cached, synthesize and yield chunks
    audio_bytes = await synthesize_speech(clean_text, target_voice_id)
    chunk_size = 16384
    for i in range(0, len(audio_bytes), chunk_size):
        yield audio_bytes[i : i + chunk_size]
