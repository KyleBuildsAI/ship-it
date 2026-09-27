import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleLogger } from './logger';

describe('consoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefixes every line with [sage] and keeps the matching console level', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    consoleLogger.info('listening');
    consoleLogger.warn('cap is odd');
    consoleLogger.error('disk full');

    expect(info).toHaveBeenCalledWith('[sage] listening');
    expect(warn).toHaveBeenCalledWith('[sage] cap is odd');
    expect(error).toHaveBeenCalledWith('[sage] disk full');
  });
});
