import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeTerminal, hud } from '../hud';
import { sampleLesson, sampleLessonAct } from '../missions/sample.test-lesson';
import {
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { flushProgress, progress, startProgress, updateSave } from '../progress';
import { createReviewItem } from '../progression/reviewQueue';
import { createDefaultSave, type SaveData } from '../save/schema';
import { summarizeAct } from './actSummary';
import { isActLoaded, setCatalog, setLazyCatalog, type ActContent } from './catalog';
import { leavePlay } from './play';
import { play, type Activity } from './playStore';
import {
  actsNeeded,
  cancelPendingPlay,
  pendingPlay,
  playWhenReady,
  samePlayRequest,
  type PlayRequest,
} from './playWhenReady';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const actTwo = { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] };
const actThree = otherSampleAct();
const actFour = sampleLessonAct();
const [firstDrill, secondDrill] = sampleMission.drills;
if (firstDrill === undefined || secondDrill === undefined) {
  throw new Error('The sample mission needs two drills.');
}
const actTwoDrill = firstDrill.id;
const actThreeDrills = [`other-${firstDrill.id}`, `other-${secondDrill.id}`];
const missionInActTwo: PlayRequest = { kind: 'mission', id: sampleMission.id };

async function startWithSave(save: SaveData): Promise<void> {
  await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() }, NOW);
}

beforeEach(async () => {
  setCatalog({ acts: [actTwo, actThree, actFour] });
  await startWithSave(createDefaultSave(NOW));
});

afterEach(async () => {
  cancelPendingPlay();
  leavePlay();
  await flushProgress();
  vi.restoreAllMocks();
});

/** A catalog entry as the game will have it: the summary now, the content when asked. */
function lazy(content: ActContent, load = () => Promise.resolve(content)) {
  return { summary: summarizeAct(content), load: vi.fn(load) };
}

/** A download the test finishes by hand, to see what the game does while it's on its way. */
function slowDownload(content: ActContent) {
  let arrive: () => void = () => undefined;
  const arrived = new Promise<ActContent>((resolve) => {
    arrive = () => {
      resolve(content);
    };
  });
  return { entry: lazy(content, () => arrived), arrive };
}

function reviewDrillIds(): string[] {
  const current = play.get().activity;
  if (current?.kind !== 'review') throw new Error('No review is running.');
  return current.drills.map((drill) => drill.id);
}

it('samePlayRequest matches the same kind of request for the same part or Act', () => {
  expect(samePlayRequest({ kind: 'mission', id: 'a' }, { kind: 'mission', id: 'a' })).toBe(true);
  expect(samePlayRequest({ kind: 'boss', act: 2 }, { kind: 'boss', act: 2 })).toBe(true);
  expect(samePlayRequest({ kind: 'review' }, { kind: 'review' })).toBe(true);
  expect(samePlayRequest(null, { kind: 'review' })).toBe(false);
  expect(samePlayRequest({ kind: 'mission', id: 'a' }, { kind: 'mission', id: 'b' })).toBe(false);
  expect(samePlayRequest({ kind: 'mission', id: 'a' }, { kind: 'lesson', id: 'a' })).toBe(false);
  expect(samePlayRequest({ kind: 'boss', act: 2 }, { kind: 'boss', act: 3 })).toBe(false);
  expect(samePlayRequest({ kind: 'boss', act: 2 }, { kind: 'field', act: 2 })).toBe(false);
});

it('actsNeeded names the Act a part belongs to, or the Act asked for', () => {
  expect(actsNeeded({ kind: 'mission', id: `other-${sampleMission.id}` }, NOW)).toEqual([3]);
  expect(actsNeeded({ kind: 'lesson', id: sampleLesson.id }, NOW)).toEqual([4]);
  expect(actsNeeded({ kind: 'placement', act: 2 }, NOW)).toEqual([2]);
  expect(actsNeeded({ kind: 'boss', act: 3 }, NOW)).toEqual([3]);
  expect(actsNeeded({ kind: 'field', act: 2 }, NOW)).toEqual([2]);
  expect(actsNeeded({ kind: 'review' }, NOW)).toEqual([]);
  // An id no Act has needs nothing loaded, so its starter can say the id is unknown.
  expect(actsNeeded({ kind: 'mission', id: 'nothing' }, NOW)).toEqual([]);
});

