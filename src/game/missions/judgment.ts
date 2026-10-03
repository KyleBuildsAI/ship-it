import type { RepositoryDeps } from '../../engine/git/repository';
import type { Shell } from '../../engine/shell/shell';
import { transcriptQueries, type TranscriptEntry } from '../agent/transcript';
import {
  driverAction,
  dryRun,
  playContent,
  replay,
  sceneLog,
  withEntry,
  type SandboxLog,
} from '../agent/replay';
import { outcomeHolds } from './agentRunner';
import { evaluate, type SandboxQueries } from './predicates';
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
    .filter((option) => {
      const { shell, transcript, queries } = scratch(scene, deps);
      for (const action of option.script) playContent(shell, transcript, action);
      return evaluate(drill.goal, queries) && !drill.failIf.some((bad) => evaluate(bad, queries));
    })
    .map((option) => option.id);
}

/**
 * Approve: a dry run, exactly like a gate in a mission. Denying is right when allowing
 * breaks a guard. If the line asks PowerShell's Confirm question and Otto has an answer
 * ready, allowing lets him type it, so that answer is dry run as well.
 */
function approveKey(
  drill: Extract<JudgmentDrill, { kind: 'approve' }>,
  deps: RepositoryDeps,
): ApproveKey {
  const scene = sceneOf(drill, deps);
  const judge = { guards: drill.guards };
  const line = driverAction(drill.action);
  const lineRun = dryRun(scene, line, judge, deps);
  if (lineRun.harmful) return 'deny';
  const answer = drill.action.do === 'run' ? drill.action.answer : undefined;
  if (answer === undefined || !lineRun.step.asking) return 'allow';
  const asked = withEntry(scene, { kind: 'action', action: line });
  return dryRun(asked, { do: 'answer', choice: answer }, judge, deps).harmful ? 'deny' : 'allow';
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
