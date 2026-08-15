/**
 * Error Handler — Centralized error response formatting middleware
 *
 * Catches all unhandled errors and formats them into consistent
 * API envelope responses with appropriate HTTP status codes.
 * Rollback Tag: [API-ERROR-HANDLER-v1]
 * Phase: 4 — API Layer & Integration
 */

import { logger } from '../../services/logger.js';
import { metrics } from '../../services/metrics.js';

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

const ERROR_STATUS_MAP = {
  ValidationError: 400,
  BadRequestError: 400,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
  GoneError: 410,
  RateLimitError: 429,
  InternalError: 500,
  ServiceUnavailableError: 503,
};

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Express error handling middleware
// ---------------------------------------------------------------------------

/**
 * 404 handler — catches requests to undefined routes.
 */
export function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route not found: ${req.method} ${req.path}`);
  next(error);
}

/**
 * Global error handler middleware.
 * Must have 4 parameters for Express to recognize it as error handler.
 */
export function errorHandler(err, req, res, _next) {
  // Determine status code
  let statusCode = err.statusCode || ERROR_STATUS_MAP[err.name] || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Handle specific error types
  if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  }

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  }

  // Log the error
  const logContext = {
    err: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode,
      code,
    },
    method: req.method,
    path: req.path,
    correlationId: req.correlationId,
  };

  if (statusCode >= 500) {
    logger.error(logContext, `Server error: ${message}`);
  } else {
    logger.warn(logContext, `Client error: ${message}`);
  }

  // Track error metrics
  metrics.increment('api.errors.total', 1, {
    status_code: String(statusCode),
    code,
    method: req.method,
    path: req.path,
  });

  // Send error response
  const response = {
    status: 'error',
    errors: [{
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
    }],
    meta: {
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    },
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.meta.stack = err.stack?.split('\n').slice(1, 6);
  }

  res.status(statusCode).json(response);
}

/**
 * Async route wrapper — catches async errors and forwards to error handler.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
