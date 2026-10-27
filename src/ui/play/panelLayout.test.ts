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

describe('the play panel with the terminal closed', () => {
  it('stops above the Terminal button and HUD menu instead of covering them', () => {
    const top = pixels(themeCss, '.play-panel', /top: (\d+)px/);
    const cut = pixels(themeCss, '.play-panel', /max-height: calc\(100vh - (\d+)px\)/);
    const buttonBottom = pixels(themeCss, '.hud-button', /bottom: (\d+)px/);
    const buttonPadding = pixels(themeCss, '.hud-button', /padding: (\d+)px/);
    // 13px text, padding above and below, and a 1px border each side.
    const buttonTop = buttonBottom + 13 + 2 * buttonPadding + 2;
    expect(cut - top).toBeGreaterThanOrEqual(buttonTop + 8);
  });
});
