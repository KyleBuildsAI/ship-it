import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hud, toggleTerminal } from './hud';
import { progress } from './progress';
import { createDefaultSave } from './save/schema';
import { TEST_NOW } from './save/testFixtures';
import {
  advance,
  dismissTutorial,
  isStepDone,
  readSignals,
  replayTutorial,
  skipTutorial,
  startTutorial,
  tutorial,
  TUTORIAL_STEPS,
  type TutorialSignals,
} from './tutorial';
import { worldState } from './worldState';

const START: TutorialSignals = {
  walks: 0,
  jumps: 0,
  looks: 0,
  commandsRun: 0,
  terminalToggles: 0,
  terminalOpen: true,
  zone: 'campus',
  actMenuOpen: false,
};

const stepIndex = (id: string) => TUTORIAL_STEPS.findIndex((step) => step.id === id);

describe('isStepDone', () => {
  it.each([
    ['walk', { walks: 1 }],
    ['jump', { jumps: 1 }],
    ['look', { looks: 1 }],
    ['command', { commandsRun: 1 }],
    ['portal', { zone: 'gitworld' }],
    ['portal', { actMenuOpen: true }],
  ] as const)('%s is done once the player does it', (step, change) => {
    expect(isStepDone(step, START, START)).toBe(false);
    expect(isStepDone(step, { ...START, ...change }, START)).toBe(true);
  });

  it('only counts what happened after the step began', () => {
    const later = { ...START, walks: 3 };

    expect(isStepDone('walk', later, later)).toBe(false);
    expect(isStepDone('walk', { ...later, walks: 4 }, later)).toBe(true);
  });

  it('wants the terminal hidden and shown again, ending open', () => {
    const hidden = { ...START, terminalToggles: 1, terminalOpen: false };
    const shownAgain = { ...START, terminalToggles: 2, terminalOpen: true };

    expect(isStepDone('terminal', hidden, START)).toBe(false);
    expect(isStepDone('terminal', shownAgain, START)).toBe(true);
  });

  it('accepts a single toggle when the terminal started closed', () => {
    const closed = { ...START, terminalOpen: false };
    const opened = { ...closed, terminalToggles: 1, terminalOpen: true };

    expect(isStepDone('terminal', opened, closed)).toBe(true);
  });
});

describe('advance', () => {
  it('stays put until the current step is done', () => {
    const position = { step: 0, atStart: START };

    expect(advance(position, START)).toBe(position);
  });

  it('moves one step and starts counting from now', () => {
    const now = { ...START, walks: 1, jumps: 5 };

    // The jumps made while walking don't count for the jump step, which begins now.
    expect(advance({ step: 0, atStart: START }, now)).toEqual({ step: 1, atStart: now });
  });

  it('passes the portal step at once when the player is already in an Act', () => {
    const inGitWorld = { ...START, zone: 'gitworld' as const, terminalToggles: 1 };
    const atToggle = { step: stepIndex('terminal'), atStart: START };

    expect(advance(atToggle, inGitWorld).step).toBe(TUTORIAL_STEPS.length);
  });
});

describe('the tutorial on screen', () => {
  let stop: () => void = () => undefined;

  beforeEach(() => {
    worldState.update({ zone: 'campus', walks: 0, jumps: 0, looks: 0 });
    hud.update({ terminalOpen: true, actMenuOpen: false, commandsRun: 0, terminalToggles: 0 });
    progress.update({ status: 'ready', save: createDefaultSave(TEST_NOW), problem: null });
  });

  afterEach(() => {
    stop();
    dismissTutorial();
  });

  const begin = () => {
    stop = startTutorial(() => TEST_NOW);
  };
  const completedAt = () => progress.get().save?.tutorial.completedAt;

  it('starts for a save that has never finished it', () => {
    begin();

    expect(tutorial.get()).toEqual({ step: 0, finished: false });
  });

  it('waits for the save to load', () => {
    progress.update({ status: 'loading', save: null });
    begin();
    expect(tutorial.get().step).toBeNull();

    progress.update({ status: 'ready', save: createDefaultSave(TEST_NOW) });
    expect(tutorial.get().step).toBe(0);
  });

  it('stays away once it has been finished or skipped', () => {
    const save = createDefaultSave(TEST_NOW);
    progress.update({ save: { ...save, tutorial: { completedAt: TEST_NOW.toISOString() } } });
    begin();

    expect(tutorial.get().step).toBeNull();
  });

  it('follows the player through every step and records the finish', () => {
    begin();

    worldState.update({ walks: 1 });
    expect(tutorial.get().step).toBe(stepIndex('jump'));
    worldState.update({ jumps: 1 });
    worldState.update({ looks: 1 });
    hud.update({ commandsRun: 1 });
    expect(tutorial.get().step).toBe(stepIndex('terminal'));
    toggleTerminal();
    toggleTerminal();
    expect(tutorial.get().step).toBe(stepIndex('portal'));
    expect(completedAt()).toBeNull();

    worldState.update({ zone: 'gitworld' });

    expect(tutorial.get()).toEqual({ step: null, finished: true });
    expect(completedAt()).toBe(TEST_NOW.toISOString());
  });

  it('can be skipped, and the skip is saved', () => {
    begin();
    skipTutorial();

    expect(tutorial.get()).toEqual({ step: null, finished: false });
    expect(completedAt()).toBe(TEST_NOW.toISOString());
  });

  it('can be replayed after it was done', () => {
    begin();
    skipTutorial();
    worldState.update({ walks: 7 });

    replayTutorial();

    // Walking before the replay doesn't count: the first step waits for a new walk.
    expect(tutorial.get().step).toBe(0);
    worldState.update({ walks: 8 });
    expect(tutorial.get().step).toBe(1);
  });

  it('steps aside when another tab takes the save', () => {
    begin();
    progress.update({ status: 'elsewhere' });

    expect(tutorial.get().step).toBeNull();
    expect(completedAt()).toBeNull();
  });

  it('reads its signals from the world and the HUD', () => {
    worldState.update({ walks: 2, zone: 'gitworld' });
    hud.update({ commandsRun: 3, terminalOpen: false });

    expect(readSignals()).toMatchObject({
      walks: 2,
      zone: 'gitworld',
      commandsRun: 3,
      terminalOpen: false,
    });
  });
});
