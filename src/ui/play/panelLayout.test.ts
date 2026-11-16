import { describe, expect, it } from 'vitest';
import {
  finishLessonBriefing,
  nextCard,
  pickOption,
  startLessonRun,
  type LessonRun,
} from '../../game/missions/lessonRunner';
import { startRun } from '../../game/missions/runner';
import { sampleLesson } from '../../game/missions/sample.test-lesson';
import { sampleMission } from '../../game/missions/sample.test-mission';
import type { LessonActivity, MissionActivity } from '../../game/play/playStore';
import themeCss from '../theme.css?raw';
import { panelClassName, panelScrollKey } from './panelLayout';

function missionAt(phase: MissionActivity['run']['phase']): MissionActivity {
  return {
    kind: 'mission',
    attempt: 1,
    mission: sampleMission,
    run: { ...startRun(sampleMission), phase },
    hint: null,
    hintLoading: false,
    lastDrill: null,
    questionScore: null,
    freeTextGrade: null,
    xpEarned: 0,
    agent: null,
    stars: {},
    slips: [],
    scene: null,
  };
}

describe('the play panel layout', () => {
  it('sits above an open terminal while the terminal is in use', () => {
    expect(panelClassName(true, missionAt('sim'))).toContain('play-panel--above-terminal');
    expect(panelClassName(true, null)).toContain('play-panel--above-terminal');
  });

  it('keeps its full height for the Question Round, which never uses the terminal', () => {
    const className = panelClassName(true, missionAt('question'));
    expect(className).toContain('play-panel--over-terminal');
    expect(className).not.toContain('play-panel--above-terminal');
  });

  it('needs neither when the terminal is hidden', () => {
    expect(panelClassName(false, missionAt('question'))).toBe('glass play-panel');
  });
});

describe('when the play panel goes back to the top', () => {
  const lessonWith = (run: LessonRun): LessonActivity => ({
    kind: 'lesson',
    lesson: sampleLesson,
    run,
    xpEarned: 0,
  });
  const firstCard = finishLessonBriefing(startLessonRun(sampleLesson), 0);

  it('stays put while a lesson card is answered, so its result can be scrolled to', () => {
    const answered = pickOption(firstCard, sampleLesson, 'approve');
    expect(panelScrollKey(lessonWith(answered))).toBe(panelScrollKey(lessonWith(firstCard)));
  });

  it('goes back up for the next card, which would open scrolled to the last one’s Next', () => {
    const next = nextCard(pickOption(firstCard, sampleLesson, 'ask-units'), sampleLesson);
    expect(panelScrollKey(lessonWith(next))).not.toBe(panelScrollKey(lessonWith(firstCard)));
  });

  it('goes back up for a new activity, but not as a mission moves along', () => {
    expect(panelScrollKey(missionAt('sim'))).toBe(panelScrollKey(missionAt('question')));
    expect(panelScrollKey(missionAt('sim'))).not.toBe(panelScrollKey(lessonWith(firstCard)));
    expect(panelScrollKey(null)).toBeUndefined();
  });
});

/** The first `prop: Npx` or `calc(100vh - Npx)` number in a CSS rule's block. */
function pixels(css: string, selector: string, pattern: RegExp): number {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  const match = pattern.exec(block);
  if (start < 0 || match?.[1] === undefined) throw new Error(`No match in ${selector}`);
  return Number(match[1]);
}

/** A HUD button's height at `zoom`: 13px text, padding above and below, a 1px border each side. */
function buttonHeight(selector: string, zoom = 1): number {
  return zoom * (13 + 2 * pixels(themeCss, selector, /padding: (\d+)px/) + 2);
}

/** Each text size's zoom, with the selectors it zooms (theme.css). */
const TEXT_SIZES = [
  ...themeCss.matchAll(
    /html\[data-text-size='([\w-]+)'\]\s*:is\(([^)]*)\)\s*\{\s*zoom: ([\d.]+);/g,
  ),
].map(([, size = '', list = '', zoom = '']) => ({
  size,
  zoomed: list.split(',').map((selector) => selector.trim()),
  zoom: Number(zoom),
}));
const LARGEST_ZOOM = Math.max(...TEXT_SIZES.map(({ zoom }) => zoom));

