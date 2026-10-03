import { describe, expect, it } from 'vitest';
import { RoadmapSchema, type RoadmapActInput } from '../game/missions/roadmapSchema';
import { ACTS } from './index';
import { ROADMAP, roadmapAct } from './roadmap';

describe('the roadmap', () => {
  it('has every Act from 1 to 8, once each, in order', () => {
    expect(ROADMAP.map((entry) => entry.act)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(roadmapAct(5)?.title).toBe('Quality Gates');
    expect(roadmapAct(9)).toBeUndefined();
  });

  it('marks every Act playable, which is exactly what the catalog ships', () => {
    const playable = ROADMAP.filter((entry) => entry.stage === 'playable');
    expect(playable.map((entry) => entry.act)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(playable.map((entry) => entry.act)).toEqual(ACTS.map(({ act }) => act.act));
  });

  it('names a playable Act and its parts exactly as the catalog does', () => {
    for (const entry of ACTS) {
      const { act, missions } = entry;
      const lessons = 'lessons' in entry ? entry.lessons : [];
      const roadmap = roadmapAct(act.act);
      expect(roadmap?.title).toBe(act.title);
      // A lesson Act's final is its boss, so the roadmap lists it as the boss, not a mission.
      const titleOf = (id: string) =>
        missions.find((mission) => mission.id === id)?.title ??
        lessons.find((lesson) => lesson.id === id)?.title;
      const playedIds = act.missionIds.filter((id) => id !== act.finalLessonId);
      expect(roadmap?.missions.map((mission) => mission.title)).toEqual([
        ...playedIds.map(titleOf),
        ...act.upcoming,
      ]);
      if (act.boss) expect(roadmap?.boss.title).toBe(act.boss.title);
      if (act.finalLessonId) expect(roadmap?.boss.title).toBe(titleOf(act.finalLessonId));
      if (act.fieldMission) expect(roadmap?.fieldMission?.title).toBe(act.fieldMission.title);
    }
  });

  it("lists Act 1's six missions, boss and Field Mission as DESIGN.md names them", () => {
    const act1 = roadmapAct(1);
    expect(act1?.stage).toBe('playable');
    expect(act1?.missions.map((mission) => mission.title)).toEqual([
      'Where Things Live',
      'Deletes Are Forever',
      'Secrets Stay Home',
      'Every Terminal Is Its Own World',
      'Dependencies Are Declared',
      "Running Isn't Working",
    ]);
    expect(act1?.boss.title).toBe('Works on My Machine');
    expect(act1?.fieldMission?.title).toBe('Brief Your Real Agent');
    expect(act1?.tryouts).toEqual([]);
  });

  it('says plainly that Acts 3 to 8 are played by clicking, with their finals as bosses', () => {
    for (const number of [3, 4, 5, 6, 7, 8]) {
      const entry = roadmapAct(number);
      expect(entry?.status).toContain('answered by clicking');
      expect(entry?.missions).toHaveLength(2);
      expect(entry?.status).not.toContain('Not built yet');
    }
  });
});

describe('RoadmapSchema', () => {
  const act = (number: number): RoadmapActInput => ({
    act: number,
    title: `Act ${String(number)}`,
    topics: 'Things.',
    stage: 'planned',
    status: 'Planned · Not built yet.',
    boss: { title: 'A boss' },
  });
  const eight = [1, 2, 3, 4, 5, 6, 7, 8].map(act);

  it('accepts eight Acts in order', () => {
    expect(RoadmapSchema.safeParse(eight).success).toBe(true);
  });

  it('refuses a missing Act, or Acts out of order', () => {
    expect(RoadmapSchema.safeParse(eight.slice(1)).success).toBe(false);
    const swapped = [act(2), act(1), ...eight.slice(2)];
    const result = RoadmapSchema.safeParse(swapped);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('this one should be Act 1');
  });

  it('refuses tryouts on a playable Act, and a topic line over the word budget', () => {
    const tryouts = [{ ...act(1), stage: 'playable', tryouts: ['laptop-sandbox'] }];
    expect(RoadmapSchema.safeParse([...tryouts, ...eight.slice(1)]).success).toBe(false);
    const wordy = [{ ...act(1), topics: 'word '.repeat(61) }];
    expect(RoadmapSchema.safeParse([...wordy, ...eight.slice(1)]).success).toBe(false);
  });
});
