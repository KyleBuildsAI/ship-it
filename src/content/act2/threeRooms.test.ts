import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { drive } from '../../engine/shell/driver';
import type { EngineEvent } from '../../engine/workspace';
import { describeChanges } from '../../game/agent/effects';
import { INSTANT_PACE } from '../../game/agent/pace';
import { dryRun, replay, withEntry } from '../../game/agent/replay';
import { hud } from '../../game/hud';
import {
  answerCheck,
  beginAgentStep,
  openFixRound,
  stepPasses,
} from '../../game/missions/agentRunner';
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
import { beginStep, canonicalStart, playCard, queriesOf } from '../act1/play.test-helpers';
import { act2, act2Missions } from './index';

/*
 * Mission 2.1, Three Rooms, played card by card and drill by drill
 * (directed.test-helpers.ts), on a git project instead of the laptop. The tables are what
 * each card and drill is meant to do; the engine works out every answer by running them.
 *
 * The mission pauses on every change (`changes`), so git init, each git add, each commit
 * and each unstage asks first. The only harmful lines put todo.txt into git: git add .
 * loads it, and the commit after seals it into history. Kyle denies those, and Otto,
 * with no plan B, stops for new directions ('direct'), where every strong card works.
 */

function threeRooms(): Mission {
  const mission = act2Missions.find((candidate) => candidate.id === 'three-rooms');
  if (mission === undefined) throw new Error('Act 2 has no three-rooms mission.');
  return mission;
}

const mission = threeRooms();

