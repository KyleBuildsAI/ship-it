import { sha1 } from './hash';
import type { RepositoryDeps } from './repository';

/** 2026-09-26 12:00:00 UTC: a fixed start so commit ids are identical on every run. */
export const TEST_EPOCH = Date.UTC(2026, 8, 26, 12, 0, 0);

/** Deterministic dependencies for tests: real SHA-1 and a clock that ticks one minute per call. */
export function testDeps(): RepositoryDeps {
  let tick = 0;
  return {
    hash: sha1,
    clock: () => TEST_EPOCH + 60_000 * tick++,
    author: { name: 'Kyle', email: 'kyle@quillwork.ai' },
  };
}
