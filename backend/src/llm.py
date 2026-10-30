from collections.abc import Iterator
from typing import Optional
from google.genai import types
from src.config import settings
from src.gemini_keys import gemini_key_manager

_generation_model = settings.GENERATION_MODEL


class GenerationError(RuntimeError):
    """Raised when the generation provider cannot complete a response."""


class GeminiLLM:
    def __init__(self, model: str = _generation_model):
        self.model = model

    def generate(
        self,
        prompt: str,
        system_instructions: Optional[str] = None,
        thinking_budget: Optional[int] = 0,
    ) -> str:
        """Generate text using the Gemini model with low latency."""
        try:
            full_prompt = prompt
            if system_instructions:
                full_prompt = f"{system_instructions}\n\nUser: {prompt}"

            config = (
                types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget)
                )
                if thinking_budget is not None
                else None
            )

            response = gemini_key_manager.run(
                lambda client: client.models.generate_content(
                    model=self.model,
                    contents=full_prompt,
                    config=config,
                )
            )
            return response.text
        except Exception as e:
            raise GenerationError("Could not generate response") from e

    def generate_stream(
        self,
        prompt: str,
        system_instructions: Optional[str] = None,
        thinking_budget: Optional[int] = 0,
    ) -> Iterator[str]:
        """Stream text using the Gemini model with sub-second time-to-first-token."""
        full_prompt = prompt
        if system_instructions:
            full_prompt = f"{system_instructions}\n\nUser: {prompt}"

        config = (
            types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_budget=thinking_budget)
            )
            if thinking_budget is not None
            else None
        )

        try:
            for chunk in gemini_key_manager.stream(
                lambda client: client.models.generate_content_stream(
                    model=self.model,
                    contents=full_prompt,
                    config=config,
                )
            ):
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            raise GenerationError("Could not generate response") from e


# Global instance
llm = GeminiLLM()
