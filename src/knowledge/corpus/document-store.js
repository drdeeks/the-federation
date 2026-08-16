/**
 * Document Store — Corpus metadata and resolved documents
 * 
 * Independent from episodic memory. Owns supplied corpus metadata
 * and resolved document content.
 */

import crypto from 'crypto';

export class DocumentStore {
  constructor(options = {}) {
    this.documents = new Map(); // documentId -> document
    this.contentHashIndex = new Map(); // contentHash -> documentId
    this.sourceUriIndex = new Map(); // sourceUri -> documentId
    this.visibilityIndex = new Map(); // visibility -> Set<documentId>
  }

  /**
   * Add or update a document.
   */
  add(document) {
    const contentHash = document.contentHash || this._computeHash(document.content || '');
    
    // Check for existing by content hash (deduplication)
    if (this.contentHashIndex.has(contentHash)) {
      const existingId = this.contentHashIndex.get(contentHash);
      const existing = this.documents.get(existingId);
      // Update metadata but keep same ID
      const updated = { ...existing, ...document, contentHash, updatedAt: new Date().toISOString() };
      this.documents.set(existingId, updated);
      return { document: updated, created: false, duplicate: true };
    }

    const documentId = document.documentId || `doc-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const docRecord = {
      documentId,
      sourceUri: document.sourceUri || '',
      contentHash,
      visibility: document.visibility || 'private', // private, org, public
      content: document.content || '',
      metadata: document.metadata || {},
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.documents.set(documentId, docRecord);
    this.contentHashIndex.set(contentHash, documentId);
    
    if (docRecord.sourceUri) {
      this.sourceUriIndex.set(docRecord.sourceUri, documentId);
    }

    if (!this.visibilityIndex.has(docRecord.visibility)) {
      this.visibilityIndex.set(docRecord.visibility, new Set());
    }
    this.visibilityIndex.get(docRecord.visibility).add(documentId);

    return { document: docRecord, created: true, duplicate: false };
  }

  /**
   * Get document by ID.
   */
  get(documentId) {
    return this.documents.get(documentId) || null;
  }

  /**
   * Get document by source URI.
   */
  getBySourceUri(sourceUri) {
    const id = this.sourceUriIndex.get(sourceUri);
    return id ? this.documents.get(id) : null;
  }

  /**
   * Get document by content hash.
   */
  getByContentHash(contentHash) {
    const id = this.contentHashIndex.get(contentHash);
    return id ? this.documents.get(id) : null;
  }

  /**
   * Update document metadata.
   */
  update(documentId, updates) {
    const doc = this.documents.get(documentId);
    if (!doc) return null;

    const allowedUpdates = ['visibility', 'metadata', 'content'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        if (key === 'content') {
          // Content change = new content hash = new document
          const newHash = this._computeHash(updates.content);
          if (newHash !== doc.contentHash) {
            // Remove old indexes
            this.contentHashIndex.delete(doc.contentHash);
            if (doc.sourceUri) this.sourceUriIndex.delete(doc.sourceUri);
            this.visibilityIndex.get(doc.visibility)?.delete(documentId);
            
            // Add new
            doc.content = updates.content;
            doc.contentHash = newHash;
            this.contentHashIndex.set(newHash, documentId);
            if (doc.sourceUri) this.sourceUriIndex.set(doc.sourceUri, documentId);
            if (!this.visibilityIndex.has(doc.visibility)) this.visibilityIndex.set(doc.visibility, new Set());
            this.visibilityIndex.get(doc.visibility).add(documentId);
          }
        } else if (key === 'visibility') {
          this.visibilityIndex.get(doc.visibility)?.delete(documentId);
          doc.visibility = updates.visibility;
          if (!this.visibilityIndex.has(doc.visibility)) this.visibilityIndex.set(doc.visibility, new Set());
          this.visibilityIndex.get(doc.visibility).add(documentId);
        } else {
          doc[key] = updates[key];
        }
      }
    }

    doc.updatedAt = new Date().toISOString();
    doc.version++;
    this.documents.set(documentId, doc);
    return doc;
  }

  /**
   * Delete document.
   */
  delete(documentId) {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    this.contentHashIndex.delete(doc.contentHash);
    if (doc.sourceUri) this.sourceUriIndex.delete(doc.sourceUri);
    this.visibilityIndex.get(doc.visibility)?.delete(documentId);
    this.documents.delete(documentId);
    return true;
  }

  /**
   * Query by visibility.
   */
  queryByVisibility(visibility, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const ids = this.visibilityIndex.get(visibility) || new Set();
    return Array.from(ids)
      .map(id => this.documents.get(id))
      .filter(Boolean)
      .slice(offset, offset + limit);
  }

  /**
   * Search documents by content (simple text search).
   */
  search(query, options = {}) {
    const { limit = 20, visibility } = options;
    const q = query.toLowerCase();
    const results = [];

    for (const doc of this.documents.values()) {
      if (visibility && doc.visibility !== visibility) continue;
      if (doc.content.toLowerCase().includes(q) || 
          doc.sourceUri.toLowerCase().includes(q) ||
          JSON.stringify(doc.metadata).toLowerCase().includes(q)) {
        results.push(doc);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      total: this.documents.size,
      byVisibility: Object.fromEntries(
        Array.from(this.visibilityIndex.entries()).map(([k, v]) => [k, v.size])
      ),
    };
  }

  _computeHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
  }
}

export default DocumentStore;