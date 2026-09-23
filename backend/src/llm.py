from typing import Optional
from src.config import settings
from src.gemini_keys import gemini_key_manager

_generation_model = settings.GENERATION_MODEL


class GeminiLLM:
    def __init__(self, model: str = _generation_model):
        self.model = model

    def generate(self, prompt: str, system_instructions: Optional[str] = None) -> str:
        """Generate text using the Gemini model."""
        try:
            full_prompt = prompt
            if system_instructions:
                full_prompt = f"{system_instructions}\n\nUser: {prompt}"

            response = gemini_key_manager.run(
                lambda client: client.models.generate_content(
                    model=self.model,
                    contents=full_prompt,
                )
            )
            return response.text
        except Exception as e:
            print(f"LLM generation error: {e}")
            return f"Error: Could not generate response."


# Global instance
llm = GeminiLLM()
