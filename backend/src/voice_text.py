import re
from typing import Optional


def clean_text_for_speech(text: str) -> str:
    """
    Clean and normalize markdown, code blocks, URLs, and formatting artifacts
    into natural conversational text suitable for high-quality speech synthesis (TTS).
    """
    if not text:
        return ""

    cleaned = text

    # 1. Remove fenced code blocks (```python ... ```) or replace with short natural cue
    cleaned = re.sub(r"```[\w-]*\n[\s\S]*?```", " [code snippet omitted] ", cleaned)

    # 2. Remove inline code snippets (`code`)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)

    # 3. Remove Markdown links [text](url) -> keep only text
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)

    # 4. Remove raw URLs (https://... or http://...)
    cleaned = re.sub(r"https?://\S+", "", cleaned)

    # 5. Remove citations / source brackets like [1], [2], [source: ...], [video: ...]
    cleaned = re.sub(r"\[\d+\]", "", cleaned)
    cleaned = re.sub(r"\[source:[^\]]+\]", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[video:[^\]]+\]", "", cleaned, flags=re.IGNORECASE)

    # 6. Remove prompt meta-labels (e.g. "Fahad Gul:", "Assistant:", "Answer:")
    cleaned = re.sub(
        r"(?:^|\n)\s*(?:Fahad Gul|Assistant|Answer|Response|Second Brain):\s*",
        " ",
        cleaned,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    cleaned = re.sub(
        r"\b(?:Fahad Gul|Assistant|Answer|Response|Second Brain):\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    # 7. Remove Markdown headings (# Heading -> Heading)
    cleaned = re.sub(r"^#{1,6}\s*", "", cleaned, flags=re.MULTILINE)

    # 8. Remove Markdown bold / italics (**bold**, *italic*, __bold__, _italic_)
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)

    # 9. Normalize bullet lists (- item, * item) and numbered lists (1. item)
    cleaned = re.sub(r"^\s*[-*+]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*\d+\.\s+", "", cleaned, flags=re.MULTILINE)

    # 10. Remove blockquote markers (> quote)
    cleaned = re.sub(r"^\s*>\s*", "", cleaned, flags=re.MULTILINE)

    # 11. Normalize excessive punctuation, asterisks, brackets, or emojis that TTS stumbles over
    cleaned = re.sub(r"[#*_~`><|]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)

    return cleaned.strip()
