import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Qdrant
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "second_brain")

    # Gemini
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_API_KEYS: list[str] = [
        key
        for key in [
            os.getenv("GEMINI_API_KEY", ""),
            os.getenv("GEMINI_API_KEY_1", ""),
            os.getenv("GEMINI_API_KEY_2", ""),
            os.getenv("GEMINI_API_KEY_3", ""),
            os.getenv("GEMINI_API_KEY_4", ""),
            os.getenv("GEMINI_API_KEY_5", ""),
        ]
        if key
    ]
    # Model names from Google AI Studio
    # - Embedding model: models/gemini-embedding-001 produces 3072-dim vectors (matches knowledge_base)
    # - Generation model: gemini-flash-latest
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")
    GENERATION_MODEL: str = os.getenv("GENERATION_MODEL", "gemini-flash-latest")

    # Rate limiting
    RATE_LIMIT_PER_MIN: int = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
    RATE_LIMIT_PER_DAY: int = int(os.getenv("RATE_LIMIT_PER_DAY", "1000"))

    # App
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
