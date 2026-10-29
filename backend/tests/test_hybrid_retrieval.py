from src.rag import retrieve, generate_answer
from src.database import get_collection_stats

def test_hybrid_search():
    stats = get_collection_stats()
    print("Collection Stats:", stats)
    assert stats["hybrid_ready"] is True
    assert stats["has_sparse"] is True

    # Test retrieval
    query = "What AWS and cloud services does Fahad specialize in?"
    result = retrieve(query, top_k=5)
    print("\nQuery:", query)
    print("Latency:", round(result["latency"], 3), "s")
    print("Is Hybrid Active:", result.get("is_hybrid"))
    print("Retrieved Points:", len(result["points"]))
    assert result.get("is_hybrid") is True
    assert len(result["points"]) > 0

    for i, pt in enumerate(result["points"], 1):
        txt = (pt.get("payload") or {}).get("text", "")[:100].replace("\n", " ")
        print(f"  [{i}] Score: {pt['score']:.4f} | {txt}...")

    # Test question with specific keywords (FastAPI)
    kw_query = "FastAPI"
    kw_result = retrieve(kw_query, top_k=3)
    print(f"\nKeyword Query: '{kw_query}'")
    print("Retrieved Points:", len(kw_result["points"]))
    assert len(kw_result["points"]) > 0

    print("\nALL HYBRID SEARCH TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_hybrid_search()
