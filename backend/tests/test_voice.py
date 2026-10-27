import asyncio
import unittest
from unittest.mock import patch, AsyncMock
from src.voice_service import (
    is_voice_configured,
    get_voice_status,
    _compute_cache_key,
    synthesize_speech,
    transcribe_audio,
    VoiceConfigurationError,
    AUDIO_CACHE_DIR,
)


class TestFishAudioVoiceService(unittest.TestCase):
    def test_voice_status_unconfigured(self):
        with patch("src.voice_service.settings.FISH_AUDIO_API_KEY", ""):
            self.assertFalse(is_voice_configured())
            status = get_voice_status()
            self.assertFalse(status["configured"])
            self.assertEqual(status["provider"], "fish_audio")
            self.assertIsNone(status["voice_id"])

    def test_voice_status_configured(self):
        with patch("src.voice_service.settings.FISH_AUDIO_API_KEY", "fish_live_key_xyz"), \
             patch("src.voice_service.settings.FISH_AUDIO_VOICE_ID", "voice_model_abc"):
            self.assertTrue(is_voice_configured())
            status = get_voice_status()
            self.assertTrue(status["configured"])
            self.assertEqual(status["voice_id"], "voice_model_abc")
            self.assertEqual(status["provider"], "fish_audio")

    def test_compute_cache_key_deterministic(self):
        key1 = _compute_cache_key("Hello world", "v1", "speech-1.5")
        key2 = _compute_cache_key("  Hello world  ", "v1", "speech-1.5")
        self.assertEqual(key1, key2)
        self.assertEqual(len(key1), 64)

    def test_synthesize_speech_raises_when_unconfigured(self):
        with patch("src.voice_service.settings.FISH_AUDIO_API_KEY", ""):
            with self.assertRaises(VoiceConfigurationError):
                asyncio.run(synthesize_speech("Hello"))

    def test_transcribe_audio_raises_when_unconfigured(self):
        with patch("src.voice_service.settings.FISH_AUDIO_API_KEY", ""):
            with self.assertRaises(VoiceConfigurationError):
                asyncio.run(transcribe_audio(b"fake-audio-bytes"))

    def test_synthesize_speech_uses_cache(self):
        text = "Unit test cached audio response for fish audio"
        voice = "mock_fish_voice"
        model = "speech-1.5"
        with patch("src.voice_service.settings.FISH_AUDIO_API_KEY", "test_key"), \
             patch("src.voice_service.settings.FISH_AUDIO_VOICE_ID", voice), \
             patch("src.voice_service.settings.FISH_AUDIO_TTS_MODEL", model):

            cache_key = _compute_cache_key(text, voice, model)
            cache_file = AUDIO_CACHE_DIR / f"{cache_key}.mp3"
            fake_audio = b"ID3\x03\x00\x00\x00fish-audio-mock-bytes"
            cache_file.write_bytes(fake_audio)

            try:
                result = asyncio.run(synthesize_speech(text, voice_id=voice))
                self.assertEqual(result, fake_audio)
            finally:
                if cache_file.exists():
                    cache_file.unlink()


if __name__ == "__main__":
    unittest.main()
