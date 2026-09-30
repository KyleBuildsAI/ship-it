// Must be the first import: it installs an in-memory IndexedDB before Dexie looks for one.
import 'fake-indexeddb/auto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { hud } from '../hud';
import { sampleAct, sampleMission } from '../missions/sample.test-mission';
import {
  flushProgress,
  progress,
  startProgress,
  updateSave,
  type ProgressStorage,
} from '../progress';
import { clearSave, closeSaveDatabase, loadSave, writeSave } from '../save/db';
import { validateSave } from '../save/migrations';
import { createDefaultSave, createMissionProgress, type SaveData } from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { setCatalog } from './catalog';
import {
  asksToUnlock,
  bossAccess,
  isUnlocked,
  setUnlockAll,
  unlockFromAddress,
  withoutUnlockParam,
  withUnlock,
  type AddressBar,
} from './unlock';

const GAME = 'http://localhost:18173/';

/** A new save with every Act locked again, as Settings leaves it for normal progression. */
const locked = (): SaveData => withUnlock(createDefaultSave(TEST_NOW), false);

/** An address bar that remembers every address it was given. */
function fakeAddress(href: string): AddressBar & { readonly history: string[] } {
  const history = [href];
  return {
    history,
    href: () => history.at(-1) ?? href,
    replace: (next) => {
      history.push(next);
    },
  };
}

/** A save store in memory that keeps every write, and a save that loads when told to. */
function memoryStorage(initial: SaveData = createDefaultSave(TEST_NOW)) {
  const writes: SaveData[] = [];
  let finishLoading: (save: SaveData) => void = () => undefined;
  const loaded = new Promise<SaveData>((resolve) => {
    finishLoading = resolve;
  });
  const storage: ProgressStorage = {
    load: () => loaded,
    write: (save) => {
      writes.push(save);
      return Promise.resolve();
    },
  };
  return {
    storage,
    writes,
    finishLoading: () => {
      finishLoading(initial);
    },
  };
}

afterEach(() => {
  progress.update({ status: 'loading', save: null, problem: null });
  hud.update({ actMenu: null });
});

afterAll(async () => {
  await clearSave();
  closeSaveDatabase();
});

describe('the unlock-everything setting', () => {
  it('is on in a new save, and off with no save at all', () => {
    expect(createDefaultSave(TEST_NOW).settings.unlockAll).toBe(true);
    expect(isUnlocked(createDefaultSave(TEST_NOW))).toBe(true);
    expect(isUnlocked(null)).toBe(false);
  });

  it('reads as on in a save written before it existed, with no version bump', () => {
    const save = createDefaultSave(TEST_NOW);
    const olderSettings: Record<string, unknown> = { ...save.settings };
    delete olderSettings.unlockAll;
    const loaded = validateSave({ ...save, settings: olderSettings });
    expect(loaded.schemaVersion).toBe(save.schemaVersion);
    expect(loaded.settings.unlockAll).toBe(true);
  });

  it('turns on and off without touching anything else, and skips a change that is none', () => {
    const save = locked();
    const on = withUnlock(save, true);
    expect(isUnlocked(on)).toBe(true);
    expect({ ...on.settings, unlockAll: false }).toEqual(save.settings);
    expect(withUnlock(on, true)).toBe(on);
    expect(isUnlocked(withUnlock(on, false))).toBe(false);
  });

  it('survives closing the database, like every other setting', async () => {
    await writeSave(withUnlock(createDefaultSave(TEST_NOW), true));
    closeSaveDatabase();
    expect(isUnlocked(await loadSave(TEST_NOW))).toBe(true);
  });
});

