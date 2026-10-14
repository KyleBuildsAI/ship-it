import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EngineEvent } from '../../engine/workspace';
import { describeChanges } from '../agent/effects';
import { INSTANT_PACE } from '../agent/pace';
import { onTerminalFeed } from '../agent/terminalFeed';
import { hud } from '../hud';
import { evaluate, type Predicate } from '../missions/predicates';
import { gitDirectedAct, gitDirectedMission } from '../missions/sample.test-gitDirected';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../progress';
import { sandbox } from '../sandbox';
import { createDefaultSave, type SaveData } from '../save/schema';
import { checkClaim, decide, nextStep, pickCard, predict, rewind, runLook } from './agentPlay';
import { setCatalog } from './catalog';
import { endBriefing, startMission } from './missionPlay';
import { framePlay, leavePlay } from './play';
import { play, type MissionActivity } from './playStore';
import { currentQueries } from './sandboxControl';

/*
 * The directed git sample played the way the game plays it: Otto's lines go through the
 * live sandbox the Git World watches, gates come from dry runs of the live log, and a
 * step's resume point brings the Vault back for the next step's dry runs.
 */

const NOW = new Date('2026-10-14T12:00:00.000Z');
const mission = gitDirectedMission;

let stored: SaveData;
const storage: ProgressStorage = {
  load: () => Promise.resolve(stored),
  write: (save) => {
    stored = save;
    return Promise.resolve();
  },
};

function current(): MissionActivity {
  const activity = play.get().activity;
  if (activity?.kind !== 'mission') throw new Error('no mission is being played');
  return activity;
}

const stage = () => current().agent?.stage;
const holds = (predicate: Predicate) => evaluate(predicate, currentQueries());
const commits = (count: number): Predicate => ({ kind: 'commitCount', equals: count });

/** Moves Otto on until he waits for Kyle. */
function ottoWaits(): void {
  framePlay(16, INSTANT_PACE);
}

/** Everything the terminal is sent while `body` runs, keys and output, as plain text. */
function terminalText(body: () => void): string {
  const shown: string[] = [];
  const stop = onTerminalFeed((reveals) => {
    for (const reveal of reveals) {
      if (reveal.kind === 'keys') shown.push(reveal.text);
      else if (reveal.beat.kind === 'output') {
        shown.push(reveal.beat.lines.map((line) => line.text).join('\n'));
      }
    }
  });
  try {
    body();
  } finally {
    stop();
  }
  return shown.join('\n');
}

/** Step 1 the strong way: stage only app.ts, predict the dock, confirm, next. */
function commitTheEdit(): void {
  pickCard('just-app');
  ottoWaits();
  predict('dock');
  ottoWaits();
  checkClaim('only-app');
  nextStep();
}

beforeEach(async () => {
  stored = createDefaultSave(NOW);
  setCatalog({ acts: [{ act: gitDirectedAct, missions: [mission] }] });
  await startProgress(storage, NOW);
  startMission(mission.id);
  endBriefing();
});

afterEach(async () => {
  leavePlay();
  await flushProgress();
});

describe('directing Otto on a git project', () => {
  it('keeps the terminal closed, and the Git World hears every line Otto runs', () => {
    expect(hud.get().terminalOpen).toBe(false);
    const heard: EngineEvent[] = [];
    const stop = sandbox.get().shell.ws.events.on((event) => heard.push(event));

    pickCard('just-app');
    ottoWaits();
    expect(stage()?.at).toBe('predict');
    predict('dock');
    ottoWaits();
    stop();
    expect(stage()?.at).toBe('check');
    expect(heard.map((event) => event.type)).toEqual([
      'staged',
      'committed',
      'branchMoved',
      'headMoved',
    ]);

    const looked = terminalText(() => {
      runLook('log');
      ottoWaits();
    });
    expect(looked).toContain('feat: greet the team');

    checkClaim('only-app');
    expect(stage()).toMatchObject({ at: 'result', verdict: 'confirmed', passed: true });
    expect(current().stars).toEqual({ 'commit-app': { plan: true, safety: true, check: true } });
    nextStep();
    expect(current().run.stepIndex).toBe(1);
    expect(hud.get().terminalOpen).toBe(false);
  });

  it('stops at reset --hard, says what it throws away, and a deny keeps the edit', () => {
    pickCard('start-clean');
    ottoWaits();
    const gate = stage();
    if (gate?.at !== 'gate') throw new Error('Otto should be waiting at a gate.');
    expect(gate.gate).toMatchObject({ kind: 'line', line: 'git reset --hard', harmful: true });
    expect(describeChanges(gate.gate.changes, (path) => path)).toEqual([
      'Throws away the unsaved edits to app.ts',
    ]);

    decide(false);
    ottoWaits();
    expect(stage()).toEqual({ at: 'direct', round: 'fix' });
    expect(holds({ kind: 'workingFile', path: 'app.ts', contains: 'team' })).toBe(true);
    expect(current().slips).toEqual([
      { stepId: 'commit-app', planId: 'start-clean', slip: 'big-hammer', caught: true },
    ]);
  });
});

describe('a directed git mission picked up from the save', () => {
  it("starts the next step on the saved Vault, and its gates see that Vault's history", async () => {
    commitTheEdit();
    await flushProgress();
    expect(progress.get().save?.missions[mission.id]?.resume?.workbench).not.toBeNull();

    leavePlay();
    await startProgress(storage, NOW);
    startMission(mission.id);
    expect(current().run.stepIndex).toBe(1);
    expect(stage()).toEqual({ at: 'direct', round: 'start' });
    expect(holds(commits(3))).toBe(true);

    // The dry run replays the saved Vault, so it knows reset --hard HEAD~2 drops two commits.
    pickCard('go-back');
    ottoWaits();
    const gate = stage();
    if (gate?.at !== 'gate') throw new Error('Otto should be waiting at a gate.');
    expect(gate.gate.harmful).toBe(true);
    expect(describeChanges(gate.gate.changes, (path) => path)[0]).toBe(
      'Takes 2 commits off main, newest "feat: greet the team"',
    );

    // Allowed, it really drops them; Rewind brings the saved Vault back.
    decide(true);
    ottoWaits();
    expect(holds(commits(1))).toBe(true);
    rewind();
    expect(holds(commits(3))).toBe(true);
    expect(stage()).toEqual({ at: 'direct', round: 'start' });
  });
});
