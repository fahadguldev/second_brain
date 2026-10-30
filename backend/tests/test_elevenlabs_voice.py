import asyncio
import unittest
from unittest.mock import patch, MagicMock
from src.elevenlabs_keys import ElevenLabsKeyManager, KeyState
from src.voice_text import clean_text_for_speech
from src.elevenlabs_service import (
    is_elevenlabs_configured,
    get_elevenlabs_status,
    _compute_cache_key as compute_el_cache_key,
    synthesize_speech as el_synthesize_speech,
    ElevenLabsConfigurationError,
    ElevenLabsServiceError,
    AUDIO_CACHE_DIR,
)
from src.voice_service import (
    get_active_provider,
    get_audio_media_type,
    synthesize_speech,
    VoiceConfigurationError,
)


class TestElevenLabsKeyManager(unittest.TestCase):
    def test_key_pool_discovery_and_reserve(self):
        manager = ElevenLabsKeyManager(["el_key_1", "el_key_2"])
        self.assertEqual(manager.total_keys(), 2)
        self.assertEqual(manager.active_keys_count(), 2)

        # Round-robin reservation
        k1 = manager.reserve_key()
        k2 = manager.reserve_key()
        self.assertEqual(k1.api_key, "el_key_1")
        self.assertEqual(k2.api_key, "el_key_2")

    def test_key_rotation_on_429(self):
        manager = ElevenLabsKeyManager(["el_primary", "el_backup"])
        k1 = manager.reserve_key()
        self.assertEqual(k1.api_key, "el_primary")

        # Mark primary as rate-limited
        manager.mark_key_failure("el_primary", status_code=429, retry_after_seconds=30)
        self.assertEqual(manager.active_keys_count(), 1)

        # Next reserve must choose backup
        k_next = manager.reserve_key()
        self.assertEqual(k_next.api_key, "el_backup")

    def test_key_rotation_on_quota_exhausted_402(self):
        manager = ElevenLabsKeyManager(["quota_exhausted_key", "fresh_key"])
        manager.mark_key_failure("quota_exhausted_key", status_code=402, reason="Quota exceeded")

        k_active = manager.reserve_key()
        self.assertEqual(k_active.api_key, "fresh_key")

    def test_all_keys_exhausted_raises(self):
        manager = ElevenLabsKeyManager(["single_key"])
        manager.mark_key_failure("single_key", status_code=429, retry_after_seconds=60)
        with self.assertRaises(RuntimeError):
            manager.reserve_key()


class TestVoiceTextCleaner(unittest.TestCase):
    def test_clean_markdown_formatting(self):
        raw = """
        # Heading 1
        Hello **world**! Here is a [link to docs](https://example.com) and some `inline code`.
        
        ```python
        def secret():
            return 42
        ```
        
        - Point 1
        - Point 2 with [1] citation
        Fahad Gul: That is great!
        """
        cleaned = clean_text_for_speech(raw)
        self.assertNotIn("#", cleaned)
        self.assertNotIn("**", cleaned)
        self.assertNotIn("https://", cleaned)
        self.assertNotIn("[1]", cleaned)
        self.assertNotIn("def secret():", cleaned)
        self.assertNotIn("Fahad Gul:", cleaned)
        self.assertIn("Hello world", cleaned)
        self.assertIn("link to docs", cleaned)
        self.assertIn("That is great", cleaned)


class TestElevenLabsService(unittest.TestCase):
    def test_compute_cache_key_deterministic(self):
        key1 = compute_el_cache_key("Hello Fahad", "voice_123", "eleven_flash_v2_5")
        key2 = compute_el_cache_key("  Hello Fahad  ", "voice_123", "eleven_flash_v2_5")
        self.assertEqual(key1, key2)
        self.assertEqual(len(key1), 64)

    def test_synthesize_speech_uses_cache(self):
        text = "Hello, this is a test audio response for ElevenLabs caching."
        voice = "pNInz6obpgDQGcFmaJgB"
        model = "eleven_flash_v2_5"
        clean_text = clean_text_for_speech(text)
        cache_key = compute_el_cache_key(clean_text, voice, model)
        cache_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"
        fake_mp3 = b"ID3\x03\x00\x00\x00\x00\x00\x00mock-mp3-bytes"
        cache_file.write_bytes(fake_mp3)

        try:
            with patch("src.elevenlabs_service.is_elevenlabs_configured", return_value=True):
                result = asyncio.run(el_synthesize_speech(text, voice_id=voice, model_id=model))
                self.assertEqual(result, fake_mp3)
        finally:
            if cache_file.exists():
                cache_file.unlink()

    def test_synthesize_speech_raises_when_unconfigured(self):
        with patch("src.elevenlabs_service.is_elevenlabs_configured", return_value=False):
            with self.assertRaises(ElevenLabsConfigurationError):
                asyncio.run(el_synthesize_speech("Hello"))


class TestVoiceServiceOrchestrator(unittest.TestCase):
    def test_provider_resolution(self):
        with patch("src.voice_service.is_elevenlabs_configured", return_value=True), \
             patch("src.voice_service.is_jsf_configured", return_value=True):
            self.assertEqual(get_active_provider("elevenlabs"), "elevenlabs")
            self.assertEqual(get_active_provider("jsflabs"), "jsflabs")

    def test_audio_media_types(self):
        self.assertEqual(get_audio_media_type("elevenlabs"), "audio/mpeg")
        self.assertEqual(get_audio_media_type("jsflabs"), "audio/wav")


if __name__ == "__main__":
    unittest.main()
