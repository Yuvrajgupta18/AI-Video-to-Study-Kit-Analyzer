"""Retrieval-augmented question answering over a single lecture transcript.

Pipeline: transcript segments -> overlapping chunks (chunking.py) -> sentence
embeddings (embeddings.py) -> ChromaDB, one lecture per `lecture_id` filter
(store.py) -> similarity search + grounded Gemini answer (router.py).
"""
