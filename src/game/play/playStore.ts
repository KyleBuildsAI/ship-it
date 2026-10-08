import type { AgentStepState, Stars } from '../missions/agentRunner';
import type { Slip } from '../missions/agentSchema';
import type { CheckRow } from '../missions/predicates';
import type { PlacementResult, QuestionRoundScore } from '../missions/grading';
import type { BossOutcome, BossRun, MissionRun } from '../missions/runner';
import type { LessonRun } from '../missions/lessonRunner';
import type { Lesson } from '../missions/lessonSchema';
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
  /**
   * A judgment drill's right answer, for the reveal: an option id, 'allow' or 'deny'.
   * Missing for a drill graded by state, and for one that ended without an answer.
   */
  readonly keyId?: string;
}

/**
 * A judgment drill's scene playing before its clock starts (docs/act1-directed.md 2.2):
 * how many of Otto's history lines have run. Null when no scene is playing.
 */
export type ScenePlaying = { readonly index: number } | null;

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

/**
 * One of Otto's slips that reached a check: Kyle picked a card with a slip, and the step
 * didn't pass. `caught`: Kyle saw it (a Good catch). The Done screen counts them.
 */
export interface SlipMet {
  readonly stepId: string;
  readonly slip: Slip;
  readonly caught: boolean;
}

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
  /** The directed step on screen (agentPlay.ts), or null: a typed step, or past the sim. */
  readonly agent: AgentStepState | null;
  /** The stars each directed step earned, by step id. Act 2's typed missions keep it empty. */
  readonly stars: Readonly<Record<string, Stars>>;
  /** Every slip of Otto's that reached a check, in order. Typed missions keep it empty. */
  readonly slips: readonly SlipMet[];
  /** The next drill's scene, while it plays. Act 2's typed drills have none. */
  readonly scene: ScenePlaying;
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
  /** The next drill's scene, while it plays. Act 2's typed drills have none. */
  readonly scene: ScenePlaying;
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

/** A lesson: cards answered by clicking. A final's shared clock lives in its run. */
export interface LessonActivity {
  readonly kind: 'lesson';
  readonly lesson: Lesson;
  readonly run: LessonRun;
  /** XP this run paid into the save: the lesson's XP the first time, 0 on a replay. */
  readonly xpEarned: number;
}

export type Activity =
  MissionActivity | SeriesActivity | BossActivity | FieldActivity | LessonActivity;

export interface PlayState {
  readonly activity: Activity | null;
  /** The objective checklist for whatever is being graded right now. */
  readonly checklist: readonly CheckRow[];
}

export const play = createStore<PlayState>({ activity: null, checklist: [] });
