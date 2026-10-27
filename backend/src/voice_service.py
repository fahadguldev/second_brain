import hashlib
import logging
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional
import httpx
from src.config import settings

logger = logging.getLogger("second_brain.voice")

# Directory for caching synthesized audio to conserve Fish Audio credit quota
AUDIO_CACHE_DIR = Path("audio_cache")
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class VoiceConfigurationError(Exception):
    """Raised when Fish Audio credentials or configuration are missing."""
    pass


class VoiceServiceError(Exception):
    """Raised when Fish Audio API call fails."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def is_voice_configured() -> bool:
    """Check if Fish Audio API key is configured."""
    return bool(settings.FISH_AUDIO_API_KEY and settings.FISH_AUDIO_API_KEY.strip())


def get_voice_status() -> Dict[str, Any]:
    """Return public voice configuration status without exposing credentials."""
    configured = is_voice_configured()
    return {
        "provider": "fish_audio",
        "configured": configured,
        "voice_id": settings.FISH_AUDIO_VOICE_ID if configured else None,
        "tts_model": settings.FISH_AUDIO_TTS_MODEL if configured else None,
        "asr_model": settings.FISH_AUDIO_ASR_MODEL if configured else None,
    }


def _compute_cache_key(text: str, voice_id: Optional[str], model: str) -> str:
    """Generate deterministic hash for text and voice parameters."""
    raw = f"fish_audio:{voice_id or 'default'}:{model}:{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def synthesize_speech(text: str, voice_id: Optional[str] = None) -> bytes:
    """
    Synthesize speech using Fish Audio TTS API with persistent disk caching.
    Returns the MP3 audio bytes.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError(
            "Fish Audio API key is not configured. Set FISH_AUDIO_API_KEY in backend/.env"
        )

    clean_text = text.strip()
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    target_voice_id = voice_id or settings.FISH_AUDIO_VOICE_ID or None
    tts_model = settings.FISH_AUDIO_TTS_MODEL

    # Check disk cache first to conserve free quota
    cache_key = _compute_cache_key(clean_text, target_voice_id, tts_model)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    if cache_path.exists():
        logger.info(f"Fish Audio TTS cache hit for key {cache_key[:12]}")
        return cache_path.read_bytes()

    url = "https://api.fish.audio/v1/tts"
    headers = {
        "Authorization": f"Bearer {settings.FISH_AUDIO_API_KEY}",
        "Content-Type": "application/json",
    }

    payload: Dict[str, Any] = {
        "text": clean_text,
        "format": "mp3",
        "mp3_bitrate": 128,
        "latency": "normal",
    }
    if target_voice_id:
        payload["reference_id"] = target_voice_id

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(url, json=payload, headers=headers)

            if response.status_code != 200:
                logger.error(f"Fish Audio TTS failed [{response.status_code}]: {response.text}")
                error_detail = response.text
                try:
                    err_json = response.json()
                    error_detail = err_json.get("message") or err_json.get("detail") or response.text
                except Exception:
                    pass
                raise VoiceServiceError(
                    f"Fish Audio error ({response.status_code}): {error_detail}",
                    status_code=response.status_code,
                )

            audio_data = response.content

            # Persist to disk cache
            cache_path.write_bytes(audio_data)
            logger.info(f"Synthesized and cached Fish Audio TTS for key {cache_key[:12]} ({len(audio_data)} bytes)")
            return audio_data

    except httpx.RequestError as exc:
        logger.exception("HTTP error communicating with Fish Audio")
        raise VoiceServiceError(f"Network error connecting to Fish Audio: {str(exc)}", status_code=502) from exc


async def synthesize_speech_stream(
    text: str, voice_id: Optional[str] = None
) -> AsyncGenerator[bytes, None]:
    """
    Stream audio chunks directly from Fish Audio or from disk cache.
    """
    clean_text = text.strip()
    target_voice_id = voice_id or settings.FISH_AUDIO_VOICE_ID or None
    cache_key = _compute_cache_key(clean_text, target_voice_id, settings.FISH_AUDIO_TTS_MODEL)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    if cache_path.exists():
        with open(cache_path, "rb") as f:
            while chunk := f.read(16384):
                yield chunk
        return

    audio_bytes = await synthesize_speech(clean_text, target_voice_id)
    chunk_size = 16384
    for i in range(0, len(audio_bytes), chunk_size):
        yield audio_bytes[i : i + chunk_size]


async def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.webm",
    language: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Transcribe recorded user speech using Fish Audio ASR API (Speech-to-Text).
    Returns a dictionary with 'text', 'duration', and optional 'language'.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError(
            "Fish Audio API key is not configured. Set FISH_AUDIO_API_KEY in backend/.env"
        )

    if not audio_bytes:
        raise ValueError("Audio payload cannot be empty.")

    url = "https://api.fish.audio/v1/asr"
    headers = {
        "Authorization": f"Bearer {settings.FISH_AUDIO_API_KEY}",
        "model": settings.FISH_AUDIO_ASR_MODEL,
    }

    files = {
        "audio": (filename, audio_bytes, "application/octet-stream"),
    }
    data: Dict[str, str] = {}
    if language:
        data["language"] = language

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, files=files, data=data)

            if response.status_code != 200:
                logger.error(f"Fish Audio ASR failed [{response.status_code}]: {response.text}")
                error_detail = response.text
                try:
                    err_json = response.json()
                    error_detail = err_json.get("message") or err_json.get("detail") or response.text
                except Exception:
                    pass
                raise VoiceServiceError(
                    f"Fish Audio ASR error ({response.status_code}): {error_detail}",
                    status_code=response.status_code,
                )

            result = response.json()
            return {
                "text": result.get("text", "").strip(),
                "duration": result.get("duration", 0.0),
                "language": result.get("language_code") or result.get("language") or "en",
            }

    except httpx.RequestError as exc:
        logger.exception("HTTP error communicating with Fish Audio ASR")
        raise VoiceServiceError(f"Network error connecting to Fish Audio ASR: {str(exc)}", status_code=502) from exc
