/**
 * Knowledge Graph — Entities, facts, relations
 * 
 * Independent from episodic memory (src/memory/).
 * Answers "what do we know?" — structural/informational knowledge.
 */

import crypto from 'crypto';

export const EntityType = {
  AGENT: 'agent',
  HUMAN: 'human',
  ORGANIZATION: 'organization',
  PROJECT: 'project',
  DOCUMENT: 'document',
  CONCEPT: 'concept',
  TOOL: 'tool',
  SKILL: 'skill',
  FACT: 'fact',
  EVENT: 'event',
  RELATION: 'relation',
  CUSTOM: 'custom',
};

export const RelationType = {
  // Structural
  PART_OF: 'part_of',
  CONTAINS: 'contains',
  DEPENDS_ON: 'depends_on',
  BLOCKS: 'blocks',
  // Ownership
  OWNS: 'owns',
  CREATED_BY: 'created_by',
  MANAGED_BY: 'managed_by',
  // Membership
  MEMBER_OF: 'member_of',
  ASSIGNED_TO: 'assigned_to',
  // Knowledge
  DEFINES: 'defines',
  REFERENCES: 'references',
  IMPLEMENTS: 'implements',
  EXTENDS: 'extends',
  // Semantic
  RELATED_TO: 'related_to',
  SIMILAR_TO: 'similar_to',
  OPPOSES: 'opposes',
  CAUSES: 'causes',
  // Temporal
  PRECEDES: 'precedes',
  FOLLOWS: 'follows',
  OCCURRED_DURING: 'occurred_during',
};

export class KnowledgeGraph {
  constructor(options = {}) {
    this.entities = new Map(); // entityId -> entity
    this.relations = new Map(); // relationId -> relation
    this.entityIndex = new Map(); // type -> Set<entityId>
    this.relationIndex = new Map(); // sourceId -> Set<relationId>, targetId -> Set<relationId>
    this.nameIndex = new Map(); // lowercase name -> Set<entityId>
  }

  /**
   * Create entity.
   */
  createEntity(entity) {
    const id = entity.id || `ent-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    
    const entityRecord = {
      id,
      type: entity.type || EntityType.CUSTOM,
      label: entity.label || entity.name || id,
      name: entity.name || entity.label || id,
      description: entity.description || '',
      properties: entity.properties || {},
      provenance: entity.provenance || { source: 'manual', timestamp: now },
      confidence: typeof entity.confidence === 'number' ? Math.max(0, Math.min(1, entity.confidence)) : 1.0,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.entities.set(id, entityRecord);
    
    // Index by type
    if (!this.entityIndex.has(entityRecord.type)) {
      this.entityIndex.set(entityRecord.type, new Set());
    }
    this.entityIndex.get(entityRecord.type).add(id);

    // Index by name (lowercase for case-insensitive lookup)
    const nameKey = entityRecord.name.toLowerCase();
    if (!this.nameIndex.has(nameKey)) {
      this.nameIndex.set(nameKey, new Set());
    }
    this.nameIndex.get(nameKey).add(id);

    return entityRecord;
  }

  /**
   * Get entity by ID.
   */
  getEntity(id) {
    return this.entities.get(id) || null;
  }

  /**
   * Update entity.
   */
  updateEntity(id, updates) {
    const entity = this.entities.get(id);
    if (!entity) return null;

    const oldName = entity.name.toLowerCase();
    const allowedUpdates = ['label', 'name', 'description', 'properties', 'confidence'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) entity[key] = updates[key];
    }

    entity.updatedAt = new Date().toISOString();
    entity.version++;

    // Re-index name if changed
    if (updates.name && updates.name.toLowerCase() !== oldName) {
      this.nameIndex.get(oldName)?.delete(id);
      const newKey = updates.name.toLowerCase();
      if (!this.nameIndex.has(newKey)) this.nameIndex.set(newKey, new Set());
      this.nameIndex.get(newKey).add(id);
    }

    this.entities.set(id, entity);
    return entity;
  }

  /**
   * Delete entity and its relations.
   */
  deleteEntity(id) {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Delete all relations involving this entity
    const sourceRels = this.relationIndex.get(id) || new Set();
    for (const relId of sourceRels) {
      this.deleteRelation(relId);
    }

    // Remove from indexes
    this.entityIndex.get(entity.type)?.delete(id);
    this.nameIndex.get(entity.name.toLowerCase())?.delete(id);
    this.entities.delete(id);

    return true;
  }

  /**
   * Find entities by name (fuzzy).
   */
  findByName(query, options = {}) {
    const { limit = 20, type } = options;
    const q = query.toLowerCase();
    const results = [];

    for (const [name, ids] of this.nameIndex) {
      if (name.includes(q)) {
        for (const id of ids) {
          const entity = this.entities.get(id);
          if (entity && (!type || entity.type === type)) {
            results.push(entity);
            if (results.length >= limit) break;
          }
        }
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Get entities by type.
   */
  getByType(entityType, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const ids = this.entityIndex.get(entityType) || new Set();
    return Array.from(ids)
      .map(id => this.entities.get(id))
      .filter(Boolean)
      .slice(offset, offset + limit);
  }

  // --- RELATIONS ---

  /**
   * Create relation.
   */
  createRelation(relation) {
    const id = relation.id || `rel-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const source = this.entities.get(relation.sourceId);
    const target = this.entities.get(relation.targetId);
    if (!source || !target) {
      throw new Error('Source and target entities must exist');
    }

    const relationRecord = {
      id,
      type: relation.type || RelationType.RELATED_TO,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      properties: relation.properties || {},
      provenance: relation.provenance || { source: 'manual', timestamp: now },
      confidence: typeof relation.confidence === 'number' ? Math.max(0, Math.min(1, relation.confidence)) : 1.0,
      createdAt: now,
      updatedAt: now,
    };

    this.relations.set(id, relationRecord);

    // Index by source
    if (!this.relationIndex.has(relation.sourceId)) {
      this.relationIndex.set(relation.sourceId, new Set());
    }
    this.relationIndex.get(relation.sourceId).add(id);

    // Index by target
    if (!this.relationIndex.has(relation.targetId)) {
      this.relationIndex.set(relation.targetId, new Set());
    }
    this.relationIndex.get(relation.targetId).add(id);

    return relationRecord;
  }

