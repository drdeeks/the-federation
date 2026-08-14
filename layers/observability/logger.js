// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
/**
 * Logger — Structured logging service using Pino
 *
 * Features:
 * - Pino structured JSON logging
 * - Child logger propagation with correlation IDs
 * - Automatic redaction of sensitive keys
 * - Level-based filtering
 * - Correlation ID support via request context
 */

import pino from 'pino';

// TODO: wire a real project-wide config loader when composing layers.
// Falls back to env vars directly so this module works standalone.
const configLoader = {
  load() {
    return {
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      LOG_PRETTY_PRINT: process.env.LOG_PRETTY_PRINT === 'true',
      LOG_REDACTION_KEYS: (process.env.LOG_REDACTION_KEYS || 'api_key,password,secret,token,authorization')
        .split(',').map(s => s.trim()).filter(Boolean),
      NODE_ENV: process.env.NODE_ENV || 'development',
    };
  },
};

/**
 * Create the base Pino logger from current config.
 */
function createBaseLogger() {
  const cfg = configLoader.load();

  const level = cfg.LOG_LEVEL || 'info';
  const prettyPrint = cfg.LOG_PRETTY_PRINT || false;
  const redactionKeys = cfg.LOG_REDACTION_KEYS || ['api_key', 'password', 'secret', 'token', 'authorization'];

  const transport = prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  return pino({
    level,
    transport,
    redact: {
      paths: redactionKeys,
      censor: '[REDACTED]',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    base: {
      env: cfg.NODE_ENV,
      service: 'memory-service',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

let baseLogger = createBaseLogger();

class LoggerService {
  constructor() {
    this._logger = baseLogger;
  }

  /**
   * Reinitialize logger (e.g., after config change at runtime).
   */
  reinit() {
    baseLogger = createBaseLogger();
    this._logger = baseLogger;
  }

  /**
   * Get the underlying Pino instance.
   */
  get pino() {
    return this._logger;
  }

  /**
   * Create a child logger with bound context.
   * @param {Object} bindings - Additional context to bind (correlationId, module, etc.)
   * @returns {LoggerService}
   */
  child(bindings) {
    const childLogger = new LoggerService();
    childLogger._logger = this._logger.child(bindings);
    return childLogger;
  }

  /**
   * Create a child logger for a specific module.
   * @param {string} moduleName
   * @returns {LoggerService}
   */
  module(moduleName) {
    return this.child({ module: moduleName });
  }

  /**
   * Create a child logger with request context (correlation ID).
   * @param {string} correlationId
   * @param {Object} [extra]
   * @returns {LoggerService}
   */
  withRequest(correlationId, extra = {}) {
    return this.child({ correlationId, ...extra });
  }

  /**
   * Log at debug level.
   */
  debug(msg, ...args) {
    this._logger.debug(msg, ...args);
  }

  /**
   * Log at info level.
   */
  info(msg, ...args) {
    this._logger.info(msg, ...args);
  }

  /**
   * Log at warn level.
   */
  warn(msg, ...args) {
    this._logger.warn(msg, ...args);
  }

  /**
   * Log at error level.
   */
  error(msg, ...args) {
    this._logger.error(msg, ...args);
  }

  /**
   * Log at fatal level (triggers process exit in Pino).
   */
  fatal(msg, ...args) {
    this._logger.fatal(msg, ...args);
  }

  /**
   * Log at trace level (most verbose).
   */
  trace(msg, ...args) {
    this._logger.trace(msg, ...args);
  }

  /**
   * Flush pending logs (useful before shutdown).
   */
  flush() {
    this._logger.flush?.();
  }
}

const logger = new LoggerService();

export { LoggerService, logger };
export default logger;
