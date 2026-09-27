import { afterEach, describe, expect, it, vi } from 'vitest';
import { consoleLogger } from './logger';

describe('consoleLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes each level to the matching console method', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    consoleLogger.info('listening');
    consoleLogger.warn('cap is odd');
    consoleLogger.error('disk full');

    expect(info).toHaveBeenCalledWith('listening');
    expect(warn).toHaveBeenCalledWith('cap is odd');
    expect(error).toHaveBeenCalledWith('disk full');
  });
});
