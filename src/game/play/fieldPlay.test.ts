import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fullSampleLessonAct } from '../missions/sample.test-lessonAct';
import { flushProgress, startProgress, type ProgressStorage } from '../progress';
import { createDefaultSave } from '../save/schema';
import { setCatalog } from './catalog';
import { startFieldMission, submitFieldPaste } from './fieldPlay';
import { leavePlay } from './play';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const full = fullSampleLessonAct();

// The sample Act's two checks, and output that passes each.
const CLEAN = 'On branch main\nnothing to commit, working tree clean\n';
const LOG = 'a1b2c3d feat: add tide chart\nb2c3d4e fix: round heights\nc3d4e5f docs: add setup\n';

beforeEach(async () => {
  setCatalog({ acts: [full] });
  const storage: ProgressStorage = {
    load: () => Promise.resolve(createDefaultSave(NOW)),
    write: () => Promise.resolve(),
  };
  await startProgress(storage, NOW);
  startFieldMission(full.act.act);
});

afterEach(async () => {
  leavePlay();
  await flushProgress();
});

describe('submitFieldPaste', () => {
  it('says which pass verified the whole mission, so the panel can say so beside it', () => {
    const first = submitFieldPaste('sample-full-clean', CLEAN, NOW);
    expect(first.passed).toBe(true);
    expect(first.completedMission).toBeUndefined();
    const last = submitFieldPaste('sample-full-history', LOG, NOW);
    expect(last).toMatchObject({ passed: true, completedMission: true });
    // Checking again later passes, but the mission was verified already.
    expect(submitFieldPaste('sample-full-clean', CLEAN, NOW).completedMission).toBeUndefined();
  });

  it('never marks a failed paste as completing anything', () => {
    submitFieldPaste('sample-full-clean', CLEAN, NOW);
    const failed = submitFieldPaste('sample-full-history', 'a1b2c3d wip\n', NOW);
    expect(failed.passed).toBe(false);
    expect(failed.completedMission).toBeUndefined();
  });
});
