import { hud } from './hud';
import { isSavingHere, progress, saveProgressNow } from './progress';
import { createStore } from './store';
import { worldState, type ZoneId } from './worldState';

/**
 * The first-run tutorial: a short card that teaches the controls by having the player use
 * them. Each step waits for the player to actually do the thing (walk, jump, run a command)
 * and moves on by itself, so there is nothing to read twice and no "Next" button to hunt for.
 */

export type TutorialStepId = 'walk' | 'jump' | 'look' | 'command' | 'terminal' | 'portal';

export interface TutorialStep {
  readonly id: TutorialStepId;
  readonly title: string;
  readonly instruction: string;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'walk',
    title: 'Walk',
    instruction: 'Press W, A, S or D to walk. You can also click the ground to walk there.',
  },
  {
    id: 'jump',
    title: 'Jump',
    instruction:
      'Press Space to jump. If nothing happens, click the world first so it gets the keys.',
  },
  {
    id: 'look',
    title: 'Look around',
    instruction: 'Hold the left mouse button and drag to turn the camera.',
  },
  {
    id: 'command',
    title: 'Run a command',
    instruction:
      'Click the terminal at the bottom, type pwd and press Enter. pwd prints the folder you are in.',
  },
  {
    id: 'terminal',
    title: 'Hide the terminal',
    instruction:
      'Press Ctrl and ` (the key above Tab) to hide the terminal, then press them again to bring it back.',
  },
  {
    id: 'portal',
    title: 'Start learning',
    instruction: 'Walk into the glowing portal, or click it, to start an Act.',
  },
];

/**
 * What the player has done so far this session. Counters only ever go up, so a step is done
 * when its counter has grown since the step began, whatever the player did before it.
 */
export interface TutorialSignals {
  readonly walks: number;
  readonly jumps: number;
  readonly looks: number;
  readonly commandsRun: number;
  readonly terminalToggles: number;
  readonly terminalOpen: boolean;
  readonly zone: ZoneId;
  readonly actMenuOpen: boolean;
}

export function isStepDone(
  step: TutorialStepId,
  now: TutorialSignals,
  atStart: TutorialSignals,
): boolean {
  switch (step) {
    case 'walk':
      return now.walks > atStart.walks;
    case 'jump':
      return now.jumps > atStart.jumps;
    case 'look':
      return now.looks > atStart.looks;
    case 'command':
      return now.commandsRun > atStart.commandsRun;
    case 'terminal':
      // Hidden and shown again, or opened if it started closed: either way it ends up open.
      return now.terminalToggles > atStart.terminalToggles && now.terminalOpen;
    case 'portal':
      return now.zone !== 'campus' || now.actMenuOpen;
  }
}

/** Which step the player is on, and the signals as they were when that step began. */
export interface TutorialPosition {
  readonly step: number;
  readonly atStart: TutorialSignals;
}

/**
 * Moves past every step the player has done. A step that is already done when it begins
 * (standing in the Git World at the portal step) passes straight away. Returns a step equal
 * to TUTORIAL_STEPS.length once the tutorial is finished.
 */
export function advance(position: TutorialPosition, now: TutorialSignals): TutorialPosition {
  let { step, atStart } = position;
  let current = TUTORIAL_STEPS[step];
  while (current !== undefined && isStepDone(current.id, now, atStart)) {
    step += 1;
    atStart = now;
    current = TUTORIAL_STEPS[step];
  }
  return step === position.step ? position : { step, atStart };
}

export interface TutorialState {
  /** The step on screen while the tutorial runs, or null when it isn't running. */
  step: number | null;
  /** The last step is done: the card says well done until the player closes it. */
  finished: boolean;
}

export const tutorial = createStore<TutorialState>({ step: null, finished: false });

export function readSignals(): TutorialSignals {
  const { walks, jumps, looks, zone } = worldState.get();
  const { commandsRun, terminalToggles, terminalOpen, actMenu } = hud.get();
  const actMenuOpen = actMenu !== null;
  return { walks, jumps, looks, commandsRun, terminalToggles, terminalOpen, zone, actMenuOpen };
}

let position: TutorialPosition | null = null;
let clock: () => Date = () => new Date();

function show(next: TutorialPosition | null, finished = false): void {
  position = next;
  tutorial.update({ step: next?.step ?? null, finished });
}

// Callers hide the card before calling this: saving notifies check() straight away, and it
// must see a finished tutorial, not the last step still waiting to be recorded.
function markDone(): void {
  const completedAt = clock().toISOString();
  // Stored at once, like a finished mission, so closing the tab right after can't bring it back.
  saveProgressNow((save) => ({ ...save, tutorial: { completedAt } }));
}

function check(): void {
  const { status, save } = progress.get();
  if (status === 'elsewhere') {
    // Another tab has the save; this one is covered by a notice and can't record anything.
    show(null);
    return;
  }
  if (position === null) {
    if (status === 'ready' && save?.tutorial.completedAt === null && isSavingHere()) {
      replayTutorial();
    }
    return;
  }
  const next = advance(position, readSignals());
  if (next === position) return;
  if (next.step >= TUTORIAL_STEPS.length) {
    show(null, true);
    markDone();
    return;
  }
  show(next);
}

/**
 * Starts watching for a save whose tutorial isn't done yet, and runs the tutorial for it.
 * Returns a function that stops watching. `now` is replaceable so tests get fixed times.
 */
export function startTutorial(now: () => Date = () => new Date()): () => void {
  clock = now;
  const stops = [progress, worldState, hud].map((store) => store.subscribe(check));
  check();
  return () => {
    for (const stop of stops) stop();
    show(null);
  };
}

/** Starts from the first step, whether or not the player has done it before. */
export function replayTutorial(): void {
  show({ step: 0, atStart: readSignals() });
}

/** Ends the tutorial for good; Settings can still replay it. */
export function skipTutorial(): void {
  show(null);
  markDone();
}

/** Closes the "well done" card. */
export function dismissTutorial(): void {
  show(null);
}
