import { describe, expect, it } from 'vitest';
import { LAPTOP_NOTICE, LAPTOP_SANDBOX } from '../../content/act1/laptop';
import {
  earlySampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import {
  sampleFinal,
  sampleLesson,
  sampleLessonAct,
  sampleSecondLesson,
} from '../missions/sample.test-lesson';
import { fullSampleLessonAct, fullSamplePlacement } from '../missions/sample.test-lessonAct';
import { outlineAct, summarizeAct, type ActOutline } from './actSummary';

const missionAct = { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] };

describe('summarizeAct', () => {
  it('lists the parts in play order, whatever order the content lists them in', () => {
    const shuffled = { ...missionAct, missions: [thirdMission, sampleMission, secondMission] };
    const ids = summarizeAct(shuffled).parts.map((part) => part.id);
    expect(ids).toEqual(sampleAct.missionIds);
  });

  it('skips an id with no mission or lesson yet, as the Act menu does', () => {
    const early = earlySampleAct();
    const grown = {
      ...early,
      act: { ...early.act, missionIds: [...early.act.missionIds, 'none'] },
    };
    const summary = summarizeAct(grown);
    expect(summary.parts.map((part) => part.id)).toEqual(early.act.missionIds);
    // The outline keeps the id, so counting what's left still sees it.
    expect(summary.act.missionIds).toContain('none');
  });

  it('marks a mission with no cards', () => {
    const [first] = summarizeAct(missionAct).parts;
    expect(first).toEqual({
      id: sampleMission.id,
      title: sampleMission.title,
      kind: 'mission',
      cardIds: [],
    });
  });

  it('keeps each lesson’s kind and card ids, in order, for a lesson and a final', () => {
    const parts = summarizeAct(sampleLessonAct()).parts;
    expect(parts.map((part) => part.kind)).toEqual(['lesson', 'lesson', 'final']);
    // Every row, not just the final's: the menu counts an ordinary lesson's cards and
    // checks its resume point against them, so those are the ids that must be right.
    expect(parts).toEqual(
      [sampleLesson, sampleSecondLesson, sampleFinal].map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        kind: lesson.kind,
        cardIds: lesson.cards.map((card) => card.id),
      })),
    );
  });

  it('lists every drill of every mission with its prompt', () => {
    const drills = summarizeAct(missionAct).drills;
    const expected = missionAct.missions.flatMap((mission) => mission.drills);
    expect(drills.map((drill) => drill.id)).toEqual(expected.map((drill) => drill.id));
    expect(drills[0]).toEqual({ id: expected[0]?.id, prompt: expected[0]?.prompt });
  });

  it('has no drills for an Act taught only by lessons', () => {
    expect(summarizeAct(sampleLessonAct()).drills).toEqual([]);
  });

  it('never copies a free-play sandbox: the game attaches it after loading', () => {
    const withLaptop = {
      ...missionAct,
      freePlay: { steps: LAPTOP_SANDBOX, notice: LAPTOP_NOTICE },
    };
    expect(summarizeAct(withLaptop)).not.toHaveProperty('freePlay');
  });

  it('is plain data, so it comes back the same from the JSON the generator writes', () => {
    for (const content of [missionAct, sampleLessonAct(), fullSampleLessonAct()]) {
      const summary = summarizeAct(content);
      expect(JSON.parse(JSON.stringify(summary))).toStrictEqual(summary);
    }
  });
});

describe('outlineAct', () => {
  it('keeps only the boss’s title and the Field Mission’s title and repo', () => {
    const outline = outlineAct(sampleAct);
    expect(outline.boss).toEqual({ title: sampleAct.boss.title });
    expect(outline.fieldMission).toEqual({
      title: sampleAct.fieldMission.title,
      repoName: sampleAct.fieldMission.repoName,
    });
  });

  it('keeps every other part whole, the placement test included', () => {
    const { act } = fullSampleLessonAct();
    const outline = outlineAct(act);
    // Putting the full Field Mission back gives the Act exactly: nothing else was cut.
    expect({ ...outline, fieldMission: act.fieldMission }).toStrictEqual(act);
    expect(outline.placementTest).toMatchObject(fullSamplePlacement);
  });

  it('leaves out a boss or Field Mission the Act does not have', () => {
    const outline = outlineAct(sampleLessonAct().act);
    expect(outline).not.toHaveProperty('boss');
    expect(outline).not.toHaveProperty('fieldMission');
  });

  it('accepts a full Act wherever an outline is expected', () => {
    // A type check as much as a test: if Act stopped fitting ActOutline, tsc fails here.
    const outline: ActOutline = sampleAct;
    expect(outline.boss?.title).toBe(sampleAct.boss.title);
  });
});
