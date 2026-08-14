// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
/**
 * RequestValidator — Input validation middleware
 *
 * Validates content types, required fields, data types, value ranges,
 * and format constraints before passing requests to the router.
 */

// ---------------------------------------------------------------------------
// Validation schemas for each endpoint
// ---------------------------------------------------------------------------

const SCHEMAS = {
  ingest: {
    required: ['content'],
    optional: {
      tags: { type: 'array', itemType: 'string' },
      importance: { type: 'number', min: 0, max: 1 },
      source: { type: 'string', maxLength: 200 },
      sourceId: { type: 'string', maxLength: 200 },
      metadata: { type: 'object' },
      type: { type: 'string', maxLength: 100 },
    },
  },

  recall: {
    required: ['query'],
    optional: {
      limit: { type: 'integer', min: 1, max: 50, default: 10 },
      search_strategy: { type: 'string', enum: ['semantic', 'keyword', 'hybrid'], default: 'hybrid' },
      filters: { type: 'object' },
      options: { type: 'object' },
    },
  },

  forget: {
    required: [],
    optional: {
      memory_id: { type: 'string' },
      query: { type: 'string' },
      mode: { type: 'string', enum: ['soft', 'hard'], default: 'soft' },
      reason: { type: 'string', maxLength: 500 },
    },
    requireAtLeastOne: ['memory_id', 'query'],
  },

  learn: {
    required: [],
    optional: {
      scope: { type: 'string', enum: ['full', 'recent', 'targeted'], default: 'full' },
      target_memory_ids: { type: 'array', itemType: 'string' },
      analysis_depth: { type: 'string', enum: ['shallow', 'standard', 'deep'], default: 'standard' },
    },
  },

  batchIngest: {
    required: [], // body itself must be array
    isArray: true,
    minItems: 1,
    maxItems: 100,
    itemSchema: {
      required: ['content'],
      optional: {
        tags: { type: 'array', itemType: 'string' },
        importance: { type: 'number', min: 0, max: 1 },
        source: { type: 'string' },
      },
    },
  },

  batchRecall: {
    required: [], // body itself must be array
    isArray: true,
    minItems: 1,
    maxItems: 50,
    itemSchema: {
      required: ['query'],
      optional: {
        limit: { type: 'integer', min: 1, max: 50 },
        filters: { type: 'object' },
      },
    },
  },

  updateMemory: {
    required: [],
    optional: {
      content: { type: 'string', minLength: 1, maxLength: 100000 },
      tags: { type: 'array', itemType: 'string' },
      importance: { type: 'number', min: 0, max: 1 },
      metadata: { type: 'object' },
    },
    requireAtLeastOne: ['content', 'tags', 'importance', 'metadata'],
  },

  recoverArchive: {
    required: [],
    optional: {},
  },

  restore: {
    required: ['snapshot_id'],
    optional: {},
  },
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single value against a field schema.
 * @returns {{ valid: boolean, error?: string }}
 */
function validateField(value, fieldName, schema) {
  // Type checks
  if (schema.type) {
    if (schema.type === 'string' && typeof value !== 'string') {
      return { valid: false, error: `Field '${fieldName}' must be a string` };
    }
    if (schema.type === 'number' && typeof value !== 'number') {
      return { valid: false, error: `Field '${fieldName}' must be a number` };
    }
    if (schema.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      return { valid: false, error: `Field '${fieldName}' must be an integer` };
    }
    if (schema.type === 'array' && !Array.isArray(value)) {
      return { valid: false, error: `Field '${fieldName}' must be an array` };
    }
    if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value) || value === null)) {
      return { valid: false, error: `Field '${fieldName}' must be an object` };
    }
  }

  // String constraints
  if (typeof value === 'string') {
    if (schema.maxLength && value.length > schema.maxLength) {
      return { valid: false, error: `Field '${fieldName}' exceeds maximum length of ${schema.maxLength}` };
    }
    if (schema.minLength && value.length < schema.minLength) {
      return { valid: false, error: `Field '${fieldName}' must be at least ${schema.minLength} characters` };
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return { valid: false, error: `Field '${fieldName}' must be one of: ${schema.enum.join(', ')}` };
    }
  }

  // Number constraints
  if (typeof value === 'number') {
    if (schema.min !== undefined && value < schema.min) {
      return { valid: false, error: `Field '${fieldName}' must be at least ${schema.min}` };
    }
    if (schema.max !== undefined && value > schema.max) {
      return { valid: false, error: `Field '${fieldName}' must be at most ${schema.max}` };
    }
  }

  // Array item type checks
  if (Array.isArray(value) && schema.itemType) {
    for (let i = 0; i < value.length; i++) {
      if (schema.itemType === 'string' && typeof value[i] !== 'string') {
        return { valid: false, error: `Field '${fieldName}[${i}]' must be a string` };
      }
    }
  }

  return { valid: true };
}

