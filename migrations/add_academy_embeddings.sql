-- Migration: Add vector embeddings to Academy document chunks
-- Requires pgvector extension (CREATE EXTENSION IF NOT EXISTS vector;)

-- Add embedding column to document chunks
-- Using 1536 dimensions for OpenAI text-embedding-3-small
ALTER TABLE academy_document_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add embedding column to documents table for full-document search
ALTER TABLE academy_documents
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for fast similarity search on chunks
CREATE INDEX IF NOT EXISTS idx_academy_document_chunks_embedding
ON academy_document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for documents
CREATE INDEX IF NOT EXISTS idx_academy_documents_embedding
ON academy_documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 50);

-- Add metadata column to track embedding generation
ALTER TABLE academy_document_chunks
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);

ALTER TABLE academy_document_chunks
ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE academy_documents
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);

ALTER TABLE academy_documents
ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMP WITH TIME ZONE;

-- Comments
COMMENT ON COLUMN academy_document_chunks.embedding IS 'Vector embedding for semantic search (1536 dim, OpenAI text-embedding-3-small)';
COMMENT ON COLUMN academy_documents.embedding IS 'Vector embedding for document-level semantic search';
