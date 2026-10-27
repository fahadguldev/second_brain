import hashlib
import logging
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional
import httpx
from src.config import settings
from src.jsf_keys import jsf_key_manager

logger = logging.getLogger("second_brain.voice")

JSF_API_BASE = "https://www.jsflabs.io/api/v1"
AUDIO_CACHE_DIR = Path("audio_cache")
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)


class VoiceConfigurationError(Exception):
    """Raised when JSF Labs credentials or configuration are missing."""
    pass


class VoiceServiceError(Exception):
    """Raised when JSF Labs API call fails across all available keys."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def is_voice_configured() -> bool:
    """Check if any JSF Labs API keys are configured."""
    return jsf_key_manager.has_keys


def get_voice_status() -> Dict[str, Any]:
    """Return public voice configuration and key pool health status."""
    configured = is_voice_configured()
    return {
        "provider": "jsflabs",
        "configured": configured,
        "voice_id": settings.JSF_VOICE_ID if configured else None,
        "speed": settings.JSF_TTS_SPEED if configured else 1.0,
        "key_pool": jsf_key_manager.get_status_summary(),
    }


def _compute_cache_key(text: str, voice_id: Optional[str], speed: float) -> str:
    """Generate deterministic hash for text and synthesis parameters."""
    raw = f"jsflabs:{voice_id or 'default'}:{speed}:{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def synthesize_speech(
    text: str,
    voice_id: Optional[str] = None,
    speed: Optional[float] = None,
) -> bytes:
    """
    Synthesize speech using JSF Labs TTS API with persistent disk caching
    and automatic recurring API key rotation on expiry, quota, or rate-limits.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError(
            "JSF Labs API key is not configured. Set JSF_API_KEY in backend/.env"
        )

    clean_text = text.strip()
    if not clean_text:
        raise ValueError("Text cannot be empty.")

    target_voice_id = voice_id or settings.JSF_VOICE_ID or ""
    target_speed = speed if speed is not None else settings.JSF_TTS_SPEED

    # Check local disk cache first to conserve requests
    cache_key = _compute_cache_key(clean_text, target_voice_id, target_speed)
    cache_path = AUDIO_CACHE_DIR / f"{cache_key}.wav"

    if cache_path.exists():
        logger.info(f"JSF Labs TTS cache hit for key {cache_key[:12]}")
        return cache_path.read_bytes()

    url = f"{JSF_API_BASE}/text-to-speech"
    payload: Dict[str, Any] = {
        "text": clean_text,
        "speed": target_speed,
    }
    if target_voice_id:
        payload["voice_id"] = target_voice_id

    total_keys = jsf_key_manager.total_keys()
    attempts = max(1, total_keys)
    errors: list[str] = []

    for attempt_idx in range(attempts):
        try:
            key_state = jsf_key_manager.reserve_key()
            active_key = key_state.api_key
        except RuntimeError as reserve_err:
            raise VoiceServiceError(str(reserve_err), status_code=429) from reserve_err

        headers = {
            "x-api-key": active_key,
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload, headers=headers)

                # Handle Rate Limiting (429) or Auth Expiry / Insufficient Credits (401, 402, 403)
                if response.status_code in (429, 401, 402, 403):
                    retry_after = None
                    try:
                        retry_after = int(response.headers.get("Retry-After", 0)) or None
                    except Exception:
                        pass
                    if not retry_after:
                        try:
                            err_data = response.json()
                            retry_after = err_data.get("error", {}).get("retryAfterSeconds")
                        except Exception:
                            pass

                    err_msg = f"Key ...{active_key[-6:]} returned status {response.status_code}: {response.text}"
                    logger.warning(f"Rotating JSF Labs key: {err_msg}")
                    jsf_key_manager.mark_key_failure(
                        active_key,
                        status_code=response.status_code,
                        reason=response.text,
                        retry_after_seconds=retry_after,
                    )
                    errors.append(f"Key ...{active_key[-6:]} [{response.status_code}]")
                    # Try next key in the pool
                    continue

                if response.status_code not in (200, 201):
                    err_text = response.text
                    jsf_key_manager.mark_key_failure(active_key, status_code=response.status_code, reason=err_text)
                    errors.append(f"Key ...{active_key[-6:]} [{response.status_code}]: {err_text}")
                    continue

                # Mark key as healthy
                jsf_key_manager.mark_key_success(active_key)

                # Process successful response
                content_type = response.headers.get("Content-Type", "")
                audio_bytes: bytes

                if "application/json" in content_type:
                    res_data = response.json()
                    audio_url = res_data.get("audio_url") or res_data.get("url")
                    if not audio_url:
                        raise VoiceServiceError(f"JSF Labs returned no audio_url: {response.text}")

                    # Download the studio-mastered audio file
                    audio_res = await client.get(audio_url, timeout=30.0)
                    if audio_res.status_code != 200:
                        raise VoiceServiceError(
                            f"Failed to download audio from {audio_url} [{audio_res.status_code}]"
                        )
                    audio_bytes = audio_res.content
                else:
                    audio_bytes = response.content

                # Cache audio file locally
                cache_path.write_bytes(audio_bytes)
                logger.info(f"Synthesized and cached JSF Labs TTS ({len(audio_bytes)} bytes) using key ...{active_key[-6:]}")
                return audio_bytes

        except httpx.RequestError as exc:
            logger.exception("HTTP network error communicating with JSF Labs")
            jsf_key_manager.mark_key_failure(active_key, status_code=502, reason=str(exc))
            errors.append(f"Key ...{active_key[-6:]} Network Error: {str(exc)}")
            continue

    # If all keys failed
    raise VoiceServiceError(
        f"All JSF Labs API keys failed or were exhausted. Errors: {' | '.join(errors)}",
        status_code=502,
    )


async def synthesize_speech_stream(
    text: str,
    voice_id: Optional[str] = None,
    speed: Optional[float] = None,
) -> AsyncGenerator[bytes, None]:
    """
    Stream audio chunks for real-time playback.
    """
    audio_bytes = await synthesize_speech(text, voice_id=voice_id, speed=speed)
    chunk_size = 16384
    for i in range(0, len(audio_bytes), chunk_size):
        yield audio_bytes[i : i + chunk_size]


async def clone_voice(
    audio_bytes: bytes,
    name: str,
    gender: str = "Male",
    language: str = "en",
    filename: str = "sample.wav",
) -> Dict[str, Any]:
    """
    Clone a voice using JSF Labs voice cloning endpoint:
    POST https://www.jsflabs.io/api/v1/voice-clone
    Returns portable voice_id.
    """
    if not is_voice_configured():
        raise VoiceConfigurationError("JSF Labs API key is not configured.")

    url = f"{JSF_API_BASE}/voice-clone"
    files = {
        "audio": (filename, audio_bytes, "audio/wav"),
    }
    data = {
        "name": name,
        "gender": gender,
        "language": language,
    }

    key_state = jsf_key_manager.reserve_key()
    headers = {
        "x-api-key": key_state.api_key,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, files=files, data=data)
        if response.status_code not in (200, 201):
            raise VoiceServiceError(
                f"JSF Labs voice cloning failed [{response.status_code}]: {response.text}",
                status_code=response.status_code,
            )
        res_json = response.json()
        voice_id = res_json.get("voice_id")
        return {
            "success": True,
            "voice_id": voice_id,
            "name": name,
            "gender": gender,
            "language": language,
        }
