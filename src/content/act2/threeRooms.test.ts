import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import type { EngineEvent } from '../../engine/workspace';
import { describeChanges } from '../../game/agent/effects';
import { INSTANT_PACE } from '../../game/agent/pace';
import { dryRun } from '../../game/agent/replay';
import { hud } from '../../game/hud';
import { beginAgentStep } from '../../game/missions/agentRunner';
import { evaluate, type Predicate } from '../../game/missions/predicates';
import type { Mission } from '../../game/missions/schema';
import { checkClaim, decide, nextStep, pickCard, predict } from '../../game/play/agentPlay';
import { setCatalog } from '../../game/play/catalog';
import { endBriefing, startMission } from '../../game/play/missionPlay';
import { framePlay, leavePlay } from '../../game/play/play';
import { play, type MissionActivity } from '../../game/play/playStore';
import { currentQueries } from '../../game/play/sandboxControl';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../../game/progress';
import { sandbox } from '../../game/sandbox';
import { createDefaultSave, type SaveData } from '../../game/save/schema';
import { describeDirectedMission, describeJudgmentDrills } from '../act1/directed.test-helpers';
import { beginStep, canonicalStart, playCard } from '../act1/play.test-helpers';
import { act2, act2Missions } from './index';

/*
 * Mission 2.1, Three Rooms, played card by card and drill by drill
 * (directed.test-helpers.ts), on a git project instead of the laptop. The tables are what
 * each card and drill is meant to do; the engine works out every answer by running them.
 *
 * The mission pauses on every change (`changes`), so git init, each git add, each commit
 * and each unstage asks first. The only harmful lines load todo.txt into git: Kyle denies
 * those, and Otto, with no plan B, stops for new directions ('direct').
 */

function threeRooms(): Mission {
  const mission = act2Missions.find((candidate) => candidate.id === 'three-rooms');
  if (mission === undefined) throw new Error('Act 2 has no three-rooms mission.');
  return mission;
}

const mission = threeRooms();

const ADD_PROJECT = 'git add README.md src';
const UNTRACK_ALL = 'git rm --cached -r .';
const FIRST_VERSION = 'git commit -m "first version"';
const COMMIT_APP = 'git commit -m "feat: add notes app"';
const COMMIT_DOCS = 'git commit -m "docs: explain how to run the app"';

