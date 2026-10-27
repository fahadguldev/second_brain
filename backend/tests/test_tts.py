import asyncio
import unittest
from pathlib import Path
from unittest.mock import patch
from src.tts_service import (
    is_tts_configured,
    get_tts_status,
    _compute_cache_key,
    synthesize_speech,
    TTSConfigurationError,
    AUDIO_CACHE_DIR,
)


class TestTTSService(unittest.TestCase):
    def test_tts_status_unconfigured(self):
        with patch("src.tts_service.settings.ELEVENLABS_API_KEY", ""):
            self.assertFalse(is_tts_configured())
            status = get_tts_status()
            self.assertFalse(status["configured"])
            self.assertIsNone(status["voice_id"])

    def test_tts_status_configured(self):
        with patch("src.tts_service.settings.ELEVENLABS_API_KEY", "test_key_123"):
            with patch("src.tts_service.settings.ELEVENLABS_VOICE_ID", "voice_abc"):
                self.assertTrue(is_tts_configured())
                status = get_tts_status()
                self.assertTrue(status["configured"])
                self.assertEqual(status["voice_id"], "voice_abc")

    def test_compute_cache_key_deterministic(self):
        key1 = _compute_cache_key("Hello world", "v1", "m1")
        key2 = _compute_cache_key("  Hello world  ", "v1", "m1")
        self.assertEqual(key1, key2)
        self.assertEqual(len(key1), 64)

    def test_synthesize_speech_raises_when_unconfigured(self):
        with patch("src.tts_service.settings.ELEVENLABS_API_KEY", ""):
            with self.assertRaises(TTSConfigurationError):
                asyncio.run(synthesize_speech("Hello"))

    def test_synthesize_speech_uses_cache(self):
        text = "Unit test cached audio response"
        voice = "mock_voice"
        model = "mock_model"
        with patch("src.tts_service.settings.ELEVENLABS_API_KEY", "test_key"), \
             patch("src.tts_service.settings.ELEVENLABS_VOICE_ID", voice), \
             patch("src.tts_service.settings.ELEVENLABS_MODEL_ID", model):
            
            cache_key = _compute_cache_key(text, voice, model)
            cache_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"
            fake_audio = b"ID3\x03\x00\x00\x00fake-mp3-bytes"
            cache_file.write_bytes(fake_audio)

            try:
                result = asyncio.run(synthesize_speech(text, voice_id=voice))
                self.assertEqual(result, fake_audio)
            finally:
                if cache_file.exists():
                    cache_file.unlink()


if __name__ == "__main__":
    unittest.main()
