-- Migration: 20260704_002_create_memory_embeddings_table
-- Phase 1: Core Store & Embedding Engine
-- Creates the embeddings table for vector storage
-- Rollback Tag: [MIGRATION-002-v1]

-- MIGRATION:UP

CREATE TABLE IF NOT EXISTS memory_embeddings (
    id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'text-embedding-v3',
    dimension INTEGER NOT NULL DEFAULT 384,
    embedding BLOB,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Index for memory_id lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_memory_id ON memory_embeddings(memory_id);

-- Index for content hash deduplication
CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash ON memory_embeddings(content_hash);

-- Index for model-based queries
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON memory_embeddings(model);

-- Composite index for memory + model lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_memory_model ON memory_embeddings(memory_id, model);

-- MIGRATION:DOWN

DROP INDEX IF EXISTS idx_embeddings_memory_model;
DROP INDEX IF EXISTS idx_embeddings_model;
DROP INDEX IF EXISTS idx_embeddings_content_hash;
DROP INDEX IF EXISTS idx_embeddings_memory_id;
DROP TABLE IF EXISTS memory_embeddings;
