import { feedAction, startFeed, type FeedBeat, type FeedState } from '../agent/feed';
import { advance, START, type Pace, type Playhead } from '../agent/pace';
import { driverAction, type ContentAction, type LoggedAction } from '../agent/replay';
import { showInTerminal } from '../agent/terminalFeed';
import { MissionRunError } from '../missions/runner';
import type { JudgmentDrill } from '../missions/schema';
import { sandbox } from '../sandbox';
import { recordAction } from './sandboxControl';

/*
 * A judgment drill's scene (docs/act1-directed.md section 2.2): before the question shows,
 * the lines Otto already ran play into the live sandbox and the terminal, at 3× his pace,
 * so Kyle watches what happened instead of reading about it. The drill's clock starts only
 * when the scene ends; missionPlay.ts and seriesPlay.ts start it.
 *
 * Like Otto's playback in agentPlay.ts, the scene's progress changes every drawn frame and
 * no panel draws it, so it lives here rather than in the play store.
 */

/** How many times faster than Otto's own pace a scene plays (spec 1.2). */
export const SCENE_SPEED = 3;

interface Scene {
  /** The drill this scene belongs to, so a frame never plays another drill's lines. */
  readonly drillId: string;
  readonly history: readonly ContentAction[];
  /** How many history lines have been driven so far. */
  index: number;
  /** Otto's answer to the Confirm question the last line asked, played before the next line. */
  answerNext: LoggedAction | null;
  feed: FeedState;
  beats: readonly FeedBeat[];
  head: Playhead;
}

let scene: Scene | null = null;

/** Every history line plus its answer, with room to spare: past it, something loops. */
const MAX_TURNS = 100;

/**
 * Starts playing `drill`'s history into the live sandbox, which loadSandbox has just set
 * up. Returns false when there is nothing to play, so the clock can start straight away.
 */
export function beginScene(drill: JudgmentDrill): boolean {
  if (drill.history.length === 0) {
    scene = null;
    return false;
  }
  const tab = sandbox.get().shell.ws.machine?.active().id ?? 1;
  scene = {
    drillId: drill.id,
    history: drill.history,
    index: 0,
    answerNext: null,
    // No prompt yet: the terminal skips a prompt that matches the one already waiting.
    feed: startFeed(tab),
    beats: [],
    head: START,
  };
  return true;
}

/** The scene at `pace` sped up by SCENE_SPEED. The instant pace stays instant. */
export function scenePace(pace: Pace): Pace {
  return {
    charMs: pace.charMs / SCENE_SPEED,
    thinkMs: pace.thinkMs / SCENE_SPEED,
    settleMs: pace.settleMs / SCENE_SPEED,
  };
}

/** Where a scene got to in one frame. */
export interface SceneFrame {
  /** How many history lines have been driven, for the panel's "watching Otto" line. */
  readonly index: number;
  /** Every line has run and its output has shown: the question can appear. */
  readonly done: boolean;
}

/**
 * Plays `drillId`'s scene on by one drawn frame of `elapsedMs`. Each line is driven, then
 * its typing and output play before the next. Returns null when no scene is playing for
 * that drill, like after Kyle left and came back to a different one.
 */
export function frameScene(drillId: string, elapsedMs: number, pace: Pace): SceneFrame | null {
  const playing = scene;
  if (playing?.drillId !== drillId) return null;
  const sped = scenePace(pace);
  let elapsed = elapsedMs;
  for (let turns = 0; turns < MAX_TURNS; turns++) {
    if (playing.beats.length > 0) {
      const played = advance(playing.beats, sped, playing.head, elapsed);
      // The frame's time is spent on the beats; the next line is driven at once.
      elapsed = 0;
      showInTerminal(played.reveals);
      if (!played.done) {
        playing.head = played.head;
        return { index: playing.index, done: false };
      }
      playing.beats = [];
      playing.head = START;
    }
    const next = nextAction(playing);
    if (next === null) {
      scene = null;
      return { index: playing.index, done: true };
    }
    const step = recordAction(next);
    // A line that asks gets Otto's answer next, as it did when he really ran it.
    const asked = playing.history[playing.index - 1];
    if (next.do !== 'answer' && step.asking && asked?.do === 'run' && asked.answer !== undefined) {
      playing.answerNext = { do: 'answer', choice: asked.answer };
    }
    const fed = feedAction(playing.feed, step);
    playing.feed = fed.state;
    playing.beats = fed.beats;
  }
  throw new MissionRunError('A drill scene took too many turns in one frame.');
}

/** The next action to drive: an answer owed to the last line, else the next line. */
function nextAction(playing: Scene): LoggedAction | null {
  const answer = playing.answerNext;
  if (answer !== null) {
    playing.answerNext = null;
    return answer;
  }
  const line = playing.history[playing.index];
  if (line === undefined) return null;
  playing.index += 1;
  return driverAction(line);
}

/** Drops whatever scene was playing, so a later frame plays nothing. */
export function endScene(): void {
  scene = null;
}
