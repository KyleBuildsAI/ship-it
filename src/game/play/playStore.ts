import type { CheckRow } from '../missions/predicates';
import type { PlacementResult, QuestionRoundScore } from '../missions/grading';
import type { BossOutcome, BossRun, MissionRun } from '../missions/runner';
import type { Drill, Mission } from '../missions/schema';
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
  /** Unique per start, so a late Sage reply can't land on a replay of the same mission. */
  readonly attempt: number;
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

/** A row of timed drills: the placement test, or today's Standup Board reviews. */
export interface SeriesActivity {
  readonly kind: 'placement' | 'review';
  /** The Act a placement test belongs to; null for reviews, which mix every Act's drills. */
  readonly act: number | null;
  readonly drills: readonly Drill[];
  /** The drill on screen now, or null between drills and at the end. */
  readonly active: { readonly index: number; readonly startedAtMs: number } | null;
  readonly results: readonly DrillResult[];
  readonly placement: PlacementResult | null;
}

export interface BossActivity {
  readonly kind: 'boss';
  readonly act: number;
  readonly boss: BossRun;
  readonly outcome: BossOutcome;
  readonly secondsLeft: number;
  /** Dex's messages so far, newest last. */
  readonly messages: readonly string[];
}

/** The Field Mission: real work on a real repo, verified by pasted PowerShell output. */
export interface FieldActivity {
  readonly kind: 'field';
  readonly act: number;
}

export type Activity = MissionActivity | SeriesActivity | BossActivity | FieldActivity;

export interface PlayState {
  readonly activity: Activity | null;
  /** The objective checklist for whatever is being graded right now. */
  readonly checklist: readonly CheckRow[];
}

export const play = createStore<PlayState>({ activity: null, checklist: [] });
