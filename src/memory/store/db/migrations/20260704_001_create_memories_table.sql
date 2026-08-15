-- Migration: 20260704_001_create_memories_table
-- Phase 1: Core Store & Embedding Engine
-- Creates the core memories table for persistent storage
-- Rollback Tag: [MIGRATION-001-v1]

-- MIGRATION:UP

CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    source_id TEXT DEFAULT '',
    memory_type TEXT DEFAULT 'note',
    valence REAL DEFAULT 0.0,
    salience REAL DEFAULT 0.5,
    importance_score REAL DEFAULT 0.5,
    decay_rate REAL DEFAULT 0.01,
    tags TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed TEXT,
    access_count INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    archived_at TEXT,
    expires_at TEXT
);

-- Index for content-based deduplication
CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash);

-- Index for source-based queries
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);

-- Index for type-based queries
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);

-- Index for importance ranking
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance_score DESC);

-- Index for access frequency ranking
CREATE INDEX IF NOT EXISTS idx_memories_access_count ON memories(access_count DESC);

-- Index for archival status
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived);

-- Index for expiry checks
CREATE INDEX IF NOT EXISTS idx_memories_expires_at ON memories(expires_at);

-- MIGRATION:DOWN

DROP INDEX IF EXISTS idx_memories_expires_at;
DROP INDEX IF EXISTS idx_memories_archived;
DROP INDEX IF EXISTS idx_memories_access_count;
DROP INDEX IF EXISTS idx_memories_importance;
DROP INDEX IF EXISTS idx_memories_created_at;
DROP INDEX IF EXISTS idx_memories_type;
DROP INDEX IF EXISTS idx_memories_source;
DROP INDEX IF EXISTS idx_memories_content_hash;
DROP TABLE IF EXISTS memories;