describe('playWhenReady with every Act loaded', () => {
  const cases: readonly [PlayRequest, Activity['kind']][] = [
    [missionInActTwo, 'mission'],
    [{ kind: 'lesson', id: sampleLesson.id }, 'lesson'],
    [{ kind: 'placement', act: 2 }, 'placement'],
    [{ kind: 'boss', act: 2 }, 'boss'],
    [{ kind: 'field', act: 3 }, 'field'],
    [{ kind: 'review' }, 'review'],
  ];

  it.each(cases)('starts %o during the click itself', async (request, kind) => {
    const changes = vi.fn();
    const stop = pendingPlay.subscribe(changes);
    const outcome = playWhenReady(request, NOW);
    // No await yet: the activity is already running, as when the button called the starter.
    expect(play.get().activity?.kind).toBe(kind);
    await expect(outcome).resolves.toBe('started');
    // Nothing was missing, so no button ever said "Loading…".
    expect(changes).not.toHaveBeenCalled();
    stop();
  });

  it('starts nothing once another tab has the save', async () => {
    progress.update({ status: 'elsewhere' });
    await expect(playWhenReady(missionInActTwo, NOW)).resolves.toBe('superseded');
    expect(play.get().activity).toBeNull();
  });
});

describe('playWhenReady with an Act still to download', () => {
  it('shows the request as waiting, then starts it once the Act arrives', async () => {
    const download = slowDownload(actTwo);
    setLazyCatalog([download.entry]);
    const outcome = playWhenReady(missionInActTwo, NOW);
    expect(pendingPlay.get()).toEqual({ waiting: missionInActTwo, failed: null });
    expect(play.get().activity).toBeNull();

    download.arrive();
    await expect(outcome).resolves.toBe('started');
    expect(play.get().activity?.kind).toBe('mission');
    expect(pendingPlay.get()).toEqual({ waiting: null, failed: null });
  });

  it("starts only the newer of two requests, even when the older one's Act arrives last", async () => {
    const actTwoDownload = slowDownload(actTwo);
    setLazyCatalog([actTwoDownload.entry, lazy(actThree)]);
    const older = playWhenReady(missionInActTwo, NOW);
    const newerRequest: PlayRequest = { kind: 'field', act: 3 };
    const newer = playWhenReady(newerRequest, NOW);
    expect(pendingPlay.get().waiting).toBe(newerRequest);
    await expect(newer).resolves.toBe('started');

    // The older click's Act arrives last, and must not replace what the player chose since.
    actTwoDownload.arrive();
    await expect(older).resolves.toBe('superseded');
    expect(play.get().activity).toMatchObject({ kind: 'field', act: 3 });
  });

  const olderActSettles: readonly [string, () => Promise<ActContent>][] = [
    ['arrives', () => Promise.resolve(actTwo)],
    ['fails to download', () => Promise.reject(new Error('offline'))],
  ];

  it.each(olderActSettles)(
    "leaves the newer click Loading… when the older click's Act %s first",
    async (_, loadActTwo) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const actThreeDownload = slowDownload(actThree);
      setLazyCatalog([lazy(actTwo, loadActTwo), actThreeDownload.entry]);
      const older = playWhenReady(missionInActTwo, NOW);
      const newerRequest: PlayRequest = { kind: 'field', act: 3 };
      const newer = playWhenReady(newerRequest, NOW);

      await expect(older).resolves.toBe('superseded');
      // The older click started nothing, and left the newer click's button as it was.
      expect(play.get().activity).toBeNull();
      expect(pendingPlay.get()).toEqual({ waiting: newerRequest, failed: null });

      actThreeDownload.arrive();
      await expect(newer).resolves.toBe('started');
      expect(play.get().activity).toMatchObject({ kind: 'field', act: 3 });
    },
  );

  it('drops a request once cancelPendingPlay runs, as when its menu closes', async () => {
    const download = slowDownload(actTwo);
    setLazyCatalog([download.entry]);
    const outcome = playWhenReady(missionInActTwo, NOW);
    cancelPendingPlay();
    expect(pendingPlay.get()).toEqual({ waiting: null, failed: null });

    download.arrive();
    await expect(outcome).resolves.toBe('superseded');
    expect(play.get().activity).toBeNull();
    // The download itself still finished, so the next click starts at once.
    expect(isActLoaded(2)).toBe(true);
  });

  it('reports a failed download and changes nothing, and the next click succeeds', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const load = vi
      .fn<() => Promise<ActContent>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(actTwo);
    setLazyCatalog([{ summary: summarizeAct(actTwo), load }]);
    closeTerminal();
    const saveBefore = progress.get().save;

    await expect(playWhenReady(missionInActTwo, NOW)).resolves.toBe('failed');
    expect(pendingPlay.get()).toEqual({ waiting: null, failed: missionInActTwo });
    expect(play.get().activity).toBeNull();
    // Starting a mission writes to the save and opens the terminal; neither happened.
    expect(progress.get().save).toBe(saveBefore);
    expect(hud.get().terminalOpen).toBe(false);
    // loadAct logged the failure; the gate doesn't log it a second time.
    expect(error).toHaveBeenCalledOnce();
    // Closing the menu forgets the failure too.
    cancelPendingPlay();
    expect(pendingPlay.get().failed).toBeNull();

    await expect(playWhenReady(missionInActTwo, NOW)).resolves.toBe('started');
    expect(play.get().activity?.kind).toBe('mission');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('lets only the newest click report a failed download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setLazyCatalog([lazy(actTwo, () => Promise.reject(new Error('offline'))), lazy(actThree)]);
    const older = playWhenReady(missionInActTwo, NOW);
    await expect(playWhenReady({ kind: 'field', act: 3 }, NOW)).resolves.toBe('started');
    await expect(older).resolves.toBe('superseded');
    // Act 3's menu never says Act 2 failed: the player had moved on from that click.
    expect(pendingPlay.get().failed).toBeNull();
  });

  it('starts nothing when another tab takes the save while the Act downloads', async () => {
    const download = slowDownload(actTwo);
    setLazyCatalog([download.entry]);
    const outcome = playWhenReady(missionInActTwo, NOW);
    progress.update({ status: 'elsewhere' });

    download.arrive();
    await expect(outcome).resolves.toBe('superseded');
    expect(play.get().activity).toBeNull();
    // The button stops saying "Loading…", though nothing started.
    expect(pendingPlay.get()).toEqual({ waiting: null, failed: null });
  });
});

