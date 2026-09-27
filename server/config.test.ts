import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAILY_CALL_CAP,
  DEFAULT_INTERVIEW_MODEL,
  DEFAULT_MODEL,
  DEFAULT_PORT,
  loadConfig,
} from './config';
import { createTestLogger } from './testLogger';

describe('loadConfig', () => {
  it('uses the DESIGN.md defaults when nothing is set', () => {
    const logger = createTestLogger();

    const config = loadConfig({}, logger);

    expect(config).toEqual({
      apiKey: null,
      models: { default: DEFAULT_MODEL, interview: DEFAULT_INTERVIEW_MODEL },
      dailyCallCap: DEFAULT_DAILY_CALL_CAP,
      port: DEFAULT_PORT,
    });
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5');
    expect(DEFAULT_INTERVIEW_MODEL).toBe('claude-opus-5-5');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('treats blank values from a copied .env.example as unset', () => {
    const config = loadConfig(
      { ANTHROPIC_API_KEY: '  ', MENTOR_MODEL_DEFAULT: '', MENTOR_DAILY_CALL_CAP: '' },
      createTestLogger(),
    );

    expect(config.apiKey).toBeNull();
    expect(config.models.default).toBe(DEFAULT_MODEL);
    expect(config.dailyCallCap).toBe(DEFAULT_DAILY_CALL_CAP);
  });

  it('reads every variable when set', () => {
    const config = loadConfig(
      {
        ANTHROPIC_API_KEY: 'test-key-value',
        MENTOR_MODEL_DEFAULT: 'claude-opus-5',
        MENTOR_MODEL_INTERVIEW: 'claude-fable-5-1',
        MENTOR_DAILY_CALL_CAP: '12',
        MENTOR_PORT: '9000',
      },
      createTestLogger(),
    );

    expect(config).toEqual({
      apiKey: 'test-key-value',
      models: { default: 'claude-opus-5', interview: 'claude-fable-5-1' },
      dailyCallCap: 12,
      port: 9000,
    });
  });

  it('allows a cap of zero, which switches Sage off for the day', () => {
    expect(loadConfig({ MENTOR_DAILY_CALL_CAP: '0' }, createTestLogger()).dailyCallCap).toBe(0);
  });

  it.each(['fifty', '-5', '2.5', '1e3'])(
    'falls back to the default cap with a warning for %s',
    (raw) => {
      const logger = createTestLogger();

      const config = loadConfig({ MENTOR_DAILY_CALL_CAP: raw }, logger);

      expect(config.dailyCallCap).toBe(DEFAULT_DAILY_CALL_CAP);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MENTOR_DAILY_CALL_CAP'));
    },
  );

  it.each(['0', '70000', 'http'])('rejects the out-of-range port %s', (raw) => {
    const logger = createTestLogger();

    expect(loadConfig({ MENTOR_PORT: raw }, logger).port).toBe(DEFAULT_PORT);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MENTOR_PORT'));
  });

  it('warns that MENTOR_BASE_URL is not supported yet instead of silently using it', () => {
    const logger = createTestLogger();

    loadConfig({ MENTOR_BASE_URL: 'http://localhost:4000' }, logger);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('MENTOR_BASE_URL'));
  });
});
