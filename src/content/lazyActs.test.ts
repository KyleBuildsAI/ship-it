import { describe, expect, it } from 'vitest';
import { summarizeAct } from '../game/play/actSummary';
import { isActLoaded, loadAct, loadedAct, setLazyCatalog } from '../game/play/catalog';
import { LAPTOP_NOTICE, LAPTOP_SANDBOX } from './act1/laptop';
import { ACTS } from '.';
import { LAZY_ACTS } from './lazyActs';

/*
 * LAZY_ACTS is the catalog the game runs on. These tests hold it to ACTS, the eager list
 * every content test checks, so a wrong import() or a stale summary fails here, not in play.
 */

describe('the Acts the game downloads on demand', () => {
  it('lists every shipped Act once, in the same order as ACTS', () => {
    expect(LAZY_ACTS.map(({ summary }) => summary.act.act)).toEqual(
      ACTS.map((content) => content.act.act),
    );
    expect(LAZY_ACTS.map(({ summary }) => summary.act.act)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('loads exactly the content the content tests check', async () => {
    for (const [index, entry] of LAZY_ACTS.entries()) {
      const content = await entry.load();
      const checked = ACTS[index];
      expect(content.act).toBe(checked?.act);
      expect(content.missions).toBe(checked?.missions);
      expect(content.lessons).toBe(checked?.lessons);
    }
  });

  it('ships summaries that match the content each Act loads', async () => {
    for (const { summary, load } of LAZY_ACTS) {
      // Every generated field. freePlay is attached by hand, so the next test checks it.
      const { act, parts, drills } = summary;
      expect(summarizeAct(await load())).toEqual({ act, parts, drills });
    }
  });

  it('gives only Act 1 the free-play laptop, which needs no download', () => {
    const [first, ...rest] = LAZY_ACTS;
    expect(first?.summary.freePlay).toEqual({ steps: LAPTOP_SANDBOX, notice: LAPTOP_NOTICE });
    for (const entry of rest) expect(entry.summary.freePlay).toBeUndefined();
  });

  it('starts the game with no Act loaded, then loads the one asked for', async () => {
    setLazyCatalog(LAZY_ACTS);
    for (const { summary } of LAZY_ACTS) expect(isActLoaded(summary.act.act)).toBe(false);
    await loadAct(2);
    expect(loadedAct(2).act.title).toBe(ACTS[1].act.title);
    expect(isActLoaded(1)).toBe(false);
  });
});
