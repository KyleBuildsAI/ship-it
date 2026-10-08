import type { RepositoryDeps } from '../../engine/git/repository';
import { DriverError, type ConfirmLetter } from '../../engine/shell/driver';
import type { Shell } from '../../engine/shell/shell';
import { transcriptQueries, type TranscriptEntry } from '../agent/transcript';
import {
  driverAction,
  dryRun,
  dryRunRefused,
  playContent,
  replay,
  sceneLog,
  withEntry,
  type SandboxLog,
} from '../agent/replay';
import { outcomeHolds, REFUSAL } from './agentRunner';
import { evaluate, type Predicate, type SandboxQueries } from './predicates';
import { sandboxQueries } from './sandbox';
import type { JudgmentDrill } from './schema';

/*
 * Grading a judgment drill (docs/act1-directed.md section 2). No drill says which answer
 * is right. The grader works the key out every time by playing the drill's scene into a
 * scratch sandbox and running what each answer would do, so a key can never go stale when
 * the engine or the setup changes. Everything here is pure: the caller passes the deps,
 * and the live sandbox is never touched.
 */

/** What Kyle answered. Order and spot drills (B11) will add their own shapes here. */
export type JudgmentAnswer =
  /** He picked one of a predict, diagnose or fix drill's options. */
  | { readonly kind: 'pick'; readonly optionId: string }
  /** He allowed or denied the action in an approve drill. */
  | { readonly kind: 'approve'; readonly allow: boolean };

export interface JudgmentGrade {
  readonly passed: boolean;
  /**
   * The right answer, for the reveal: an option id, or 'allow' or 'deny'. In a fix drill
   * where several options work, it's Kyle's pick when his works, else the first that does.
   */
  readonly keyId: string;
}

/** The answer an approve drill's key names. */
export type ApproveKey = 'allow' | 'deny';

/**
 * A drill that can't be graded, like a predict with two true options. It's a content bug
 * that the drill tests catch, never something Kyle did, so it throws.
 */
export class JudgmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgmentError';
  }
}

/**
 * Every right answer to a drill, worked out by running it. Predict and diagnose have
 * exactly one; fix has one or more; approve has 'allow' or 'deny'. Content tests read
 * this to prove each drill has the key its author meant.
 */
export function answerKey(drill: JudgmentDrill, deps: RepositoryDeps): readonly string[] {
  return asJudgmentError(`"${drill.id}"`, () => {
    switch (drill.kind) {
      case 'predict':
        return exactlyOne(drill, predictKey(drill, deps));
      case 'diagnose':
        return exactlyOne(drill, diagnoseKey(drill, deps));
      case 'fix':
        return atLeastOne(drill, fixKey(drill, deps));
      case 'approve':
        return [approveKey(drill, deps)];
    }
  });
}

/**
 * Runs part of the grading, turning the driver's complaint (like a line typed while
 * PowerShell is still asking) into a JudgmentError that names the drill. Either way it's a
 * content bug, and callers catch JudgmentError to say so.
 */
function asJudgmentError<T>(where: string, grade: () => T): T {
  try {
    return grade();
  } catch (error) {
    if (error instanceof DriverError) throw new JudgmentError(`${where}: ${error.message}`);
    throw error;
  }
}

/** Grades Kyle's answer to a drill against the key found by running it. */
export function gradeJudgment(
  drill: JudgmentDrill,
  answer: JudgmentAnswer,
  deps: RepositoryDeps,
): JudgmentGrade {
  const key = answerKey(drill, deps);
  const given = answerId(drill, answer);
  const passed = key.includes(given);
  return { passed, keyId: passed ? given : (key[0] ?? '') };
}

/**
 * The right answer to show when Kyle gave none (the clock ran out): the first key, as
 * gradeJudgment would show after a miss. A timeout is a miss too, and the reveal should
 * still teach him what was right.
 */
export function unansweredKey(drill: JudgmentDrill, deps: RepositoryDeps): string {
  return answerKey(drill, deps)[0] ?? '';
}

/**
 * Whether `answer` is the kind of answer `drill` takes: allow or deny for approve, else one
 * of its own options. Play checks this first, so a stray click is ignored, not thrown.
 */
export function answerFits(drill: JudgmentDrill, answer: JudgmentAnswer): boolean {
  if (drill.kind === 'approve') return answer.kind === 'approve';
  return answer.kind === 'pick' && drill.options.some((option) => option.id === answer.optionId);
}

/** Kyle's answer as an id that can sit in a key, after checking it fits the drill. */
function answerId(drill: JudgmentDrill, answer: JudgmentAnswer): string {
  if (drill.kind === 'approve') {
    if (answer.kind !== 'approve')
      throw new JudgmentError(`"${drill.id}" is answered by allow or deny.`);
    return answer.allow ? 'allow' : 'deny';
  }
  if (answer.kind !== 'pick') throw new JudgmentError(`"${drill.id}" is answered by a pick.`);
  if (!drill.options.some((option) => option.id === answer.optionId)) {
    throw new JudgmentError(`"${drill.id}" has no option "${answer.optionId}".`);
  }
  return answer.optionId;
}

/** The laptop as the clock starts: the setup, then every line Otto already ran. */
function sceneOf(drill: JudgmentDrill, deps: RepositoryDeps): SandboxLog {
  return sceneLog(drill.setup, drill.history, deps);
}

/** A scratch copy of the scene, ready to be run further, and questions about it. */
function scratch(log: SandboxLog, deps: RepositoryDeps) {
  const { shell, transcript } = replay(log, deps);
  return { shell, transcript, queries: queriesOf(shell, transcript) };
}

function queriesOf(shell: Shell, transcript: TranscriptEntry[]): SandboxQueries {
  return sandboxQueries(shell.ws, transcriptQueries(transcript));
}

