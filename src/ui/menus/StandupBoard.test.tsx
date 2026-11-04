import {
  Children,
  isValidElement,
  type EffectCallback,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hud, openMenu } from '../../game/hud';
import { sampleAct, sampleMission } from '../../game/missions/sample.test-mission';
import { summarizeAct } from '../../game/play/actSummary';
import { setCatalog, setLazyCatalog } from '../../game/play/catalog';
import { leavePlay } from '../../game/play/play';
import { play } from '../../game/play/playStore';
import { cancelPendingPlay, pendingPlay, type PlayRequest } from '../../game/play/playWhenReady';
import { reviewItemsToday } from '../../game/play/seriesPlay';
import { flushProgress, startProgress } from '../../game/progress';
import { localDay } from '../../game/progression/days';
import { createReviewItem } from '../../game/progression/reviewQueue';
import { createDefaultSave } from '../../game/save/schema';
import type { Store } from '../../game/store';
import { PlayButton } from '../play/PlayButton';
import { StandupBoard } from './StandupBoard';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

// React runs no effects when it renders to a string, so these tests couldn't see what the
// board does as it opens and closes. This stand-in for useEffect keeps each effect a
// component asks for, so a test can run it (the board opening) and then run the cleanup it
// returns (the board closing), as React does in the browser.
const effects = vi.hoisted((): EffectCallback[] => []);
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: EffectCallback) => {
    effects.push(effect);
  },
}));

/** Opens the board as React would: draws it, then runs its effect. Returns both. */
function openBoard(): { tree: ReactNode; close: () => void } {
  effects.length = 0;
  const tree = StandupBoard();
  const cleanups = effects.map((effect) => effect());
  return {
    tree,
    close: () => {
      for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
    },
  };
}

/** The first element of `type` in what a component returned, found without drawing it. */
function findElement(node: ReactNode, type: unknown): ReactElement | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    if (child.type === type) return child;
    const found = findElement((child.props as { children?: ReactNode }).children, type);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Presses Start review in what the board drew, the way a click calls its handler. */
function pressStartReview(tree: ReactNode): void {
  const start = findElement(tree, PlayButton);
  if (start === undefined) throw new Error('The board has no Start review button.');
  const button: ReactElement = PlayButton(start.props as Parameters<typeof PlayButton>[0]);
  (button.props as { onClick: () => void }).onClick();
}

/** Waits until every promise a press set off has settled. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function board(): string {
  return renderToStaticMarkup(<StandupBoard />)
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ');
}

/** The board's own button (the other is ×, which closes it), and whether it's disabled. */
function startButton(): string {
  const markup = renderToStaticMarkup(<StandupBoard />);
  const button = /<button[^>]*play-button[^>]*>(.*?)<\/button>/.exec(markup);
  if (button === null) throw new Error('The board has no Start review button.');
  return button[0].includes('disabled') ? `${button[1] ?? ''}, disabled` : (button[1] ?? '');
}

describe('the Standup Board', () => {
  beforeEach(async () => {
    setCatalog({ acts: [{ act: sampleAct, missions: [sampleMission] }] });
    const now = new Date();
    // Ten drills a later build removed, more overdue than the one real drill.
    const removed = Array.from({ length: 10 }, (_, index) =>
      createReviewItem(`removed-drill-${String(index)}`, '2026-01-01'),
    );
    const save = {
      ...createDefaultSave(now),
      reviewQueue: [...removed, createReviewItem('sample-init', localDay(now))],
    };
    await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() }, now);
  });

  it('lists the same drills the Act menu counts and the review plays', () => {
    const text = board();
    expect(reviewItemsToday(new Date())).toBe(1);
    expect(text).toContain('1 due today · 1 in today’s set');
    expect(text).not.toContain('removed-drill');
  });
});