const ADD_PROJECT = 'git add README.md src';
const FIRST_VERSION = 'git commit -m "first version"';
const COMMIT_APP = 'git commit -m "feat: add notes app"';
const COMMIT_DOCS = 'git commit -m "docs: explain how to run the app"';
const UPDATE = 'git commit -m "update"';

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
      'stage-project > clear-dock': { passed: true, check: 'project' },
      'stage-project > status-first': { passed: true, check: 'project' },
      // Denied at git add ., the dock is empty and every strong card still works. Allowed,
      // todo.txt is in a commit: their commits find nothing new and Otto stops (Rewind).
      'commit-all > clear-dock': 'direct',
      'commit-all (denied) > clear-dock': { passed: true, check: 'project' },
      'commit-all > status-first': 'direct',
      'commit-all (denied) > status-first': { passed: true, check: 'project' },
      'commit-all > stage-project': { passed: false, check: 'todo-too' },
      'commit-all (denied) > stage-project': { passed: false, check: 'empty' },
    },
    'commit-edit': {
      'just-commit > stage-readme': { passed: true, check: 'committed' },
      'just-commit > add-readme': { passed: true, check: 'committed' },
      'just-commit > clear-dock-readme': { passed: true, check: 'committed' },
      'commit-changes > stage-readme': 'direct',
      'commit-changes (denied) > stage-readme': { passed: true, check: 'committed' },
      'commit-changes > clear-dock-readme': 'direct',
      'commit-changes (denied) > clear-dock-readme': { passed: true, check: 'committed' },
      'commit-changes > add-readme': 'direct',
      'commit-changes (denied) > add-readme': { passed: true, check: 'committed' },
    },
  },
  // Allowed, todo.txt is sealed into a commit. A later commit can drop it, but the older
  // one still holds it (git show prints it), and git here has no amend: only Rewind.
  rewindOnly: ['first-commit > commit-all', 'commit-edit > commit-changes'],
  // Every line that pauses in `changes` mode, and whether a dry run finds it harmful.
  // git add . is: it loads todo.txt. So is the commit after it, which seals todo.txt into
  // history, the step a later commit can't undo. git reset pauses only when the dock
  // holds something to take off.
  gates: {
    'start-tracking > init-only > git init': false,
    'start-tracking > init-status > git init': false,
    'start-tracking > save-it > fix-init > git init': false,
    'start-tracking > save-it > init-only > git init': false,
    'start-tracking > save-it > init-status > git init': false,

    'first-commit > commit-all > git add .': true,
    [`first-commit > commit-all > ${FIRST_VERSION}`]: true,
    [`first-commit > commit-all (denied) > clear-dock > ${ADD_PROJECT}`]: false,
    [`first-commit > commit-all (denied) > clear-dock > ${COMMIT_APP}`]: false,
    [`first-commit > commit-all (denied) > stage-project > ${ADD_PROJECT}`]: false,
    [`first-commit > commit-all (denied) > status-first > ${ADD_PROJECT}`]: false,
    [`first-commit > commit-all (denied) > status-first > ${COMMIT_APP}`]: false,
    [`first-commit > stage-project > ${ADD_PROJECT}`]: false,
    'first-commit > stage-project > clear-dock > git reset': false,
    [`first-commit > stage-project > clear-dock > ${ADD_PROJECT}`]: false,
    [`first-commit > stage-project > clear-dock > ${COMMIT_APP}`]: false,
    'first-commit > stage-project > commit-all > git add .': true,
    [`first-commit > stage-project > commit-all > ${FIRST_VERSION}`]: true,
    [`first-commit > stage-project > status-first > ${COMMIT_APP}`]: false,
    [`first-commit > status-first > ${ADD_PROJECT}`]: false,
    [`first-commit > status-first > ${COMMIT_APP}`]: false,

    'commit-edit > add-readme > git add README.md': false,
    [`commit-edit > add-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > commit-changes > git add .': true,
    [`commit-edit > commit-changes > ${UPDATE}`]: true,
    'commit-edit > commit-changes (denied) > add-readme > git add README.md': false,
    [`commit-edit > commit-changes (denied) > add-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > commit-changes (denied) > clear-dock-readme > git add README.md': false,
    [`commit-edit > commit-changes (denied) > clear-dock-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > commit-changes (denied) > stage-readme > git add README.md': false,
    [`commit-edit > commit-changes (denied) > stage-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > just-commit > add-readme > git add README.md': false,
    [`commit-edit > just-commit > add-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > just-commit > clear-dock-readme > git add README.md': false,
    [`commit-edit > just-commit > clear-dock-readme > ${COMMIT_DOCS}`]: false,
    'commit-edit > just-commit > commit-changes > git add .': true,
    [`commit-edit > just-commit > commit-changes > ${UPDATE}`]: true,
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

  it('names what git status really prints after git init, where Kyle is told to look', () => {
    const start = beginStep(canonicalStart(mission, 0), startTracking);
    const from = { log: start, state: beginAgentStep(startTracking) };
    const played = playCard(mission, startTracking, from, 'init-status', 'allow-all');
    const { shell } = replay(played.log, testDeps());
    const status = drive(shell, { do: 'run', line: 'git status' });
    // Like real git, a new folder is one line: app.ts and styles.css hide inside src/.
    const untracked = status.lines
      .filter((line) => line.tone === 'untracked')
      .map((line) => line.text.trim());
    expect(untracked).toEqual(['README.md', 'src/', 'todo.txt']);
    const feedback = startTracking.agent?.check.options.find((o) => o.id === 'four-new')?.feedback;
    for (const entry of untracked) expect(feedback).toContain(entry);
  });

  it('calls the commit after an allowed git add . harmful: it seals todo.txt into history', () => {
    const start = beginStep(canonicalStart(mission, 1), firstCommit);
    const loaded = withEntry(start, { kind: 'action', action: { do: 'run', line: 'git add .' } });
    const guards = firstCommit.agent?.guards ?? [];
    const commit = { do: 'run', line: FIRST_VERSION } as const;
    const dry = dryRun(loaded, commit, { guards }, testDeps());
    expect(dry.harmful).toBe(true);
    expect(dry.broken).toEqual(['No commit ever holds todo.txt']);
  });

  it('never lets a later commit pass the step once todo.txt is in history', () => {
    const start = beginStep(canonicalStart(mission, 1), firstCommit);
    // A second commit without todo.txt, on top of the one that sealed it.
    const lines = ['git add .', FIRST_VERSION, 'git rm --cached todo.txt', COMMIT_APP];
    const log = lines.reduce(
      (sofar, line) => withEntry(sofar, { kind: 'action', action: { do: 'run', line } }),
      start,
    );
    const q = queriesOf(log);
    expect(evaluate({ kind: 'fileAtHead', path: 'todo.txt' }, q)).toBe(false);
    expect(q.fileAt('HEAD~1', 'todo.txt')).toContain('buy coffee');
    expect(stepPasses(firstCommit, q)).toBe(false);
  });

  it('predicts an empty dock when the strong card runs after everything was committed', () => {
    const start = beginStep(canonicalStart(mission, 1), firstCommit);
    const from = { log: start, state: beginAgentStep(firstCommit) };
    const all = playCard(mission, firstCommit, from, 'commit-all', 'allow-all');
    const checked = answerCheck(all.state, firstCommit, 'todo-too', queriesOf(all.log));
    const round = { log: all.log, state: openFixRound(checked) };
    const again = playCard(mission, firstCommit, round, 'status-first', 'allow-all');
    expect(again.predicts.map((seen) => seen.trueOptions)).toEqual([['none']]);
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

  it('after a deny at git add ., the strong fix commits the project and leaves todo.txt out', () => {
    makeTheRepository();
    pickCard('commit-all');
    ottoWaits();
    decide(false);
    ottoWaits();
    expect(stage()).toEqual({ at: 'direct', round: 'fix' });

    // The dock is empty, so git reset has nothing to take off and never pauses.
    pickCard('clear-dock');
    ottoWaits();
    allow(ADD_PROJECT);
    allow(COMMIT_APP);
    checkClaim('project');
    expect(stage()).toMatchObject({ at: 'result', verdict: 'confirmed', passed: true });
    expect(holds({ kind: 'inHistory', path: 'todo.txt' })).toBe(false);
  });

  it('grades a deny at the commit after git add . as a catch, and todo.txt stays out', () => {
    makeTheRepository();
    pickCard('commit-all');
    ottoWaits();
    decide(true);
    ottoWaits();
    const gate = stage();
    if (gate?.at !== 'gate') throw new Error('Otto should be waiting at the commit.');
    expect(gate.gate).toMatchObject({ line: FIRST_VERSION, harmful: true });
    decide(false);
    ottoWaits();
    expect(stage()).toEqual({ at: 'direct', round: 'fix' });
    expect(holds({ kind: 'staged', paths: ['todo.txt'] })).toBe(true);
    // Denying a harmful line is the right call, so it counts as catching the slip.
    expect(current().slips).toEqual([
      { stepId: 'first-commit', planId: 'commit-all', slip: 'too-broad', caught: true },
    ]);

    // todo.txt waits on the dock: the fix's git reset pauses to take it off, and is safe.
    pickCard('clear-dock');
    ottoWaits();
    allow('git reset');
    allow(ADD_PROJECT);
    allow(COMMIT_APP);
    checkClaim('project');
    expect(stage()).toMatchObject({ at: 'result', passed: true });
    expect(holds({ kind: 'inHistory', path: 'todo.txt' })).toBe(false);
    expect(holds({ kind: 'untracked', paths: ['todo.txt'] })).toBe(true);
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