describeDirectedMission(mission, {
  start: {
    'start-tracking': {
      'save-it': { passed: false, check: 'no-repo' },
      'init-only': { passed: true, check: 'four-new' },
      'init-status': { passed: true, check: 'four-new' },
    },
    'first-commit': {
      'commit-all': {
        'allow-all': { passed: false, check: 'todo-too' },
        'deny-harmful': 'direct',
      },
      'stage-project': { passed: false, check: 'empty' },
      'status-first': { passed: true, check: 'project' },
    },
    'commit-edit': {
      'commit-changes': {
        'allow-all': { passed: false, check: 'with-todo' },
        'deny-harmful': 'direct',
      },
      'just-commit': { passed: false, check: 'workbench' },
      'add-readme': { passed: true, check: 'committed' },
    },
  },
  fixes: {
    'start-tracking': {
      'save-it > fix-init': { passed: true, check: 'four-new' },
      'save-it > init-status': { passed: true, check: 'four-new' },
    },
    'first-commit': {
      'stage-project > commit-dock': { passed: true, check: 'project' },
      'stage-project > status-first': { passed: true, check: 'project' },
      'stage-project > restage': { passed: true, check: 'project' },
      'commit-all > restage': { passed: true, check: 'project' },
      // Everything is already committed, so the commit finds an empty dock: Otto stops.
      'commit-all > commit-dock': 'direct',
    },
    'commit-edit': {
      'just-commit > stage-readme': { passed: true, check: 'committed' },
      'just-commit > add-readme': { passed: true, check: 'committed' },
      'just-commit > restage-readme': { passed: true, check: 'committed' },
      'commit-changes > restage-readme': { passed: true, check: 'committed' },
      'commit-changes > stage-readme': 'direct',
    },
  },
  // Every line that pauses in `changes` mode, and whether a dry run finds it harmful.
  // Only git add . is: it loads todo.txt. The commit after it seals harm already done.
  gates: {
    'start-tracking > init-only > git init': false,
    'start-tracking > init-status > git init': false,
    'start-tracking > save-it > fix-init > git init': false,
    'start-tracking > save-it > init-only > git init': false,
    'start-tracking > save-it > init-status > git init': false,

    'first-commit > commit-all > git add .': true,
    [`first-commit > commit-all > ${FIRST_VERSION}`]: false,
    [`first-commit > commit-all > restage > ${UNTRACK_ALL}`]: false,
    [`first-commit > commit-all > restage > ${ADD_PROJECT}`]: false,
    [`first-commit > commit-all > restage > ${COMMIT_APP}`]: false,
    [`first-commit > stage-project > ${ADD_PROJECT}`]: false,
    'first-commit > stage-project > commit-all > git add .': true,
    [`first-commit > stage-project > commit-all > ${FIRST_VERSION}`]: false,
    [`first-commit > stage-project > commit-dock > ${COMMIT_APP}`]: false,
    [`first-commit > stage-project > restage > ${UNTRACK_ALL}`]: false,
    [`first-commit > stage-project > restage > ${ADD_PROJECT}`]: false,
    [`first-commit > stage-project > restage > ${COMMIT_APP}`]: false,
    [`first-commit > stage-project > status-first > ${COMMIT_APP}`]: false,
    [`first-commit > status-first > ${ADD_PROJECT}`]: false,
    [`first-commit > status-first > ${COMMIT_APP}`]: false,

    'commit-edit > add-readme > git add README.md': false,
    [`commit-edit > add-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > commit-changes > git add .': true,
    'commit-edit > commit-changes > git commit -m "update"': false,
    [`commit-edit > commit-changes > restage-readme > ${UNTRACK_ALL}`]: false,
    [`commit-edit > commit-changes > restage-readme > ${ADD_PROJECT}`]: false,
    [`commit-edit > commit-changes > restage-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > just-commit > add-readme > git add README.md': false,
    [`commit-edit > just-commit > add-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > just-commit > commit-changes > git add .': true,
    'commit-edit > just-commit > commit-changes > git commit -m "update"': false,
    [`commit-edit > just-commit > restage-readme > ${UNTRACK_ALL}`]: false,
    [`commit-edit > just-commit > restage-readme > ${ADD_PROJECT}`]: false,
    [`commit-edit > just-commit > restage-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > just-commit > stage-readme > git add README.md': false,
    [`commit-edit > just-commit > stage-readme > ${COMMIT_DOCS}`]: false,
  },
});

describeJudgmentDrills(mission, {
  'rooms-approve-add-all': { key: ['deny'], wrong: 'allow' },
  'rooms-approve-add-readme': { key: ['allow'], wrong: 'deny' },
  'rooms-stage-folder': { key: ['src-only'], wrong: 'everything' },
  'rooms-commit-staged-only': { key: ['readme-only'], wrong: 'both' },
  'rooms-diagnose-staged': { key: ['on-dock'], wrong: 'in-vault' },
  'rooms-diagnose-no-repo': { key: ['no-repo'], wrong: 'on-dock' },
  'rooms-fix-todo-staged': { key: ['restore-staged'], wrong: 'rm-force' },
});

describe('Three Rooms, directed', () => {
  const [startTracking, firstCommit, commitEdit] = mission.steps;
  if (startTracking === undefined || firstCommit === undefined || commitEdit === undefined) {
    throw new Error('Three Rooms has 3 steps.');
  }

  it('starts in a plain folder, with no repository', () => {
    expect(mission.initialRepoState[0]?.op).not.toBe('init');
    expect(mission.approvals).toBe('changes');
  });

  it('tells Kyle in plain words that git add . loads todo.txt, and calls it harmful', () => {
    const start = beginStep(canonicalStart(mission, 1), firstCommit);
    const guards = firstCommit.agent?.guards ?? [];
    const dry = dryRun(start, { do: 'run', line: 'git add .' }, { guards }, testDeps());
    expect(dry.harmful).toBe(true);
    expect(dry.broken).toEqual(['todo.txt stays out of git']);
    expect(describeChanges(dry.changes, (path) => path)).toEqual([
      'Moves 4 files onto the Loading Dock',
    ]);
  });

  it('says what the strong card seals, and predicts the dock without todo.txt', () => {
    const start = beginStep(canonicalStart(mission, 1), firstCommit);
    const played = playCard(
      mission,
      firstCommit,
      { log: start, state: beginAgentStep(firstCommit) },
      'status-first',
      'deny-harmful',
    );
    expect(played.gates).toEqual([
      { line: 'git add README.md src', harmful: false },
      { line: 'git commit -m "feat: add notes app"', harmful: false },
    ]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: which crates go onto the dock?', trueOptions: ['three'] },
    ]);
  });

  it('starts step 3 with the README edit on the Workbench, unstaged', () => {
    const start = beginStep(canonicalStart(mission, 2), commitEdit);
    const guards = commitEdit.agent?.guards ?? [];
    const dry = dryRun(start, { do: 'run', line: 'git add README.md' }, { guards }, testDeps());
    expect(dry.harmful).toBe(false);
    expect(describeChanges(dry.changes, (path) => path)).toEqual([
      'Moves README.md onto the Loading Dock',
    ]);
  });
});

/*
 * The same mission played the way the game plays it (agentPlay.ts): Otto's lines go
 * through the live sandbox the Git World watches, every change pauses in `changes` mode,
 * and the save keeps a resume point per step, so a reload starts the next step on the
 * Vault the last one built.
 */
describe('Three Rooms, played in the game', () => {
  const NOW = new Date('2026-10-14T12:00:00.000Z');
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
  /** Moves Otto on until he waits for Kyle. */
  const ottoWaits = () => {
    framePlay(16, INSTANT_PACE);
  };
  /** Allows the gate Otto waits at, after checking it is the line expected. */
  function allow(line: string): void {
    const gate = stage();
    if (gate?.at !== 'gate') throw new Error(`Otto should be waiting at a gate for ${line}.`);
    expect(gate.gate).toMatchObject({ line, harmful: false });
    decide(true);
    ottoWaits();
  }

  /** Step 1 the strong way: predict, allow git init, confirm, next. */
  function makeTheRepository(): void {
    pickCard('init-status');
    ottoWaits();
    predict('stay');
    ottoWaits();
    allow('git init');
    checkClaim('four-new');
    nextStep();
  }

  beforeEach(async () => {
    stored = createDefaultSave(NOW);
    setCatalog({ acts: [{ act: act2, missions: act2Missions }] });
    await startProgress(storage, NOW);
    startMission(mission.id);
    endBriefing();
  });

  afterEach(async () => {
    leavePlay();
    await flushProgress();
  });

  it('keeps the terminal closed while Otto makes the repository and the first commit', () => {
    expect(hud.get().terminalOpen).toBe(false);
    makeTheRepository();
    expect(current().run.stepIndex).toBe(1);

    const heard: EngineEvent[] = [];
    const stop = sandbox.get().shell.ws.events.on((event) => heard.push(event));
    pickCard('status-first');
    ottoWaits();
    predict('three');
    ottoWaits();
    allow(ADD_PROJECT);
    allow(COMMIT_APP);
    stop();
    expect(heard.map((event) => event.type)).toEqual([
      'staged',
      'committed',
      'branchMoved',
      'headMoved',
    ]);
    checkClaim('project');
    expect(stage()).toMatchObject({ at: 'result', verdict: 'confirmed', passed: true });
    expect(holds({ kind: 'untracked', paths: ['todo.txt'] })).toBe(true);
    expect(hud.get().terminalOpen).toBe(false);
  });

  it('stops at git add ., says it loads all four crates, and a deny keeps todo.txt out', () => {
    makeTheRepository();
    pickCard('commit-all');
    ottoWaits();
    const gate = stage();
    if (gate?.at !== 'gate') throw new Error('Otto should be waiting at a gate.');
    expect(gate.gate).toMatchObject({ kind: 'line', line: 'git add .', harmful: true });
    expect(describeChanges(gate.gate.changes, (path) => path)).toEqual([
      'Moves 4 files onto the Loading Dock',
    ]);

    decide(false);
    ottoWaits();
    expect(stage()).toEqual({ at: 'direct', round: 'fix' });
    expect(holds({ kind: 'untracked', paths: ['todo.txt'] })).toBe(true);
    expect(current().slips).toEqual([
      { stepId: 'first-commit', planId: 'commit-all', slip: 'too-broad', caught: true },
    ]);
  });

  it('picks up at the next step from the save, on the repository step 1 made', async () => {
    makeTheRepository();
    await flushProgress();
    expect(progress.get().save?.missions[mission.id]?.resume?.workbench).not.toBeNull();

    leavePlay();
    await startProgress(storage, NOW);
    startMission(mission.id);
    expect(current().run.stepIndex).toBe(1);
    expect(stage()).toEqual({ at: 'direct', round: 'start' });
    expect(holds({ kind: 'isRepo' })).toBe(true);

    // The okay card stages and never commits: Kyle catches it, and a fix seals the dock.
    pickCard('stage-project');
    ottoWaits();
    allow(ADD_PROJECT);
    checkClaim('empty');
    expect(stage()).toMatchObject({ at: 'result', verdict: 'caught', passed: false });
  });
});
