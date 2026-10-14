import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 1's placement test (DESIGN.md section 5, Placement test). A lesson placement names
 * cards only: the schema has no way to mix in the judgment drills of Missions 1.1 to 1.4,
 * so it borrows from lessons 1.5 and 1.6. The final, "Works on My Machine", is the boss
 * and stays to be played, so validateAct refuses its cards here.
 *
 * Each card below stands on its own. Cards that lean on the one before them ("Meanwhile",
 * "The install worked") are left out, because a placement plays borrowed cards without
 * the lesson around them.
 */

/** Five cards from each lesson, its order card last, so testing out covers both ideas. */
export const act1PlacementCardIds = [
  // 1.5 Dependencies Are Declared: what package.json says, where to install, the
  // lockfile, lookalike names, and the safe way to add a library.
  'declared',
  'wrong-folder',
  'lockfile',
  'lookalike',
  'safe-install',
  // 1.6 Running Isn't Working: a busy port, its owner by PID, stopping only that one,
  // settings read at start, and the routine that ends in proof.
  'address-in-use',
  'who-holds-it',
  'big-hammer',
  'reads-at-start',
  'free-start-check',
] as const;

export const act1Placement = {
  pitch: 'Already install packages safely and free a busy port? 85% tests out of Act 1.',
  cardIds: [...act1PlacementCardIds],
  // 36 seconds a card: brisker than the final's 40, still time to read an artifact.
  timeLimitSeconds: 360,
} satisfies LessonPlacementInput;
