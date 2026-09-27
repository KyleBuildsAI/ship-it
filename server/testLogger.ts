import { vi } from 'vitest';
import type { Logger } from './logger';

/** A Logger for tests: records every line so assertions can check what was logged. */
export function createTestLogger() {
  const logger = {
    info: vi.fn<Logger['info']>(),
    warn: vi.fn<Logger['warn']>(),
    error: vi.fn<Logger['error']>(),
  } satisfies Logger;
  return logger;
}
