import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 1's placement test (DESIGN.md section 5, Placement test). A lesson placement names
 * cards only: the schema has no way to mix in the judgment drills of Missions 1.1 to 1.4,
 * so it borrows from lessons 1.5 and 1.6. The final, "Works on My Machine", is the boss
 * and stays to be played, so validateAct refuses its cards here.
 *
 * So it tests out of 1.5 and 1.6 only. Missions 1.1 to 1.4 (folders, deletes, secrets,
 * terminals) are the Act's safety ideas, and no card asks about them, so passing never
 * skips them: the Act completes once they're played too (saveRules' refreshAct).
 *
 * Each card below stands on its own. Cards that lean on the one before them ("Meanwhile",
 * "The install worked") are left out, because a placement plays borrowed cards without
 * the lesson around them. No card gives away another's answer either: who-holds-it is
 * left out because big-hammer's right option names its PID.
 *
 * Only one card is an order card. It's graded on the whole sequence, and at 85% of ten
 * cards one miss is all a pass allows, so a second one would make a single misplaced step
 * decide too much.
 */

/** Five cards from each lesson, so testing out covers both ideas. */
export const act1PlacementCardIds = [
  // 1.5 Dependencies Are Declared: what package.json says, where to install, the
  // lockfile, lookalike names, and the safe way to add a library.
  'declared',
  'wrong-folder',
  'lockfile',
  'lookalike',
  'safe-install',
  // 1.6 Running Isn't Working: a busy port, stopping only its owner, running but not
  // working, settings read at start, and asking an agent for proof.
  'address-in-use',
  'big-hammer',
  'prove-it',
  'reads-at-start',
  'brief-for-proof',
] as const;

export const act1Placement = {
  // The pitch says only what's always true. What a pass would leave depends on the save,
  // so the briefing's last line says that (lessonPlacement's placementLeavesLine).
  pitch:
    'Already install packages safely and free a busy port? 85% tests out of lessons 1.5 and 1.6, not the missions before them.',
  cardIds: [...act1PlacementCardIds],
  // 36 seconds a card: brisker than the final's 40, still time to read an artifact.
  timeLimitSeconds: 360,
} satisfies LessonPlacementInput;
