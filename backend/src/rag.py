import time
from typing import List, Dict, Any, Optional
from src.database import ensure_collection, insert_points, search_points
from src.embeddings import embedding_generator
from src.llm import llm
from src.config import settings

def build_context(
    points: List[Dict[str, Any]],
) -> str:
    """Build a context string from retrieved points."""
    if not points:
        return ""
    
    context_parts = []
    for i, point in enumerate(points, 1):
        payload = point.get("payload", {})
        text = payload.get("text", "")
        source = payload.get("metadata", {}).get("source", {}).get("type", "unknown")
        if text:
            context_parts.append(f"[{i}] (source: {source})\n{text}")
    
    return "\n\n".join(context_parts) if context_parts else ""

def retrieve(
    question: str,
    top_k: int = 5,
    filter_dict: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Full RAG pipeline: embed question, search, build context."""
    start_time = time.time()
    
    # Embed the question
    query_vector = embedding_generator.embed(question)
    
    # Search Qdrant
    points = search_points(
        query_vector=query_vector,
        top_k=top_k,
        filter_dict=filter_dict,
    )
    
    # Build context
    context = build_context(points)
    
    latency = time.time() - start_time
    
    return {
        "context": context,
        "points": points,
        "latency": latency,
        "top_k": top_k,
        "vector_size": len(query_vector),
    }

def generate_answer(
    question: str,
    top_k: int = 5,
    filter_dict: Optional[Dict[str, Any]] = None,
    system_prompt: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a grounded answer using RAG."""
    # Retrieve relevant context
    rag_result = retrieve(question, top_k=top_k, filter_dict=filter_dict)
    
    # Build the prompt
    context = rag_result["context"]
    
    # Default system prompt based on communication style
    if system_prompt is None:
        system_prompt = """You are Fahad's Second Brain. Answer the user's question based on the retrieved context below. 

Follow these rules:
- Answer first, then give brief explanation if needed
- Use short, direct sentences (1-2 sentences maximum)
- Code-switch into romanized Urdu/Hindi function words when natural (qk, agr, ap, kr, hy, nai, skty, g, waghera, chahiye)
- Use "dear" as natural address
- Never fabricate personal experiences or opinions not in the context
- If the context doesn't have the answer, say "no idea about it dear"
- Do not write formal Urdu/Hindi or Devanagari
- Do not overuse "bhai"/"bro"
- Keep lowercase "i"
- Use loose punctuation
- If relevant, you may reference your own content with: "very previous video is on this same question, plz watch that" or "for more details plz dm me"
- Clearly distinguish between knowledge (facts), experience, opinion, and generic information
- Ground answers in the retrieved records; when nothing relevant is found, say "no idea about it dear" - do not invent"""

    # Build the full prompt
    full_prompt = f"""{system_prompt}

Context from Fahad's knowledge base:
{context if context else "No relevant context found."}

User question: {question}

Answer:"""
    
    # Generate using LLM
    answer = llm.generate(full_prompt)
    
    return {
        "answer": answer,
        "context": context,
        "latency": rag_result["latency"],
        "sources": rag_result["points"],
        "model": settings.GENERATION_MODEL,
        "embedding_model": settings.EMBEDDING_MODEL,
    }