describe('the ?unlock=all address flag', () => {
  it('asks for preview mode only with exactly unlock=all', () => {
    expect(asksToUnlock('?unlock=all')).toBe(true);
    expect(asksToUnlock('?backend=webgl2&unlock=all')).toBe(true);
    expect(asksToUnlock('')).toBe(false);
    expect(asksToUnlock('?unlock=1')).toBe(false);
    expect(asksToUnlock('?unlock')).toBe(false);
  });

  it('leaves the address with every other part kept', () => {
    expect(withoutUnlockParam(`${GAME}?unlock=all`)).toBe(GAME);
    expect(withoutUnlockParam('http://localhost:4173/ship-it/?backend=webgl2&unlock=all#top')).toBe(
      'http://localhost:4173/ship-it/?backend=webgl2#top',
    );
  });

  it('waits for the save, turns preview on, saves it, and takes the flag out', async () => {
    const { storage, writes, finishLoading } = memoryStorage(locked());
    const address = fakeAddress(`${GAME}?unlock=all`);
    const starting = startProgress(storage, TEST_NOW);
    unlockFromAddress(address);
    expect(address.history).toHaveLength(1);

    finishLoading();
    await starting;
    expect(isUnlocked(progress.get().save)).toBe(true);
    expect(address.href()).toBe(GAME);
    await flushProgress();
    expect(isUnlocked(writes.at(-1) ?? null)).toBe(true);
  });

  it('keeps preview on once the flag is gone, until Settings turns it off', async () => {
    const { storage, finishLoading } = memoryStorage(withUnlock(createDefaultSave(TEST_NOW), true));
    finishLoading();
    await startProgress(storage, TEST_NOW);
    const address = fakeAddress(GAME);
    unlockFromAddress(address);
    expect(isUnlocked(progress.get().save)).toBe(true);
    expect(address.history).toEqual([GAME]);

    setUnlockAll(false);
    expect(isUnlocked(progress.get().save)).toBe(false);
  });

  it('changes nothing without the flag', async () => {
    const { storage, finishLoading } = memoryStorage(locked());
    finishLoading();
    await startProgress(storage, TEST_NOW);
    const address = fakeAddress(`${GAME}?backend=webgl2`);
    unlockFromAddress(address);
    expect(isUnlocked(progress.get().save)).toBe(false);
    expect(address.history).toHaveLength(1);
  });

  it('keeps the flag for next time when the save could not load', () => {
    progress.update({ status: 'failed', save: null, problem: 'Your save could not be read.' });
    const address = fakeAddress(`${GAME}?unlock=all`);
    unlockFromAddress(address);
    expect(address.history).toHaveLength(1);
  });
});

describe('who can fight a boss', () => {
  const allDone = (save: SaveData): SaveData => ({
    ...save,
    missions: Object.fromEntries(
      sampleAct.missionIds.map((id, index) => [
        id,
        { ...createMissionProgress(), status: index === 0 ? 'tested-out' : 'completed' },
      ]),
    ),
  });

  it('keeps the boss locked until every mission is done, without preview', () => {
    const save = locked();
    expect(bossAccess(save, sampleAct)).toBe('locked');
    expect(bossAccess(allDone(save), sampleAct)).toBe('earned');
  });

  it('opens the boss for preview before the missions are done', () => {
    const preview = withUnlock(createDefaultSave(TEST_NOW), true);
    expect(bossAccess(preview, sampleAct)).toBe('preview');
  });

  it('still calls it earned in preview once the missions are done', () => {
    const preview = withUnlock(createDefaultSave(TEST_NOW), true);
    expect(bossAccess(allDone(preview), sampleAct)).toBe('earned');
  });
});

describe('turning preview off in Settings', () => {
  async function unlockedGame() {
    setCatalog({ acts: [{ act: sampleAct, missions: [sampleMission] }] });
    const { storage, finishLoading } = memoryStorage(withUnlock(createDefaultSave(TEST_NOW), true));
    finishLoading();
    await startProgress(storage, TEST_NOW);
  }

  it('closes the menu of an Act the game does not have yet', async () => {
    await unlockedGame();
    hud.update({ actMenu: 5 });
    setUnlockAll(false);
    expect(hud.get().actMenu).toBeNull();
  });

  it("leaves a real Act's menu open", async () => {
    await unlockedGame();
    hud.update({ actMenu: sampleAct.act });
    setUnlockAll(false);
    expect(hud.get().actMenu).toBe(sampleAct.act);
    updateSave((save) => withUnlock(save, true));
    setUnlockAll(true);
    expect(hud.get().actMenu).toBe(sampleAct.act);
  });
});
