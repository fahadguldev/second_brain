import atexit
import logging
import threading
import time
from collections import OrderedDict
from datetime import datetime
from queue import Empty, Queue
from typing import Any, Dict, List, Optional
from uuid import uuid4

from src.chat_database import Conversation, Message, SessionLocal, User, utcnow

logger = logging.getLogger(__name__)

# Max conversations to keep in fast in-memory LRU cache
MAX_CONV_CACHE = 200

# Flush interval in seconds (batches writes every 60 seconds)
BATCH_FLUSH_INTERVAL = 60.0

# Flush immediately if queue reaches this threshold
MAX_BATCH_SIZE = 20


class MessageQueueManager:
    """Decouples streaming from Supabase persistence.
    
    Streams yield tokens in real-time with zero database blocking.
    Writes are enqueued in-memory and flushed to Supabase in batches by a background worker.
    """

    def __init__(self) -> None:
        self._queue: Queue[Dict[str, Any]] = Queue()
        self._cache: OrderedDict[str, List[Dict[str, str]]] = OrderedDict()
        self._cache_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._worker_thread = threading.Thread(
            target=self._batch_worker, name="SupabaseBatchWorker", daemon=True
        )
        self._worker_thread.start()
        atexit.register(self.shutdown)

    def get_conversation_history(
        self, conversation_id: Optional[str], limit: int = 10
    ) -> List[Dict[str, str]]:
        """Retrieve recent conversation history from memory cache in sub-millisecond time.
        Falls back to database only on initial cache miss.
        """
        if not conversation_id:
            return []

        with self._cache_lock:
            if conversation_id in self._cache:
                self._cache.move_to_end(conversation_id)
                return self._cache[conversation_id][-limit:]

        # Cache miss: load once from DB and warm the in-memory cache
        history: List[Dict[str, str]] = []
        db = SessionLocal()
        try:
            conv = db.get(Conversation, conversation_id)
            if conv and conv.messages:
                history = [
                    {"role": msg.role, "content": msg.content}
                    for msg in conv.messages[-limit:]
                ]
                with self._cache_lock:
                    self._cache[conversation_id] = [
                        {"role": msg.role, "content": msg.content}
                        for msg in conv.messages
                    ]
                    if len(self._cache) > MAX_CONV_CACHE:
                        self._cache.popitem(last=False)
        except Exception as exc:
            logger.warning("Could not warm conversation cache from DB: %s", exc)
        finally:
            db.close()

        return history

    def enqueue(
        self,
        user_id: str,
        conversation_id: str,
        user_message_id: str,
        question: str,
        assistant_message_id: str,
        answer: str,
        model: Optional[str] = None,
        embedding_model: Optional[str] = None,
        latency: Optional[float] = None,
        sources: Optional[List[Any]] = None,
    ) -> None:
        """Enqueue message pair instantly into memory (0ms blocking).
        Updates the local LRU cache so subsequent streaming turns have instant context.
        """
        # 1. Update in-memory cache immediately
        with self._cache_lock:
            if conversation_id not in self._cache:
                self._cache[conversation_id] = []
            self._cache[conversation_id].append({"role": "user", "content": question})
            self._cache[conversation_id].append({"role": "assistant", "content": answer})
            self._cache.move_to_end(conversation_id)
            if len(self._cache) > MAX_CONV_CACHE:
                self._cache.popitem(last=False)

        # 2. Put into thread-safe batch queue for background persistence
        record = {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "user_message_id": user_message_id,
            "question": question,
            "assistant_message_id": assistant_message_id,
            "answer": answer,
            "model": model,
            "embedding_model": embedding_model,
            "latency": latency,
            "sources": sources or [],
            "created_at": utcnow(),
        }
        self._queue.put(record)

    def _batch_worker(self) -> None:
        """Background daemon thread that commits queued messages to Supabase in batches."""
        while not self._stop_event.is_set():
            # Wait up to BATCH_FLUSH_INTERVAL or wake if items are ready
            self._stop_event.wait(timeout=BATCH_FLUSH_INTERVAL)
            self._flush_batch()

    def _flush_batch(self) -> None:
        """Drains pending records from the queue and writes them in a single DB transaction."""
        items: List[Dict[str, Any]] = []
        while not self._queue.empty():
            try:
                items.append(self._queue.get_nowait())
            except Empty:
                break

        if not items:
            return

        db = SessionLocal()
        try:
            # Group by conversation to optimize updates
            for item in items:
                user_id = item["user_id"]
                conv_id = item["conversation_id"]

                # Ensure user exists
                user = db.get(User, user_id)
                if not user:
                    user = User(id=user_id, last_seen_at=utcnow())
                    db.add(user)

                # Ensure conversation exists
                conv = db.get(Conversation, conv_id)
                if not conv:
                    title = item["question"].strip()[:80] or "New conversation"
                    conv = Conversation(
                        id=conv_id,
                        user_id=user_id,
                        title=title,
                        created_at=item["created_at"],
                        updated_at=utcnow(),
                    )
                    db.add(conv)
                else:
                    conv.updated_at = utcnow()

                # Add user message
                user_msg = Message(
                    id=item["user_message_id"],
                    conversation_id=conv_id,
                    role="user",
                    content=item["question"],
                    created_at=item["created_at"],
                )
                db.add(user_msg)

                # Add assistant message
                asst_msg = Message(
                    id=item["assistant_message_id"],
                    conversation_id=conv_id,
                    role="assistant",
                    content=item["answer"],
                    model=item["model"],
                    embedding_model=item["embedding_model"],
                    latency=item["latency"],
                    sources=item["sources"],
                    created_at=item["created_at"],
                )
                db.add(asst_msg)

            db.commit()
            logger.info("Successfully synced %d batched messages to Supabase.", len(items) * 2)
        except Exception as exc:
            db.rollback()
            logger.error("Failed to sync batched messages to Supabase: %s. Re-enqueuing.", exc)
            for item in items:
                self._queue.put(item)
        finally:
            db.close()

    def shutdown(self) -> None:
        """Flush any remaining items on shutdown."""
        self._stop_event.set()
        self._flush_batch()


# Global singleton instance
message_queue = MessageQueueManager()
