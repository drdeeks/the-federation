// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// Lightweight structured logger (no external dependencies). Distinct from
// logger.js (the Pino-backed service logger) — this is the minimal core
// variant; both were ported from their respective original locations and
// renamed here to avoid a filename collision when flattened into this layer.
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || "info"] ?? 1;

function log(level, msg, meta = {}) {
  if (LEVELS[level] < currentLevel) return;
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  const out = level === "error" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (msg, meta) => log("debug", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};
