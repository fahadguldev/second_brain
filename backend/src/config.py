import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./second_brain.db")
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "change-me-in-production")
    COOKIE_SECURE: bool = (os.getenv("COOKIE_SECURE") or os.getenv("COOKIES_SECURE", "False")).lower() == "true"
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax")
    COOKIE_DOMAIN: str | None = os.getenv("COOKIE_DOMAIN") or None
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    ADMIN_EMAILS: set[str] = {
        email.strip().lower() for email in os.getenv("ADMIN_EMAILS", "").split(",") if email.strip()
    }

    # Qdrant
    QDRANT_URL: str = os.getenv("QDRANT_URL", "")
    QDRANT_API_KEY: str = os.getenv("QDRANT_API_KEY", "")
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "second_brain")

    # Gemini
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_API_KEYS: list[str] = list(dict.fromkeys(
        val.strip()
        for k, val in os.environ.items()
        if k.startswith("GEMINI_API_KEY") and val.strip()
    ))
    # Model names from Google AI Studio
    # - Embedding model: models/gemini-embedding-2 produces 3072-dim vectors (matches knowledge_base)
    # - Generation model: gemini-3.1-lite
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-2")
    EMBEDDING_DIMENSION: int = int(os.getenv("EMBEDDING_DIMENSION", "3072"))
    GENERATION_MODEL: str = os.getenv("GENERATION_MODEL", "gemini-3.1-flash-lite")
    RAG_SCORE_THRESHOLD: float = float(os.getenv("RAG_SCORE_THRESHOLD", "0.65"))

    # Rate limiting
    RATE_LIMIT_PER_MIN: int = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
    RATE_LIMIT_PER_DAY: int = int(os.getenv("RATE_LIMIT_PER_DAY", "1000"))

    # CORS
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,https://second-brain-phi-opal.vercel.app",
        ).split(",")
        if o.strip()
    ]

    # App
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