describe('playWhenReady with a review', () => {
  let actTwoEntry = lazy(actTwo);
  let actThreeDownload = slowDownload(actThree);

  beforeEach(async () => {
    await startWithSave({
      ...createDefaultSave(NOW),
      reviewQueue: actThreeDrills.map((id) => createReviewItem(id, '2026-09-20')),
    });
    actTwoEntry = lazy(actTwo);
    actThreeDownload = slowDownload(actThree);
    setLazyCatalog([actTwoEntry, actThreeDownload.entry, lazy(actFour)]);
  });

  /** An Act 2 drill joins the review queue mid-download, say missed in a running mission. */
  function missAnActTwoDrill(): void {
    const item = createReviewItem(actTwoDrill, '2026-09-21');
    updateSave((save) => ({ ...save, reviewQueue: [...save.reviewQueue, item] }));
  }

  it('loads only the Acts its drills come from', async () => {
    // Two drills from Act 3 need Act 3 once.
    expect(actsNeeded({ kind: 'review' }, NOW)).toEqual([3]);
    const outcome = playWhenReady({ kind: 'review' }, NOW);
    actThreeDownload.arrive();
    await expect(outcome).resolves.toBe('started');
    expect(actTwoEntry.load).not.toHaveBeenCalled();
    expect(reviewDrillIds()).toEqual(actThreeDrills);
  });

  it('plans again when its queue grows during the download', async () => {
    const outcome = playWhenReady({ kind: 'review' }, NOW);
    missAnActTwoDrill();
    actThreeDownload.arrive();
    await expect(outcome).resolves.toBe('started');
    expect(actTwoEntry.load).toHaveBeenCalledOnce();
    expect(reviewDrillIds()).toEqual([...actThreeDrills, actTwoDrill]);
  });

  it('plans no further once a newer click has taken over', async () => {
    const outcome = playWhenReady({ kind: 'review' }, NOW);
    missAnActTwoDrill();
    cancelPendingPlay();
    actThreeDownload.arrive();
    await expect(outcome).resolves.toBe('superseded');
    expect(actTwoEntry.load).not.toHaveBeenCalled();
    // Nothing is left saying "Loading…" for a request nobody wants now.
    expect(pendingPlay.get().waiting).toBeNull();
  });
});
