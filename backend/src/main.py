from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings
from src.chat_database import init_chat_database

app = FastAPI(
    title="Second Brain AI API",
    description="Fahad's Second Brain - RAG-powered AI assistant with personalized communication style",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def initialize_database():
    init_chat_database()

@app.get("/health", response_model=dict)
async def health_check():
    from src.database import _get_client, get_collection_name
    qdrant_status = "disconnected"
    try:
        client = _get_client()
        if client:
            qdrant_status = "connected"
    except Exception:
        pass
    return {"status": "ok" if qdrant_status == "connected" else "degraded", "qdrant": qdrant_status}

from src.routes import router
app.include_router(router)

@app.get("/")
async def root():
    return {
        "message": "Second Brain AI API",
        "version": "0.1.0",
        "docs": "/docs",
    }

if __name__ == "__main__":
    import uvicorn  # only needed for local `python src/main.py` runs
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
