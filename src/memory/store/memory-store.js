/**
 * Federation application adapter for the shared memory store.
 *
 * The implementation is owned by `shared/memory`; this path preserves the
 * application-facing module boundary without creating a second store.
 */
export * from '../../shared/memory/store/memory-store.js';
