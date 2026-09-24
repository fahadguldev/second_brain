import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # Qdrant
    QDRANT_URL: str = os.getenv("QDRANT_URL", "")
    QDRANT_API_KEY: str = os.getenv("QDRANT_API_KEY", "")
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
    # - Generation model: gemini-3.1-lite
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")
    GENERATION_MODEL: str = os.getenv("GENERATION_MODEL", "gemini-3.1-flash-lite")

    # Rate limiting
    RATE_LIMIT_PER_MIN: int = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
    RATE_LIMIT_PER_DAY: int = int(os.getenv("RATE_LIMIT_PER_DAY", "1000"))

    # CORS
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,https://second-brain-phi-opal.vercel.app",
        ).split(",")
        if o.strip()
    ]

    # App
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
