-- Enable pgvector for embeddings (hybrid retrieval) and pg_trgm for fuzzy alias matching.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
