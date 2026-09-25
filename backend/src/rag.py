import re
import time
from typing import List, Dict, Any, Optional
from src.database import ensure_collection, insert_points, search_points
from src.embeddings import embedding_generator
from src.llm import llm
from src.config import settings

# Unicode ranges covering common emoji blocks (symbols, pictographs, flags)
_EMOJI_RE = re.compile(
    "["
    "\U0001f300-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "\U00002b00-\U00002bff"
    "\U0001f900-\U0001f9ff"
    "\U0000fe0f"
    "\U0000200d"
    "\U0001f3fb-\U0001f3ff"
    "]+",
    flags=re.UNICODE,
)

# Modifiers and joins that don't count as a separate emoji
_SKIP = set("\U0000fe0f\U0000200d\U0001f3fb\U0001f3fc\U0001f3fd\U0001f3fe\U0001f3ff")

_REPLY_EMOJIS = ["💯", "🔥", "❤️", "👍", "😂", "😅", "✨", "✅"]


def is_emoji_only(text: str) -> bool:
    """True if the message contains only emojis (and whitespace)."""
    remaining = _EMOJI_RE.sub("", text or "").strip()
    return bool(remaining) is False and bool(_EMOJI_RE.search(text or ""))


def _count_emojis(text: str) -> int:
    """Count distinct emoji codepoints, ignoring variation/ZWJ/skin-tone modifiers."""
    return sum(
        1 for ch in (text or "")
        if _EMOJI_RE.fullmatch(ch) and ch not in _SKIP
    )


def emoji_reply(text: str) -> str:
    """Return a deterministic single or triple-emoji reply (no retrieval)."""
    hash_seed = sum(ord(c) for c in (text or ""))
    n = _count_emojis(text)
    first = _REPLY_EMOJIS[hash_seed % len(_REPLY_EMOJIS)]
    if n == 1:
        return first
    others = [e for e in _REPLY_EMOJIS if e != first]
    second = others[hash_seed % len(others)]
    third = others[(hash_seed + 1) % len(others)]
    return f"{first}{second}{third}"

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
    conversation_history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Generate a grounded answer using RAG."""

    # Emoji-only messages: reply with emojis directly, no retrieval.
    if is_emoji_only(question):
        answer = emoji_reply(question)
        return {
            "answer": answer,
            "context": "",
            "latency": 0.0,
            "sources": [],
            "model": settings.GENERATION_MODEL,
            "embedding_model": settings.EMBEDDING_MODEL,
        }

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
- If the context doesn't have the answer, reply ONLY with "no idea about it dear" - nothing else, no explanations
- Do not mention "context", "retrieval", "records", or "knowledge base" in any answer - never explain your internal process to the user
- Do not write formal Urdu/Hindi or Devanagari
- Do not overuse "bhai"/"bro"
- Keep lowercase "i"
- Use loose punctuation
- If relevant, you may reference your own content with: "very previous video is on this same question, plz watch that" or "for more details plz dm me"
- Clearly distinguish between knowledge (facts), experience, opinion, and generic information
- Ground answers in the retrieved records; when nothing relevant is found, say "no idea about it dear" - do not invent"""

    history = "\n".join(
        f"{item['role'].title()}: {item['content']}"
        for item in (conversation_history or [])[-10:]
    )

    # Build the full prompt
    full_prompt = f"""{system_prompt}

Context from Fahad's knowledge base:
{context if context else "No relevant context found."}

Recent conversation:
{history if history else "No earlier messages."}

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