describe('the Standup Board with no Act content loaded', () => {
  // The loader stands in for an Act's download. The board reads summaries only.
  const load = vi.fn(() => {
    throw new Error('The Standup Board must never load an Act.');
  });
  const [first, second] = sampleMission.drills;
  if (first === undefined || second === undefined) throw new Error('Two drills are needed.');

  beforeEach(async () => {
    setLazyCatalog([
      { summary: summarizeAct({ act: sampleAct, missions: [sampleMission] }), load },
    ]);
    const now = new Date();
    const save = {
      ...createDefaultSave(now),
      reviewQueue: [first.id, 'removed-drill', second.id].map((id) =>
        createReviewItem(id, localDay(now)),
      ),
    };
    await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() }, now);
  });

  afterEach(() => {
    cancelPendingPlay();
    expect(load).not.toHaveBeenCalled();
  });

  it('lists each drill by the prompt in its summary, and leaves a removed one out', () => {
    const text = board();
    expect(text).toContain(`${first.prompt} Due ${second.prompt} Due`);
    expect(text).not.toContain('removed-drill');
  });

  it('says Loading… on Start review, and keeps it from a second press, while Acts download', () => {
    expect(startButton()).toBe('Start review');
    pendingPlay.update({ from: 'standup-board', waiting: { kind: 'review' } });
    expect(startButton()).toBe('Loading…, disabled');
  });

  it("names the Act that didn't load when Start review fails, and lets the player retry", () => {
    expect(board()).not.toContain("didn't load");
    pendingPlay.update({ from: 'standup-board', failed: { request: { kind: 'review' }, act: 2 } });
    expect(board()).toContain(
      "Act 2 didn't load. Check SHIP IT is still running, then try again. " +
        'If it keeps failing, reload the page; your progress is saved.',
    );
    expect(startButton()).toBe('Start review');
  });

  it('shows neither Loading… nor an alert for a press made in an Act menu', () => {
    const before = renderToStaticMarkup(<StandupBoard />);
    pendingPlay.update({ from: 'act-menu', waiting: { kind: 'review' } });
    expect(renderToStaticMarkup(<StandupBoard />)).toBe(before);
    pendingPlay.update({ waiting: null, failed: { request: { kind: 'review' }, act: 2 } });
    expect(renderToStaticMarkup(<StandupBoard />)).toBe(before);
  });
});

describe('opening, pressing and closing the Standup Board', () => {
  const content = { act: sampleAct, missions: [sampleMission] };
  const review: PlayRequest = { kind: 'review' };

  beforeEach(async () => {
    const now = new Date();
    const drill = createReviewItem(sampleMission.drills[0]?.id ?? '', localDay(now));
    const save = { ...createDefaultSave(now), reviewQueue: [drill] };
    await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() }, now);
    openMenu('standup');
  });

  afterEach(async () => {
    cancelPendingPlay();
    leavePlay();
    openMenu(null);
    await flushProgress();
    vi.restoreAllMocks();
  });

  it("downloads the Acts today's review needs, and on closing drops only its own press", () => {
    const load = vi.fn(() => Promise.resolve(content));
    setLazyCatalog([{ summary: summarizeAct(content), load }]);
    const board = openBoard();
    expect(load).toHaveBeenCalledOnce();

    // The Act menu under the board keeps its press when the board closes...
    pendingPlay.update({ from: 'act-menu', waiting: { kind: 'mission', id: sampleMission.id } });
    board.close();
    expect(pendingPlay.get().waiting).not.toBeNull();
    // ...but the board's own press goes with it.
    pendingPlay.update({ from: 'standup-board', waiting: review });
    board.close();
    expect(pendingPlay.get().waiting).toBeNull();
  });

  it('closes once Start review has started the review', async () => {
    setCatalog({ acts: [content] });
    pressStartReview(openBoard().tree);
    expect(play.get().activity?.kind).toBe('review');
    await settle();
    expect(hud.get().menu).toBeNull();
  });

  it("stays open to say so when the review's Act doesn't download", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const offline = () => Promise.reject(new Error('offline'));
    setLazyCatalog([{ summary: summarizeAct(content), load: offline }]);
    pressStartReview(openBoard().tree);
    await settle();
    expect(hud.get().menu).toBe('standup');
    expect(pendingPlay.get().failed).toEqual({ request: review, act: 2 });
  });
});
