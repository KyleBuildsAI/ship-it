import { describe, expect, it } from 'vitest';
import type { MotionEnvironment } from '../../game/agent/pace';
import {
  checkOrder,
  finishLessonBriefing,
  moveStep,
  nextCard,
  pickOption,
  startLessonRun,
} from '../../game/missions/lessonRunner';
import { sampleLesson } from '../../game/missions/sample.test-lesson';
import { answersOn, revealBehavior } from './lessonReveal';

const cards = () => finishLessonBriefing(startLessonRun(sampleLesson), 0);

describe('when a lesson card has a new result to show', () => {
  it('counts every pick, so each one brings its feedback into view', () => {
    const fresh = cards();
    expect(answersOn(fresh.card)).toBe(0);
    const wrong = pickOption(fresh, sampleLesson, 'approve');
    expect(answersOn(wrong.card)).toBe(1);
    // The right pick both adds a pick and solves the card: its feedback, why and Next.
    expect(answersOn(pickOption(wrong, sampleLesson, 'ask-units').card)).toBe(3);
  });

  it('counts each wrong Check order, but not moving a step', () => {
    let run = nextCard(pickOption(cards(), sampleLesson, 'ask-units'), sampleLesson);
    run = nextCard(pickOption(run, sampleLesson, 'specific'), sampleLesson);
    expect(answersOn(run.card)).toBe(0);
    const checked = checkOrder(run, sampleLesson);
    expect(answersOn(checked.card)).toBe(1);
    const moved = run.card.order[1];
    if (moved === undefined) throw new Error('expected a second step');
    expect(answersOn(moveStep(checked, sampleLesson, moved, -1).card)).toBe(1);
  });

  it('is back to none on the next card, which the panel opens at the top', () => {
    const solved = pickOption(cards(), sampleLesson, 'ask-units');
    expect(answersOn(nextCard(solved, sampleLesson).card)).toBe(0);
  });
});

describe('how the panel scrolls to a result', () => {
  const env = (reduced: boolean, automated = false): MotionEnvironment => ({
    prefersReducedMotion: () => reduced,
    automated: () => automated,
  });

  it('glides there normally', () => {
    expect(revealBehavior(env(false), 'system')).toBe('smooth');
    expect(revealBehavior(env(true), 'off')).toBe('smooth');
  });

  it('jumps there under reduced motion, from the setting or the system it follows', () => {
    expect(revealBehavior(env(false), 'on')).toBe('instant');
    expect(revealBehavior(env(true), 'system')).toBe('instant');
  });

  it('jumps there for a test robot, which shouldn’t wait for a scroll to settle', () => {
    expect(revealBehavior(env(false, true), 'off')).toBe('instant');
  });
});
