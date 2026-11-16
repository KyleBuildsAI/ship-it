import { starsFor } from '../missions/lessonRunner';
import type { LessonKind } from '../missions/lessonSchema';
import {
  isMastered,
  MASTERY_ACCURACY,
  MASTERY_ATTEMPTS,
  recentResults,
} from '../progression/stats';
import type { MissionProgress, MissionStatus, SaveData } from '../save/schema';
import type { ActSummary, PartSummary } from './actSummary';

/*
 * The skill tree (DESIGN.md section 6), worked out from Act summaries and the save alone,
 * so drawing it never downloads an Act. A node is one part of an Act: a mission, lesson or
 * final, whose title names the idea it teaches. A mission node lights when its own drills
 * are mastered (9 of the last 10 right); a lesson or final has no drills, so it lights at
 * ★★★, the same 90% bar over one whole run of its cards.
 */

/** new: never played. started: begun, not done. done: finished, not mastered. lit: mastered. */
export type NodeState = 'new' | 'started' | 'done' | 'lit';

interface NodeBase {
  readonly id: string;
  /** "2.3": the Act and the part's place in missionIds, as the Act menu numbers its rows. */
  readonly number: string;
  readonly title: string;
  readonly state: NodeState;
  /** What the save says; 'available' when the save has no entry for the part. */
  readonly status: MissionStatus;
}

export interface MissionNode extends NodeBase {
  readonly kind: 'mission';
  /** The last 10 (or fewer) results at this mission's drills, oldest first. */
  readonly recent: readonly boolean[];
}

export interface LessonNode extends NodeBase {
  readonly kind: LessonKind;
  /** The best run's stars, or 0 until the lesson is completed. */
  readonly stars: 0 | 1 | 2 | 3;
}

export type SkillNode = MissionNode | LessonNode;

/** One Act's row of the tree: its parts in play order, and how many are lit. */
export interface SkillBranch {
  readonly act: number;
  readonly title: string;
  readonly nodes: readonly SkillNode[];
  readonly lit: number;
}

/** A lesson's best first-try percent that lights its node: ★★★, the drills' 90% bar. */
export const LESSON_MASTERY_PERCENT = Math.round(MASTERY_ACCURACY * 100);

// The mission rule in words: NEEDED right of the last WINDOW attempts.
const WINDOW = String(MASTERY_ATTEMPTS);
const NEEDED = String(Math.ceil(MASTERY_ACCURACY * MASTERY_ATTEMPTS));

/**
 * Whether a lesson or final is mastered: completed with ★★★. The save keeps the best
 * first-try percent in bestDrillScore, so a lit lesson never dims. A test-out never sets
 * it, so testing out marks a lesson done, never lit.
 */
export function lessonMastered(progress: MissionProgress | undefined): boolean {
  return (
    progress?.status === 'completed' && (progress.bestDrillScore ?? 0) >= LESSON_MASTERY_PERCENT
  );
}

/** The rule every node shares, once it's known whether its part is mastered. */
function stateOf(mastered: boolean, status: MissionStatus, begun: boolean): NodeState {
  if (mastered) return 'lit';
  if (status === 'completed' || status === 'tested-out') return 'done';
  return status === 'in-progress' || begun ? 'started' : 'new';
}

function nodeFor(
  part: PartSummary,
  number: string,
  save: Pick<SaveData, 'missions' | 'drillHistory'>,
): SkillNode {
  const progress = save.missions[part.id];
  const status = progress?.status ?? 'available';
  const base = { id: part.id, number, title: part.title, status };
  if (part.kind === 'mission') {
    // Mastery is judged on recent drills alone, so new misses can dim a lit mission again.
    const recent = recentResults(save.drillHistory, part.drillIds);
    const state = stateOf(isMastered(recent), status, recent.length > 0);
    return { ...base, kind: 'mission', state, recent };
  }
  const state = stateOf(lessonMastered(progress), status, false);
  const stars = status === 'completed' ? starsFor(progress?.bestDrillScore ?? 0) : 0;
  return { ...base, kind: part.kind, state, stars };
}

/**
 * Every Act's branch, in the order the summaries list them. Pure: it reads no clock and
 * grades nothing, only results the save already holds.
 */
export function skillTree(
  summaries: readonly ActSummary[],
  save: Pick<SaveData, 'missions' | 'drillHistory'>,
): SkillBranch[] {
  return summaries.map(({ act, parts }) => {
    const nodes = parts.map((part) => {
      const number = `${String(act.act)}.${String(act.missionIds.indexOf(part.id) + 1)}`;
      return nodeFor(part, number, save);
    });
    const lit = nodes.filter((node) => node.state === 'lit').length;
    return { act: act.act, title: act.title, nodes, lit };
  });
}

/** A node's name, as the Act menu labels its row: "2.3 Good Commits", "2.6 Final: …". */
export function nodeLabel(node: SkillNode): string {
  return `${node.number} ${node.kind === 'final' ? 'Final: ' : ''}${node.title}`;
}

function starText(stars: number): string {
  return `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
}

function missionNote({ recent, state, status }: MissionNode): string {
  const right = String(recent.filter(Boolean).length);
  const tries = recent.length;
  if (state === 'lit') return `Mastered · ${right} of last ${WINDOW}`;
  if (tries === MASTERY_ATTEMPTS) return `${right} of last ${WINDOW} · needs ${NEEDED}`;
  if (tries > 0) {
    return `${String(tries)} ${tries === 1 ? 'try' : 'tries'} · ${right} right · needs ${WINDOW}`;
  }
  if (status === 'completed') return 'Done · no recent drills';
  if (status === 'tested-out') return 'Tested out · no drills yet';
  if (status === 'in-progress') return 'Started · no drills yet';
  return 'Not played yet';
}

function lessonNote({ stars, state, status }: LessonNode): string {
  if (state === 'lit') return `${starText(3)} · Mastered`;
  if (status === 'completed') return `${starText(stars)} · replay for ${starText(3)}`;
  if (status === 'tested-out') return `Tested out · play for ${starText(3)}`;
  if (status === 'in-progress') return 'Started · not finished';
  return 'Not played yet';
}

/** A node's short note, six words or fewer: how far it is from lit, in words. */
export function nodeNote(node: SkillNode): string {
  return node.kind === 'mission' ? missionNote(node) : lessonNote(node);
}
