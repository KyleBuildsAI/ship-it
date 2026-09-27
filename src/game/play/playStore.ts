import type { CheckRow } from '../missions/predicates';
import type { QuestionRoundScore } from '../missions/grading';
import type { MissionRun } from '../missions/runner';
import type { Mission } from '../missions/schema';
import { createStore } from '../store';

/** A hint on screen, and whether Sage wrote it or it came from the mission's written ladder. */
export interface ShownHint {
  readonly level: 1 | 2 | 3;
  readonly text: string;
  readonly fromSage: boolean;
}

export interface DrillResult {
  readonly drillId: string;
  readonly passed: boolean;
  readonly seconds: number;
  readonly overtime: boolean;
}

/** Sage's grade for the optional free-text question, or why there isn't one. */
export type FreeTextGrade =
  | { readonly state: 'grading' }
  | {
      readonly state: 'graded';
      readonly score: number;
      readonly whyItMatters: string;
      readonly betterVersion: string;
    }
  | { readonly state: 'unavailable'; readonly message: string };

export interface MissionActivity {
  readonly kind: 'mission';
  readonly mission: Mission;
  readonly run: MissionRun;
  readonly hint: ShownHint | null;
  readonly hintLoading: boolean;
  /** The drill just finished, shown until the next one starts. */
  readonly lastDrill: DrillResult | null;
  readonly questionScore: QuestionRoundScore | null;
  readonly freeTextGrade: FreeTextGrade | null;
  readonly xpEarned: number;
}

/** What the player is doing now. Placement tests, reviews, and the boss join next. */
export type Activity = MissionActivity;

export interface PlayState {
  readonly activity: Activity | null;
  /** The objective checklist for whatever is being graded right now. */
  readonly checklist: readonly CheckRow[];
}

export const play = createStore<PlayState>({ activity: null, checklist: [] });