describe('the play panel with the terminal closed', () => {
  it('stops above the Terminal button and HUD menu instead of covering them', () => {
    const top = pixels(themeCss, '.play-panel', /top: (\d+)px/);
    const cut = pixels(themeCss, '.play-panel', /max-height: calc\(100vh - (\d+)px\)/);
    const buttonTop =
      pixels(themeCss, '.hud-button', /bottom: (\d+)px/) + buttonHeight('.hud-button');
    expect(cut - top).toBeGreaterThanOrEqual(buttonTop + 8);
  });

  it('stops above the HUD menu even when Extra large text makes its buttons taller', () => {
    const top = pixels(themeCss, '.play-panel', /top: (\d+)px/);
    const cut = pixels(themeCss, '.play-panel', /max-height: calc\(100vh - (\d+)px\)/);
    const menuBottom = pixels(themeCss, '.hud-menu', /bottom: (\d+)px/);
    const menuTop = menuBottom + buttonHeight('.hud-menu__button', LARGEST_ZOOM);
    expect(cut - top).toBeGreaterThanOrEqual(menuTop + 8);
  });
});

describe('the play panel with the terminal open', () => {
  it('stops above the HUD menu that rides on the terminal, at every text size', () => {
    const top = pixels(themeCss, '.play-panel', /top: (\d+)px/);
    const block = /\.play-panel--above-terminal \{[^}]*max-height: calc\((\d+)vh - (\d+)px\)/;
    const [, panelVh = '', panelCut = ''] = block.exec(themeCss) ?? [];
    const riding = /\.hud-menu--above-terminal \{[^}]*bottom: calc\((\d+)vh \+ (\d+)px\)/;
    const [, menuVh = '', menuLift = ''] = riding.exec(themeCss) ?? [];
    // The panel's bottom and the menu's both sit a share of the window up, the same share.
    expect(100 - Number(panelVh)).toBe(Number(menuVh));
    const panelGap = Number(panelCut) - top;
    const menuTop = Number(menuLift) + buttonHeight('.hud-menu__button', LARGEST_ZOOM);
    expect(panelGap).toBeGreaterThanOrEqual(menuTop + 8);
  });
});

/** How far above the window's bottom a rule's `bottom: calc(Nvh + Npx)` puts its box. */
function lift(selector: string): { vh: number; px: number } {
  const start = themeCss.indexOf(`${selector} {`);
  const block = themeCss.slice(start, themeCss.indexOf('}', start));
  const match = /bottom: calc\((\d+)vh \+ (\d+)px\)/.exec(block);
  if (start < 0 || match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`No calc() bottom in ${selector}`);
  }
  return { vh: Number(match[1]), px: Number(match[2]) };
}

describe('the command chip with the terminal open', () => {
  it('floats above the HUD buttons that ride on the terminal, at every text size', () => {
    // The chip spans the middle of the window, so it must clear the row by height alone. At
    // Extra large the menu's buttons grow while the chip stays put, and its Run button sat
    // over Music and caught its clicks.
    const chip = lift('.command-chip');
    const menu = lift('.hud-menu--above-terminal');
    const toggle = lift('.terminal-toggle');
    expect(chip.vh).toBe(menu.vh);
    expect(chip.vh).toBe(toggle.vh);
    const buttonsTop = Math.max(
      menu.px + buttonHeight('.hud-menu__button', LARGEST_ZOOM),
      toggle.px + buttonHeight('.hud-button'),
    );
    expect(chip.px).toBeGreaterThanOrEqual(buttonsTop + 8);
  });
});

describe('the play panel at larger text sizes', () => {
  it('zooms the text inside the panel and the HUD buttons, never the boxes placed on screen', () => {
    expect(TEXT_SIZES.map(({ size }) => size)).toEqual(['large', 'x-large']);
    for (const { zoomed } of TEXT_SIZES) {
      expect(zoomed).toContain('.play-panel__content');
      expect(zoomed).toContain('.hud-menu__button');
      // Zoom scales a box's own top, width and 100vh too: a zoomed panel ran off the
      // window and over the Git World's Workbench, and a zoomed menu left the terminal.
      expect(zoomed).not.toContain('.play-panel');
      expect(zoomed).not.toContain('.hud-menu');
    }
  });
});