  /**
   * Get relation by ID.
   */
  getRelation(id) {
    return this.relations.get(id) || null;
  }

  /**
   * Get relations for an entity (outgoing + incoming).
   */
  getRelations(entityId, options = {}) {
    const { direction = 'both', type, limit = 100 } = options;
    const relIds = this.relationIndex.get(entityId) || new Set();
    const results = [];

    for (const relId of relIds) {
      const rel = this.relations.get(relId);
      if (!rel) continue;
      if (direction === 'outgoing' && rel.sourceId !== entityId) continue;
      if (direction === 'incoming' && rel.targetId !== entityId) continue;
      if (type && rel.type !== type) continue;
      results.push(rel);
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Get neighbors (connected entities).
   */
  getNeighbors(entityId, options = {}) {
    const { direction = 'both', relationType, limit = 50 } = options;
    const rels = this.getRelations(entityId, { direction, type: relationType, limit: limit * 2 });
    const neighbors = new Map();

    for (const rel of rels) {
      const neighborId = rel.sourceId === entityId ? rel.targetId : rel.sourceId;
      const entity = this.entities.get(neighborId);
      if (!entity) continue;
      
      const key = neighborId;
      if (!neighbors.has(key)) {
        neighbors.set(key, { entity, relations: [] });
      }
      neighbors.get(key).relations.push(rel);
    }

    return Array.from(neighbors.values()).slice(0, limit);
  }

  /**
   * Delete relation.
   */
  deleteRelation(id) {
    const rel = this.relations.get(id);
    if (!rel) return false;

    this.relationIndex.get(rel.sourceId)?.delete(id);
    this.relationIndex.get(rel.targetId)?.delete(id);
    this.relations.delete(id);
    return true;
  }

  // --- QUERIES ---

  /**
   * Path finding (simple BFS).
   */
  findPath(startId, endId, options = {}) {
    const { maxDepth = 4, relationTypes } = options;
    if (!this.entities.has(startId) || !this.entities.has(endId)) return null;

    const queue = [[startId]];
    const visited = new Set([startId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === endId) return path;

      if (path.length >= maxDepth) continue;

      const neighbors = this.getNeighbors(current, { relationTypes });
      for (const { entity } of neighbors) {
        if (!visited.has(entity.id)) {
          visited.add(entity.id);
          queue.push([...path, entity.id]);
        }
      }
    }

    return null;
  }

  /**
   * Get stats.
   */
  getStats() {
    return {
      entities: this.entities.size,
      relations: this.relations.size,
      entityTypes: Object.fromEntries(
        Array.from(this.entityIndex.entries()).map(([k, v]) => [k, v.size])
      ),
      relationTypes: Array.from(this.relations.values())
        .reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {}),
    };
  }

  /**
   * Export for persistence.
   */
  export() {
    return {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import from export.
   */
  static import(data) {
    const graph = new KnowledgeGraph();
    for (const entity of data.entities || []) {
      graph.entities.set(entity.id, entity);
      if (!graph.entityIndex.has(entity.type)) graph.entityIndex.set(entity.type, new Set());
      graph.entityIndex.get(entity.type).add(entity.id);
      const nameKey = entity.name.toLowerCase();
      if (!graph.nameIndex.has(nameKey)) graph.nameIndex.set(nameKey, new Set());
      graph.nameIndex.get(nameKey).add(entity.id);
    }
    for (const rel of data.relations || []) {
      graph.relations.set(rel.id, rel);
      if (!graph.relationIndex.has(rel.sourceId)) graph.relationIndex.set(rel.sourceId, new Set());
      graph.relationIndex.get(rel.sourceId).add(rel.id);
      if (!graph.relationIndex.has(rel.targetId)) graph.relationIndex.set(rel.targetId, new Set());
      graph.relationIndex.get(rel.targetId).add(rel.id);
    }
    return graph;
  }
}

export default KnowledgeGraph;