/**
 * Validate body against a schema.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBody(body, schema) {
  const errors = [];

  if (!schema) return { valid: true, errors };

  // Array body check
  if (schema.isArray) {
    if (!Array.isArray(body)) {
      return { valid: false, errors: ['Request body must be an array'] };
    }
    if (body.length < (schema.minItems || 0)) {
      errors.push(`Array must contain at least ${schema.minItems} items`);
    }
    if (schema.maxItems && body.length > schema.maxItems) {
      errors.push(`Array must contain at most ${schema.maxItems} items`);
    }
    // Validate each item against item schema
    if (schema.itemSchema) {
      for (let i = 0; i < body.length; i++) {
        const itemResult = validateBody(body[i], schema.itemSchema);
        for (const err of itemResult.errors) {
          errors.push(`Item[${i}]: ${err}`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  // Required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (body === null || body === undefined || body[field] === undefined || body[field] === null) {
        errors.push(`Field '${field}' is required`);
      }
    }
  }

  // requireAtLeastOne
  if (schema.requireAtLeastOne) {
    const hasAtLeastOne = schema.requireAtLeastOne.some(f => body && body[f] !== undefined && body[f] !== null);
    if (!hasAtLeastOne) {
      errors.push(`At least one of these fields is required: ${schema.requireAtLeastOne.join(', ')}`);
    }
  }

  // Optional field validation
  if (schema.optional && body) {
    for (const [field, fieldSchema] of Object.entries(schema.optional)) {
      if (body[field] !== undefined && body[field] !== null) {
        const result = validateField(body[field], field, fieldSchema);
        if (!result.valid) {
          errors.push(result.error);
        }
      }
    }
  }

  // Reject unknown fields
  if (schema.optional && body && typeof body === 'object' && !Array.isArray(body)) {
    const allowedFields = new Set([
      ...(schema.required || []),
      ...Object.keys(schema.optional),
    ]);
    for (const key of Object.keys(body)) {
      if (!allowedFields.has(key)) {
        errors.push(`Unknown field '${key}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate query parameters against a schema.
 * @returns {{ valid: boolean, errors: string[], parsed: Object }}
 */
function validateQueryParamsInternal(query, schema) {
  const errors = [];
  const parsed = {};

  if (!schema) return { valid: true, errors, parsed };

  for (const [field, fieldSchema] of Object.entries(schema)) {
    if (query[field] !== undefined) {
      let value = query[field];

      // Type coercion
      if (fieldSchema.type === 'integer') {
        value = parseInt(value, 10);
        if (isNaN(value)) {
          errors.push(`Query parameter '${field}' must be an integer`);
          continue;
        }
      } else if (fieldSchema.type === 'number') {
        value = parseFloat(value);
        if (isNaN(value)) {
          errors.push(`Query parameter '${field}' must be a number`);
          continue;
        }
      } else if (fieldSchema.type === 'boolean') {
        value = value === 'true' || value === '1';
      }

      const result = validateField(value, field, fieldSchema);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        parsed[field] = value;
      }
    } else if (fieldSchema.default !== undefined) {
      parsed[field] = fieldSchema.default;
    }
  }

  return { valid: errors.length === 0, errors, parsed };
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Create validation middleware for a specific endpoint.
 * @param {string} endpoint — key into SCHEMAS
 * @returns {Function} Express middleware
 */
export function validate(endpoint) {
  const schema = SCHEMAS[endpoint];

  return (req, res, next) => {
    const errors = [];

    // Validate body
    if (schema) {
      const bodyResult = validateBody(req.body, schema);
      errors.push(...bodyResult.errors);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        status: 'error',
        errors: errors.map(e => ({ message: e })),
      });
    }

    next();
  };
}

/**
 * Create query parameter validation middleware.
 * @param {Object} querySchema — schema for query params
 * @returns {Function} Express middleware
 */
export function validateQuery(querySchema) {
  return (req, res, next) => {
    const result = validateQueryParamsInternal(req.query, querySchema);

    if (!result.valid) {
      return res.status(400).json({
        status: 'error',
        errors: result.errors.map(e => ({ message: e })),
      });
    }

    // Attach parsed/validated query params
    req.validatedQuery = { ...req.query, ...result.parsed };
    next();
  };
}

/**
 * Validate that Content-Type is JSON.
 */
export function requireJson(req, res, next) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return next();
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json') && Object.keys(req.body || {}).length > 0) {
    return res.status(415).json({
      status: 'error',
      errors: [{ message: 'Content-Type must be application/json' }],
    });
  }

  next();
}

export { validateBody, validateField, validateQueryParamsInternal as validateQueryParams, SCHEMAS };
