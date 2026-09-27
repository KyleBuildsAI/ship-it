import { PLACEMENT_PASS_PERCENT, type Candidate, type Quality } from './schema';

export interface DrillScore {
  /** Reached the target state within the time limit. */
  readonly passed: boolean;
  readonly seconds: number;
  /**
   * Took longer than the limit, whether the final state was right or wrong. Either way
   * the drill is a miss, so `overtime: true` alone doesn't mean the answer was right.
   */
  readonly overtime: boolean;
}

/**
 * Scores one No-AI Drill. `reachedTarget` comes from evaluating the drill's success
 * predicate against the sandbox, never from the commands typed. Drills train fast
 * recall, so a correct answer after the time limit still counts as a miss and goes to
 * the review queue.
 */
export function scoreDrill(
  reachedTarget: boolean,
  seconds: number,
  limitSeconds: number,
): DrillScore {
  const overtime = seconds > limitSeconds;
  return { passed: reachedTarget && !overtime, seconds: Math.max(0, seconds), overtime };
}

export const QUALITY_POINTS: Record<Quality, number> = { strong: 2, okay: 1, weak: 0 };

export interface PickFeedback {
  readonly id: string;
  readonly quality: Quality;
  /** Shown after the round, so every pick teaches something, good or bad. */
  readonly rationale: string;
}

export interface QuestionRoundScore {
  readonly score: number;
  /** Every pick strong: 2 points times the pick limit. */
  readonly max: number;
  readonly perPick: readonly PickFeedback[];
}

/** Thrown for picks the UI should never have allowed. A bug to fix, not a player mistake. */
export class InvalidPicksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPicksError';
  }
}

/**
 * Scores the clarifying questions Kyle picked from Marco's ticket: strong 2, okay 1,
 * weak 0. Picking fewer than the limit is allowed; it just leaves points on the table.
 */
export function scoreQuestionRound(
  picks: readonly string[],
  candidates: readonly Candidate[],
  pickLimit: number,
): QuestionRoundScore {
  if (picks.length > pickLimit) {
    throw new InvalidPicksError(
      `Picked ${String(picks.length)}, but the limit is ${String(pickLimit)}.`,
    );
  }
  if (new Set(picks).size !== picks.length) {
    throw new InvalidPicksError('The same question was picked twice.');
  }
  const perPick = picks.map((id): PickFeedback => {
    const candidate = candidates.find((option) => option.id === id);
    if (candidate === undefined) throw new InvalidPicksError(`No candidate question "${id}".`);
    return { id, quality: candidate.quality, rationale: candidate.rationale };
  });
  const score = perPick.reduce((total, pick) => total + QUALITY_POINTS[pick.quality], 0);
  return { score, max: QUALITY_POINTS.strong * pickLimit, perPick };
}

export interface PlacementResult {
  /** Rounded to a whole number for display. */
  readonly percent: number;
  readonly testedOut: boolean;
}

/**
 * The Act placement test (DESIGN.md section 5): 85% or better marks the Act as tested
 * out. The pass check uses the exact fraction, not the rounded percent, so 84.6% can't
 * round up to a pass.
 */
export function placementResult(
  results: readonly Pick<DrillScore, 'passed'>[],
  passPercent: number = PLACEMENT_PASS_PERCENT,
): PlacementResult {
  if (results.length === 0) return { percent: 0, testedOut: false };
  const passed = results.filter((result) => result.passed).length;
  return {
    percent: Math.round((100 * passed) / results.length),
    testedOut: 100 * passed >= passPercent * results.length,
  };
}