/**
 * Predict: run the line once, then ask each option whether it describes what happened.
 * The prediction is about the line itself, so if PowerShell asks its Confirm question, the
 * outcome is the laptop as it stands while asking, before any answer.
 */
function predictKey(drill: Extract<JudgmentDrill, { kind: 'predict' }>, deps: RepositoryDeps) {
  const ran = dryRun(sceneOf(drill, deps), driverAction(drill.action), { guards: [] }, deps);
  return drill.options
    .filter((option) => outcomeHolds(option.outcome, ran.step, ran.queries))
    .map((option) => option.id);
}

/** Diagnose: each option's truth, read on the scene's end state. No truth is never right. */
function diagnoseKey(drill: Extract<JudgmentDrill, { kind: 'diagnose' }>, deps: RepositoryDeps) {
  const { queries } = scratch(sceneOf(drill, deps), deps);
  return drill.options
    .filter((option) => option.truth !== undefined && evaluate(option.truth, queries))
    .map((option) => option.id);
}

/**
 * Fix: each option's script runs in its own scratch copy, with Otto's answers to any
 * Confirm question. It works when the goal holds after it and nothing in failIf does.
 */
function fixKey(drill: Extract<JudgmentDrill, { kind: 'fix' }>, deps: RepositoryDeps) {
  const scene = sceneOf(drill, deps);
  return drill.options
    .filter((option) =>
      asJudgmentError(`"${drill.id}" option "${option.id}"`, () => {
        const { shell, transcript, queries } = scratch(scene, deps);
        for (const action of option.script) playContent(shell, transcript, action);
        return evaluate(drill.goal, queries) && !drill.failIf.some((bad) => evaluate(bad, queries));
      }),
    )
    .map((option) => option.id);
}

/** An answer that kept PowerShell asking this often is an engine bug, not a long line. */
const MAX_ANSWERS = 100;

/**
 * Approve: judged the way a mission judges the same line, gate by gate, so a drill and a
 * mission never disagree. Denying is right when allowing breaks a guard.
 * - The line is weighed with every Confirm question refused (dryRunRefused), as a line
 *   gate does: refusing can't undo the paths that never asked, like a plain file beside
 *   a folder in `Remove-Item notes, package.json`.
 * - Allowing lets Otto type his answer. When PowerShell asks again about the next item,
 *   he gives the same answer again (agentRunner.confirmAsked), so each answer is dry run
 *   in turn until PowerShell stops asking. Any one that breaks a guard makes it a deny.
 */
function approveKey(
  drill: Extract<JudgmentDrill, { kind: 'approve' }>,
  deps: RepositoryDeps,
): ApproveKey {
  const scene = sceneOf(drill, deps);
  const judge = { guards: drill.guards };
  const line = driverAction(drill.action);
  const lineRun = dryRunRefused(scene, line, judge, deps, REFUSAL);
  if (lineRun.harmful) return 'deny';
  if (!lineRun.step.asking) return 'allow';
  const choice = drill.action.do === 'run' ? drill.action.answer : undefined;
  if (choice === undefined) {
    // The runner refuses this too (agentRunner.authoredAnswer): Otto would have no answer.
    throw new JudgmentError(`"${drill.id}" asks a Confirm question but has no answer for it.`);
  }
  return answersHarm(withEntry(scene, { kind: 'action', action: line }), choice, judge, deps)
    ? 'deny'
    : 'allow';
}

/** Whether Otto's answer, given each time PowerShell asks, breaks a guard on any of them. */
function answersHarm(
  asked: SandboxLog,
  choice: ConfirmLetter,
  judge: { readonly guards: readonly Predicate[] },
  deps: RepositoryDeps,
): boolean {
  const answer = { do: 'answer', choice } as const;
  let log = asked;
  for (let answered = 0; answered < MAX_ANSWERS; answered++) {
    const run = dryRun(log, answer, judge, deps);
    if (run.harmful) return true;
    if (!run.step.asking) return false;
    log = withEntry(log, { kind: 'action', action: answer });
  }
  throw new JudgmentError(`PowerShell kept asking after "${choice}".`);
}

function exactlyOne(drill: JudgmentDrill, ids: readonly string[]): readonly string[] {
  if (ids.length !== 1) {
    throw new JudgmentError(
      `"${drill.id}" needs exactly one true option, and has ${String(ids.length)}.`,
    );
  }
  return ids;
}

function atLeastOne(drill: JudgmentDrill, ids: readonly string[]): readonly string[] {
  if (ids.length === 0) throw new JudgmentError(`"${drill.id}" has no fix that works.`);
  return ids;
}

/**
 * The order to show a drill's options in on one attempt. The same drill and attempt always
 * give the same order, so a reload shows what Kyle saw. The next attempt (one more
 * drillHistory entry) gets a fresh random order. It can match the last one by chance
 * (1 in 6 with three options), but over a few reviews remembering where the right answer
 * sat stops working.
 */
export function shuffleFor(drillId: string, attempt: number): <T>(items: readonly T[]) => T[] {
  return <T>(items: readonly T[]): T[] => {
    const random = seededRandom(hashText(`${drillId}#${String(attempt)}`));
    const shuffled = [...items];
    // Fisher-Yates: walk down from the end, swapping each item with one at or before it.
    for (let last = shuffled.length - 1; last > 0; last--) {
      const pick = Math.floor(random() * (last + 1));
      [shuffled[last], shuffled[pick]] = [shuffled[pick] as T, shuffled[last] as T];
    }
    return shuffled;
  };
}

/** FNV-1a: turns text into a 32-bit number, so a drill id can seed the shuffle. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a small generator that gives the same numbers for the same seed. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
