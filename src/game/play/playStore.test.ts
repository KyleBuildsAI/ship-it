import { describe, expect, it } from 'vitest';
import { startLessonRun } from '../missions/lessonRunner';
import { sampleLesson } from '../missions/sample.test-lesson';
import { sampleMission } from '../missions/sample.test-mission';
import { lockedRunActive, type LessonActivity, type SeriesActivity } from './playStore';

/** A row of the sample mission's drills, with the first `answered` of them answered right. */
function series(kind: SeriesActivity['kind'], answered: number): SeriesActivity {
  const results = sampleMission.drills.slice(0, answered).map((drill) => ({
    drillId: drill.id,
    passed: true,
    seconds: 5,
    overtime: false,
  }));
  return {
    kind,
    act: kind === 'placement' ? 2 : null,
    drills: sampleMission.drills,
    active: null,
    results,
    placement: null,
    scene: null,
  };
}

function lesson(placement?: LessonActivity['placement']): LessonActivity {
  const run = startLessonRun(sampleLesson, { locked: placement !== undefined });
  return { kind: 'lesson', lesson: sampleLesson, run, xpEarned: 0, placement };
}

describe('lockedRunActive', () => {
  it('is true while a drill placement test still has drills to answer', () => {
    expect(lockedRunActive(series('placement', 0))).toBe(true);
    expect(lockedRunActive(series('placement', sampleMission.drills.length - 1))).toBe(true);
  });

  it('is false once every drill of the placement test is answered', () => {
    expect(lockedRunActive(series('placement', sampleMission.drills.length))).toBe(false);
  });

  it('is false for a review, which shows each answer as it goes', () => {
    expect(lockedRunActive(series('review', 0))).toBe(false);
  });

  it("is true while a lesson Act's placement test has no score, and false once it has", () => {
    expect(lockedRunActive(lesson({ act: 3, passPercent: 85, result: null }))).toBe(true);
    const result = { percent: 90, testedOut: true };
    expect(lockedRunActive(lesson({ act: 3, passPercent: 85, result }))).toBe(false);
  });

  it('is false for a plain lesson, and when nothing is being played', () => {
    expect(lockedRunActive(lesson())).toBe(false);
    expect(lockedRunActive(null)).toBe(false);
  });
});
