import hashlib
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
from src.config import settings
from src.elevenlabs_keys import elevenlabs_key_manager
from src.voice_text import clean_text_for_speech

logger = logging.getLogger("second_brain.elevenlabs")

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


def _get_audio_cache_dir() -> Path:
    """
    Determine a writable audio cache directory.
    Falls back to /tmp/second_brain_audio_cache in serverless environments.
    """
    if os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        cache_dir = Path(tempfile.gettempdir()) / "second_brain_audio_cache"
    else:
        cache_dir = Path("audio_cache")

    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
    except (OSError, PermissionError) as exc:
        logger.warning(f"Could not create cache directory at {cache_dir} ({exc}); falling back to temp dir.")
        cache_dir = Path(tempfile.gettempdir()) / "second_brain_audio_cache"
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"Failed to create temp audio cache directory: {e}")
    return cache_dir


AUDIO_CACHE_DIR = _get_audio_cache_dir()


class ElevenLabsConfigurationError(Exception):
    """Raised when ElevenLabs credentials or voice configuration are missing."""
    pass


class ElevenLabsServiceError(Exception):
    """Raised when ElevenLabs API call fails across all available keys or endpoints."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def is_elevenlabs_configured() -> bool:
    """Check if any ElevenLabs API keys are configured."""
    return elevenlabs_key_manager.has_keys


def get_elevenlabs_status() -> Dict[str, Any]:
    """Return ElevenLabs voice configuration and key pool health status."""
    configured = is_elevenlabs_configured()
    return {
        "provider": "elevenlabs",
        "configured": configured,
        "voice_id": settings.ELEVENLABS_VOICE_ID if configured else None,
        "model_id": settings.ELEVENLABS_MODEL_ID if configured else None,
        "latency_optimization": settings.ELEVENLABS_LATENCY_OPTIMIZATION if configured else None,
        "key_pool": elevenlabs_key_manager.get_status_summary(),
    }


def _compute_cache_key(text: str, voice_id: Optional[str], model_id: Optional[str]) -> str:
    """Generate deterministic hash for text and ElevenLabs synthesis parameters."""
    raw = f"elevenlabs:{voice_id or 'default'}:{model_id or 'default'}:{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def synthesize_speech(
    text: str,
    voice_id: Optional[str] = None,
    model_id: Optional[str] = None,
    latency_optimization: Optional[int] = None,
) -> bytes:
    """
    Synthesize speech using ElevenLabs Text-to-Speech API with persistent disk caching
    and automatic recurring API key rotation on expiry, quota limits, or rate-limits.
    Returns MP3 audio bytes.
    """
    if not is_elevenlabs_configured():
        raise ElevenLabsConfigurationError(
            "ElevenLabs credentials are not configured. Set ELEVENLABS_API_KEY in backend/.env"
        )

    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    target_voice_id = voice_id or settings.ELEVENLABS_VOICE_ID or "pNInz6obpgDQGcFmaJgB"
    target_model_id = model_id or settings.ELEVENLABS_MODEL_ID or "eleven_flash_v2_5"
    target_opt = (
        latency_optimization
        if latency_optimization is not None
        else settings.ELEVENLABS_LATENCY_OPTIMIZATION
    )

    # Check local disk cache first
    cache_key = _compute_cache_key(clean_text, target_voice_id, target_model_id)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    try:
        if cache_path.exists():
            logger.info(f"ElevenLabs TTS cache hit for key {cache_key[:12]}")
            return cache_path.read_bytes()
    except Exception as exc:
        logger.warning(f"Failed reading audio cache: {exc}")

    url = f"{ELEVENLABS_API_BASE}/text-to-speech/{target_voice_id}"
    params = {
        "output_format": "mp3_44100_128",
        "optimize_streaming_latency": target_opt,
    }
    payload: Dict[str, Any] = {
        "text": clean_text,
        "model_id": target_model_id,
        "voice_settings": {
            "stability": settings.ELEVENLABS_STABILITY,
            "similarity_boost": settings.ELEVENLABS_SIMILARITY_BOOST,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    total_keys = elevenlabs_key_manager.total_keys()
    attempts = max(1, total_keys)
    errors: List[str] = []

    for _ in range(attempts):
        try:
            key_state = elevenlabs_key_manager.reserve_key()
            active_key = key_state.api_key
        except RuntimeError as reserve_err:
            raise ElevenLabsServiceError(str(reserve_err), status_code=429) from reserve_err

        headers = {
            "xi-api-key": active_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                response = await client.post(url, json=payload, headers=headers, params=params)

                err_detail = response.text
                retry_after = None
                try:
                    err_json = response.json()
                    detail_obj = err_json.get("detail", {})
                    if isinstance(detail_obj, dict):
                        err_detail = detail_obj.get("message") or str(detail_obj)
                    elif isinstance(detail_obj, str):
                        err_detail = detail_obj
                except Exception:
                    pass

                try:
                    retry_after = int(response.headers.get("Retry-After", 0)) or None
                except Exception:
                    pass

                # Handle Rate Limiting (429) or Auth Expiry / Insufficient Credits (401, 402, 403)
                if response.status_code in (429, 401, 402, 403):
                    err_msg = f"Key ...{active_key[-6:]} returned [{response.status_code}]: {err_detail}"
                    logger.warning(f"Rotating ElevenLabs key: {err_msg}")
                    elevenlabs_key_manager.mark_key_failure(
                        active_key,
                        status_code=response.status_code,
                        reason=err_detail,
                        retry_after_seconds=retry_after,
                    )
                    errors.append(f"Key ...{active_key[-6:]} [{response.status_code}]: {err_detail}")
                    continue

                if response.status_code not in (200, 201):
                    elevenlabs_key_manager.mark_key_failure(active_key, status_code=response.status_code, reason=err_detail)
                    errors.append(f"Key ...{active_key[-6:]} [{response.status_code}]: {err_detail}")
                    continue

                # Success
                elevenlabs_key_manager.mark_key_success(active_key)
                audio_bytes = response.content

                try:
                    cache_path.write_bytes(audio_bytes)
                except Exception as cache_err:
                    logger.warning(f"Failed to write audio cache: {cache_err}")

                logger.info(
                    f"Synthesized and cached ElevenLabs TTS ({len(audio_bytes)} bytes) using voice {target_voice_id}"
                )
                return audio_bytes

        except httpx.RequestError as exc:
            logger.exception("HTTP network error communicating with ElevenLabs")
            elevenlabs_key_manager.mark_key_failure(active_key, status_code=502, reason=str(exc))
            errors.append(f"Key ...{active_key[-6:]} Network Error: {str(exc)}")
            continue

    raise ElevenLabsServiceError(
        f"All ElevenLabs API keys failed or were exhausted. Errors: {' | '.join(errors)}",
        status_code=502,
    )


async def synthesize_speech_stream(
    text: str,
    voice_id: Optional[str] = None,
    model_id: Optional[str] = None,
    latency_optimization: Optional[int] = None,
) -> AsyncGenerator[bytes, None]:
    """
    Stream audio chunks directly from ElevenLabs for ultra-low latency real-time voice calls.
    Also collects complete audio to disk cache so subsequent requests hit cache.
    """
    if not is_elevenlabs_configured():
        raise ElevenLabsConfigurationError("ElevenLabs credentials are not configured.")

    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    target_voice_id = voice_id or settings.ELEVENLABS_VOICE_ID or "pNInz6obpgDQGcFmaJgB"
    target_model_id = model_id or settings.ELEVENLABS_MODEL_ID or "eleven_flash_v2_5"
    target_opt = (
        latency_optimization
        if latency_optimization is not None
        else settings.ELEVENLABS_LATENCY_OPTIMIZATION
    )

    # Check local disk cache first: if already cached, stream chunks from cache
    cache_key = _compute_cache_key(clean_text, target_voice_id, target_model_id)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.mp3"

    try:
        if cache_path.exists():
            logger.info(f"ElevenLabs TTS stream cache hit for key {cache_key[:12]}")
            cached_bytes = cache_path.read_bytes()
            chunk_size = 8192
            for i in range(0, len(cached_bytes), chunk_size):
                yield cached_bytes[i : i + chunk_size]
            return
    except Exception as exc:
        logger.warning(f"Failed reading audio cache: {exc}")

    url = f"{ELEVENLABS_API_BASE}/text-to-speech/{target_voice_id}/stream"
    params = {
        "output_format": "mp3_44100_128",
        "optimize_streaming_latency": target_opt,
    }
    payload: Dict[str, Any] = {
        "text": clean_text,
        "model_id": target_model_id,
        "voice_settings": {
            "stability": settings.ELEVENLABS_STABILITY,
            "similarity_boost": settings.ELEVENLABS_SIMILARITY_BOOST,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    key_state = elevenlabs_key_manager.reserve_key()
    active_key = key_state.api_key
    headers = {
        "xi-api-key": active_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    collected_chunks: List[bytes] = []

    async with httpx.AsyncClient(timeout=45.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers, params=params) as response:
            if response.status_code not in (200, 201):
                err_text = await response.aread()
                elevenlabs_key_manager.mark_key_failure(
                    active_key,
                    status_code=response.status_code,
                    reason=err_text.decode("utf-8", errors="ignore"),
                )
                raise ElevenLabsServiceError(
                    f"ElevenLabs stream failed ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}",
                    status_code=response.status_code,
                )

            elevenlabs_key_manager.mark_key_success(active_key)
            async for chunk in response.aiter_bytes():
                if chunk:
                    collected_chunks.append(chunk)
                    yield chunk

    # Save complete audio stream to disk cache
    if collected_chunks:
        try:
            full_audio = b"".join(collected_chunks)
            cache_path.write_bytes(full_audio)
        except Exception as cache_err:
            logger.warning(f"Failed to write audio cache from stream: {cache_err}")


async def clone_voice(
    audio_bytes: bytes,
    name: str,
    description: str = "Cloned creator voice for Second Brain",
    filename: str = "sample.wav",
) -> Dict[str, Any]:
    """
    Clone a voice using ElevenLabs Instant Voice Cloning endpoint:
    POST https://api.elevenlabs.io/v1/voices/add
    Returns dict containing the new voice_id.
    """
    if not is_elevenlabs_configured():
        raise ElevenLabsConfigurationError("ElevenLabs credentials are not configured.")

    url = f"{ELEVENLABS_API_BASE}/voices/add"
    key_state = elevenlabs_key_manager.reserve_key()
    headers = {
        "xi-api-key": key_state.api_key,
    }

    files = {
        "files": (filename, audio_bytes, "audio/mpeg" if filename.endswith(".mp3") else "audio/wav"),
    }
    data = {
        "name": name,
        "description": description,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, files=files, data=data)
        if response.status_code not in (200, 201):
            raise ElevenLabsServiceError(
                f"ElevenLabs voice cloning failed [{response.status_code}]: {response.text}",
                status_code=response.status_code,
            )
        res_json = response.json()
        voice_id = res_json.get("voice_id")
        return {
            "success": True,
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "provider": "elevenlabs",
        }


async def list_voices() -> List[Dict[str, Any]]:
    """Fetch all available voices from ElevenLabs account."""
    if not is_elevenlabs_configured():
        return []

    url = f"{ELEVENLABS_API_BASE}/voices"
    key_state = elevenlabs_key_manager.reserve_key()
    headers = {
        "xi-api-key": key_state.api_key,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 200:
            res_json = response.json()
            return res_json.get("voices", [])
        return []
