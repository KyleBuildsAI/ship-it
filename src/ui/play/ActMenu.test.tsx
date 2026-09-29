import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  earlyActInput,
  earlySampleAct,
  sampleAct,
  sampleActInput,
  sampleMission,
  secondMission,
  thirdMission,
} from '../../game/missions/sample.test-mission';
import { ActSchema } from '../../game/missions/schema';
import { setCatalog, type ActContent } from '../../game/play/catalog';
import { withUnlock } from '../../game/play/unlock';
import { progress } from '../../game/progress';
import {
  createActProgress,
  createDefaultSave,
  createMissionProgress,
  type ActProgress,
  type SaveData,
} from '../../game/save/schema';
import { TEST_NOW } from '../../game/save/testFixtures';
import type { Store } from '../../game/store';
import { ActMenu } from './ActMenu';

// These tests render to an HTML string, the way a server would. The real hook has no
// server snapshot (the game only renders in the browser), so here it just reads the store.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

const act2: ActContent = { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] };
const early = earlySampleAct();
const EARLY_MISSION = 'early-three-rooms';
const newSave = createDefaultSave(TEST_NOW);

/** The menu for `content`'s Act, alone in the catalog, as the player with `save` sees it. */
function menuFor(content: ActContent, save: SaveData = newSave): string {
  setCatalog({ acts: [content] });
  progress.update({ status: 'ready', save, problem: null });
  return renderToStaticMarkup(<ActMenu act={content.act.act} />);
}

/** The markup's text, with the one entity React writes for these strings turned back. */
function text(markup: string): string {
  return markup.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'");
}

/**
 * Each row of the menu in short form, so a test reads like the screen: the label, then its
 * hint after " · ", then its button in brackets. A "Coming soon" row has no brackets.
 */
function rows(markup: string): string[] {
  return [...markup.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((match) =>
    text(
      (match[1] ?? '')
        .replace(/<small>(.+?)<\/small>/, ' · $1')
        .replace(/<button[^>]*disabled[^>]*>(.*?)<\/button>/, ' [$1, locked]')
        .replace(/<button[^>]*>(.*?)<\/button>/, ' [$1]'),
    ),
  );
}

/** What the "Early access" line says after its label, or null when there's no line. */
function note(markup: string): string | null {
  const line = /<p[^>]*>Early access · (.*?)<\/p>/.exec(markup);
  return line ? text(line[1] ?? '') : null;
}

function withDone(save: SaveData, ...ids: string[]): SaveData {
  const missions = { ...save.missions };
  for (const id of ids) missions[id] = { ...createMissionProgress(), status: 'completed' };
  return { ...save, missions };
}

function withAct(save: SaveData, number: number, changes: Partial<ActProgress>): SaveData {
  const actProgress = { ...createActProgress(), ...changes };
  return { ...save, acts: { ...save.acts, [String(number)]: actProgress } };
}

/** The early sample with its upcoming list and parts swapped, as later PRs will ship it. */
function earlyWith(changes: object): ActContent {
  return { ...early, act: ActSchema.parse({ ...earlyActInput, ...changes }) };
}

describe('the Act menu of an early-access Act', () => {
  it('lists its built missions, then its upcoming ones as Coming soon, and nothing else', () => {
    const markup = menuFor(early);
    expect(rows(markup)).toEqual([
      '1.1 Three Rooms (early sample) [Play]',
      '1.2 Reading History (sample) · Coming soon',
      '1.3 Good Commits (sample) · Coming soon',
    ]);
    expect(markup.match(/<li class="act-menu__upcoming">/g)).toHaveLength(2);
  });

  it('promises more missions, and says when the player has played every built one', () => {
    expect(note(menuFor(early))).toBe('More missions are on the way.');
    expect(note(menuFor(early, withDone(newSave, EARLY_MISSION)))).toBe(
      "You've played everything built so far. More missions are on the way.",
    );
  });

  it('promises no missions once every one has shipped, only that more is coming', () => {
    const allShipped = earlyWith({ upcoming: [], fieldMission: sampleActInput.fieldMission });
    const markup = menuFor(allShipped);
    expect(rows(markup)).toEqual([
      '1.1 Three Rooms (early sample) [Play]',
      'Field Mission: Clean the Dirty Tree (sample) · Real work on your SandCastles repo [Open]',
    ]);
    expect(note(markup)).toBe('More is on the way.');
    const caughtUp = withAct(withDone(newSave, EARLY_MISSION), 1, {
      fieldMissionCompletedAt: TEST_NOW.toISOString(),
    });
    expect(note(menuFor(allShipped, caughtUp))).toBe(
      "You've played everything built so far. More is on the way.",
    );
  });

  it("leaves the placement test out of the boss's locked hint, since there isn't one", () => {
    expect(rows(menuFor(earlyWith({ boss: sampleActInput.boss })))).toContain(
      'Boss: The Dirty Tree (sample) · Opens after every mission [Fight, locked]',
    );
  });
});

describe('the Act menu of a finished Act', () => {
  it('shows every part, and no early-access line or Coming soon rows', () => {
    const markup = menuFor(act2);
    expect(rows(markup)).toEqual([
      'Placement test · Know this already? 85% tests out. [Take]',
      '2.1 Three Rooms (sample) [Play]',
      '2.2 Reading History (sample) [Play]',
      '2.3 Good Commits (sample) [Play]',
      'Boss: The Dirty Tree (sample) · Opens after every mission (or the placement test) [Fight, locked]',
      'Field Mission: Clean the Dirty Tree (sample) · Real work on your SandCastles repo [Open]',
    ]);
    expect(note(markup)).toBeNull();
  });

  it('opens the boss early in preview mode, and says why', () => {
    const preview = withUnlock(newSave, true);
    expect(rows(menuFor(act2, preview))).toContain(
      'Boss: The Dirty Tree (sample) · Unlocked for preview [Fight]',
    );
    const earned = withDone(preview, ...sampleAct.missionIds);
    expect(rows(menuFor(act2, earned))).toContain(
      'Boss: The Dirty Tree (sample) · Dex is waiting [Fight]',
    );
  });

  it('shows what the player has finished', () => {
    const finished = withAct(withDone(newSave, ...sampleAct.missionIds), 2, {
      placement: { attempts: 1, bestPercent: 60, testedOut: false },
      bossCompletedAt: TEST_NOW.toISOString(),
      fieldMissionCompletedAt: TEST_NOW.toISOString(),
    });
    expect(rows(menuFor(act2, finished))).toEqual([
      'Placement test · Best 60% · 85% tests out [Take]',
      '2.1 Three Rooms (sample) · Done [Replay]',
      '2.2 Reading History (sample) · Done [Replay]',
      '2.3 Good Commits (sample) · Done [Replay]',
      'Boss: The Dirty Tree (sample) · Beaten [Fight]',
      'Field Mission: Clean the Dirty Tree (sample) · Verified [Open]',
    ]);
  });
});
