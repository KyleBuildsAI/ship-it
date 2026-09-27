import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestLogger } from './testLogger';
import { localDateStamp, openUsageStore, type UsageRecord } from './usage';

describe('localDateStamp', () => {
  it('formats the local date as YYYY-MM-DD with zero padding', () => {
    expect(localDateStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('openUsageStore', () => {
  let directory: string;
  let filePath: string;
  let today: string;
  let logger: ReturnType<typeof createTestLogger>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sage-usage-'));
    filePath = join(directory, 'usage.json');
    today = '2026-09-27';
    logger = createTestLogger();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function open(dailyCallCap = 3) {
    return openUsageStore({ filePath, dailyCallCap, logger, today: () => today });
  }

  async function readSaved(): Promise<unknown> {
    return JSON.parse(await readFile(filePath, 'utf8'));
  }

  async function writeSaved(record: UsageRecord) {
    await writeFile(filePath, JSON.stringify(record), 'utf8');
  }

  it('starts at zero when there is no usage file yet, without warning', async () => {
    const store = await open();

    expect(store.current()).toEqual({
      date: '2026-09-27',
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(store.dailyCallCap).toBe(3);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('saves each reserved call so the count survives a restart', async () => {
    const store = await open();
    await store.tryReserveCall();
    await store.tryReserveCall();

    expect(await readSaved()).toMatchObject({ date: '2026-09-27', calls: 2 });
    const restarted = await open();
    expect(restarted.current().calls).toBe(2);
  });

  it('stops at the daily cap and claims nothing more', async () => {
    const store = await open(2);

    expect(await store.tryReserveCall()).toBe(true);
    expect(await store.tryReserveCall()).toBe(true);
    expect(await store.tryReserveCall()).toBe(false);
    expect(store.current().calls).toBe(2);
  });

  it('never goes over the cap when requests arrive at the same moment', async () => {
    const store = await open(3);

    const results = await Promise.all(Array.from({ length: 6 }, () => store.tryReserveCall()));

    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await readSaved()).toMatchObject({ calls: 3 });
  });

  it('blocks every call when the cap is zero', async () => {
    const store = await open(0);

    expect(await store.tryReserveCall()).toBe(false);
  });

  it('adds up token counts and saves them', async () => {
    const store = await open();

    await store.recordTokens({ inputTokens: 100, outputTokens: 20 });
    await store.recordTokens({ inputTokens: 50, outputTokens: 5 });

    expect(await readSaved()).toMatchObject({ inputTokens: 150, outputTokens: 25 });
  });

  it('starts a fresh count when yesterday is stored in the file', async () => {
    await writeSaved({ date: '2026-09-26', calls: 3, inputTokens: 900, outputTokens: 90 });

    const store = await open(3);

    expect(store.current()).toMatchObject({ date: '2026-09-27', calls: 0, inputTokens: 0 });
    expect(await store.tryReserveCall()).toBe(true);
  });

  it('rolls over at midnight while the server keeps running', async () => {
    const store = await open(1);
    await store.tryReserveCall();
    expect(await store.tryReserveCall()).toBe(false);

    today = '2026-09-28';

    expect(await store.tryReserveCall()).toBe(true);
    expect(await readSaved()).toMatchObject({ date: '2026-09-28', calls: 1 });
  });

  it('adds tokens reported after midnight to the new day, not yesterday', async () => {
    const store = await open();
    await store.recordTokens({ inputTokens: 100, outputTokens: 20 });

    today = '2026-09-28';
    await store.recordTokens({ inputTokens: 7, outputTokens: 3 });

    expect(await readSaved()).toEqual({
      date: '2026-09-28',
      calls: 0,
      inputTokens: 7,
      outputTokens: 3,
    });
  });

  it('uses the real local date when no clock is passed in', async () => {
    const store = await openUsageStore({ filePath, dailyCallCap: 3, logger });

    expect(store.current().date).toBe(localDateStamp());
  });

  it('resets with a warning instead of crashing when the file is not JSON', async () => {
    await writeFile(filePath, '{"date": "2026-09-27", "calls": 4', 'utf8');

    const store = await open();

    expect(store.current().calls).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('corrupt'));
  });

  it('resets with a warning when the JSON has the wrong shape', async () => {
    await writeFile(filePath, JSON.stringify({ date: 'today', calls: -1 }), 'utf8');

    const store = await open();

    expect(store.current().calls).toBe(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('resets with a warning when the path cannot be read as a file', async () => {
    // A directory where the file should be makes readFile fail with something other than ENOENT.
    await mkdir(filePath);

    const store = await open();

    expect(store.current().calls).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not read'));
  });

  it('keeps counting in memory and logs an error when saving fails', async () => {
    filePath = join(directory, 'missing-folder', 'usage.json');
    const store = await open(1);

    expect(await store.tryReserveCall()).toBe(true);
    expect(await store.tryReserveCall()).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not save usage'));
  });

  it('leaves no temp file behind after saving', async () => {
    const store = await open();

    await store.tryReserveCall();

    expect(await readdir(directory)).toEqual(['usage.json']);
  });
});
