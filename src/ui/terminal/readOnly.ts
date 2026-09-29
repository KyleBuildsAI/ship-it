import { isJudgmentDrill, type Drill, type Mission } from '../../game/missions/schema';

/**
 * The parts of the activity being played (playStore.ts) that decide who has the terminal.
 * Only these, so later fields on an activity never change the answer.
 */
export type Playing =
  | { readonly kind: 'mission'; readonly mission: Mission }
  | {
      readonly kind: 'placement' | 'review';
      readonly drills: readonly Drill[];
      readonly active: { readonly index: number } | null;
      readonly results: readonly unknown[];
    }
  | { readonly kind: 'boss' | 'field' };

/**
 * Otto has the terminal (spec D12): it shows his feed, and typing is off because nothing
 * in Act 1 needs it. That's a directed mission from start to finish, and a placement test
 * or review whose drill on screen, or next up, is a judgment drill. Everything else is
 * typed as before: Act 2's missions, drills, boss and Field Mission, and free play.
 */
export function isReadOnly(activity: Playing | null): boolean {
  if (activity === null) return false;
  switch (activity.kind) {
    case 'mission':
      return activity.mission.steps.some((step) => step.agent !== undefined);
    case 'placement':
    case 'review': {
      // Between drills nothing is active, and the next drill is the one after the results.
      // A judgment drill's scene plays before its clock starts, so it counts from here.
      const drill = activity.drills[activity.active?.index ?? activity.results.length];
      return drill !== undefined && isJudgmentDrill(drill);
    }
    case 'boss':
    case 'field':
      return false;
  }
}
