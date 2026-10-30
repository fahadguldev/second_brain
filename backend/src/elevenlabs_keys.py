import logging
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import List, Optional
from src.config import settings

logger = logging.getLogger("second_brain.elevenlabs_keys")


@dataclass
class KeyState:
    api_key: str
    minute_calls: deque[float] = field(default_factory=deque)
    cooldown_until: float = 0.0
    failed_attempts: int = 0
    last_error: Optional[str] = None


class ElevenLabsKeyManager:
    """
    Manages a pool of recurring/rotating ElevenLabs API keys.
    Automatically rotates to the next available key if a key is rate-limited (429),
    unauthorized (401), or out of quota/credits (402/403).
    """

    def __init__(self, keys: Optional[List[str]] = None) -> None:
        raw_keys = keys if keys is not None else settings.ELEVENLABS_API_KEYS
        unique_keys = list(dict.fromkeys(k.strip() for k in raw_keys if k and k.strip()))
        self._states = [KeyState(api_key=key) for key in unique_keys]
        self._lock = Lock()
        self._next_index = 0

    @property
    def has_keys(self) -> bool:
        return len(self._states) > 0

    def total_keys(self) -> int:
        return len(self._states)

    def active_keys_count(self) -> int:
        now = time.time()
        with self._lock:
            return sum(1 for s in self._states if s.cooldown_until <= now)

    def _prune(self, state: KeyState, now: float) -> None:
        minute_cutoff = now - 60.0
        while state.minute_calls and state.minute_calls[0] < minute_cutoff:
            state.minute_calls.popleft()

    def reserve_key(self) -> KeyState:
        with self._lock:
            now = time.time()
            count = len(self._states)
            if count == 0:
                raise RuntimeError("No ElevenLabs API keys configured in environment.")

            # Search round-robin for a healthy key
            for offset in range(count):
                idx = (self._next_index + offset) % count
                state = self._states[idx]
                self._prune(state, now)

                # Skip if in cooldown
                if state.cooldown_until > now:
                    continue

                # Conservative rate limit protection per key (max 60 req/min)
                if len(state.minute_calls) >= 60:
                    continue

                state.minute_calls.append(now)
                self._next_index = (idx + 1) % count
                return state

        # If all keys are currently cooling down, return the one that will recover earliest
        earliest = min(self._states, key=lambda s: s.cooldown_until)
        wait_seconds = max(0.5, earliest.cooldown_until - time.time())
        raise RuntimeError(
            f"All ElevenLabs API keys are rate-limited or cooling down. Next key recovers in {wait_seconds:.1f}s."
        )

    def mark_key_failure(
        self,
        api_key: str,
        status_code: int,
        reason: str = "",
        retry_after_seconds: Optional[int] = None,
    ) -> None:
        now = time.time()
        with self._lock:
            for state in self._states:
                if state.api_key == api_key:
                    state.failed_attempts += 1
                    state.last_error = f"[{status_code}] {reason}"

                    if status_code == 429:
                        # Rate limit: respect Retry-After or default 60s cooldown
                        cooldown = float(retry_after_seconds) if retry_after_seconds else 60.0
                        state.cooldown_until = now + cooldown
                        logger.warning(
                            f"ElevenLabs key ...{api_key[-6:]} rate-limited (429). Cooling down for {cooldown}s."
                        )
                    elif status_code in (401, 403):
                        # Key expired or invalid: cooldown for 1 hour so other keys take over
                        state.cooldown_until = now + 3600.0
                        logger.error(
                            f"ElevenLabs key ...{api_key[-6:]} authentication failed ({status_code}). Cooled down for 1hr."
                        )
                    elif status_code == 402:
                        # Out of quota/credits: cooldown for 2 hours
                        state.cooldown_until = now + 7200.0
                        logger.error(
                            f"ElevenLabs key ...{api_key[-6:]} out of credits (402). Cooled down for 2hr."
                        )
                    else:
                        state.cooldown_until = now + 15.0
                    break

    def mark_key_success(self, api_key: str) -> None:
        with self._lock:
            for state in self._states:
                if state.api_key == api_key:
                    state.failed_attempts = 0
                    state.last_error = None
                    break

    def get_status_summary(self) -> dict:
        now = time.time()
        with self._lock:
            total = len(self._states)
            active = sum(1 for s in self._states if s.cooldown_until <= now)
            return {
                "total_keys": total,
                "active_keys": active,
                "cooling_down": total - active,
                "keys": [
                    {
                        "prefix": f"...{s.api_key[-6:]}" if len(s.api_key) >= 6 else "masked",
                        "status": "ready" if s.cooldown_until <= now else "cooling_down",
                        "cooldown_remaining_sec": max(0, int(s.cooldown_until - now)),
                        "calls_last_minute": len(s.minute_calls),
                        "failed_attempts": s.failed_attempts,
                        "last_error": s.last_error,
                    }
                    for s in self._states
                ],
            }


elevenlabs_key_manager = ElevenLabsKeyManager()
