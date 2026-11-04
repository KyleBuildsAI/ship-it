import type { FixtureStep } from '../../engine/fixtures';
import type { Lesson, LessonKind } from '../missions/lessonSchema';
import type { Act, Boss, FieldMission, Mission } from '../missions/schema';

/*
 * An Act's summary: everything a menu prints about it, and nothing it plays. Menus, the
 * Trophy Wall and the Standup Board can draw every Act from summaries alone, so the game's
 * first download can carry these and leave each Act's content (steps, Otto's scripts,
 * cards, drills) to be fetched when the Act is played. src/content/actSummaries.test.ts
 * writes them to actSummaries.generated.ts; `npm run content:summaries` refreshes it.
 *
 * Summaries must survive a trip through JSON, so they hold plain data only: no
 * functions, no undefined values, no keys for parts an Act doesn't have.
 */

/**
 * An Act's definition without its heavy parts: the boss and Field Mission keep only what a
 * menu prints. A full Act fits this type too, so code that only reads an outline can take
 * either. The placement test stays whole, because the menu shows its pitch and it's small.
 */
export type ActOutline = Omit<Act, 'boss' | 'fieldMission'> & {
  readonly boss?: Pick<Boss, 'title'>;
  readonly fieldMission?: Pick<FieldMission, 'title' | 'repoName'>;
};

/** One row of an Act menu: a mission, a lesson, or the Act's final. */
export interface PartSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: 'mission' | LessonKind;
  /**
   * A lesson's card ids in play order; empty for a mission. The menu counts them ("8
   * cards") and checks that a saved resume point still matches the lesson's cards.
   */
  readonly cardIds: readonly string[];
}

/** A drill as the Standup Board lists it. Reviews and placement tests name drills by id. */
export interface DrillSummary {
  readonly id: string;
  readonly prompt: string;
}

/** A sandbox to try things in with nothing graded, and what the terminal says when it opens. */
export interface FreePlay {
  readonly steps: readonly FixtureStep[];
  readonly notice: string;
}

export interface ActSummary {
  readonly act: ActOutline;
  /** In missionIds order. An id with nothing built for it yet has no part. */
  readonly parts: readonly PartSummary[];
  /** Every drill of every mission, so reviews can be counted and listed from summaries. */
  readonly drills: readonly DrillSummary[];
  /**
   * Never generated: a sandbox is code-built fixture steps, not JSON. The game attaches
   * Act 1's laptop to its summary when it sets up the catalog.
   */
  readonly freePlay?: FreePlay;
}

/** The Act with only the boss's title and the Field Mission's title and repo kept. */
export function outlineAct(act: Act): ActOutline {
  const { boss, fieldMission, ...rest } = act;
  // A part the Act doesn't have gets no key at all, so the outline matches its JSON copy.
  const bossOutline = boss === undefined ? {} : { boss: { title: boss.title } };
  const fieldOutline =
    fieldMission === undefined
      ? {}
      : { fieldMission: { title: fieldMission.title, repoName: fieldMission.repoName } };
  return { ...rest, ...bossOutline, ...fieldOutline };
}

/** The row for one of missionIds, checking missions first, as the Act menu does. */
function summarizePart(
  id: string,
  missions: readonly Mission[],
  lessons: readonly Lesson[],
): PartSummary | undefined {
  const mission = missions.find((entry) => entry.id === id);
  if (mission !== undefined) return { id, title: mission.title, kind: 'mission', cardIds: [] };
  const lesson = lessons.find((entry) => entry.id === id);
  if (lesson === undefined) return undefined;
  const cardIds = lesson.cards.map((card) => card.id);
  return { id, title: lesson.title, kind: lesson.kind, cardIds };
}

/** The summary of one Act's content. Any free-play sandbox is left out (see ActSummary). */
export function summarizeAct(content: {
  readonly act: Act;
  readonly missions: readonly Mission[];
  readonly lessons?: readonly Lesson[];
}): ActSummary {
  const { act, missions, lessons = [] } = content;
  const parts = act.missionIds.flatMap((id) => {
    const part = summarizePart(id, missions, lessons);
    return part === undefined ? [] : [part];
  });
  const drills = missions.flatMap((mission) =>
    mission.drills.map(({ id, prompt }) => ({ id, prompt })),
  );
  return { act: outlineAct(act), parts, drills };
}
