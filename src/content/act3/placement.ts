import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 3's placement test (DESIGN.md section 5, lesson placement tests): three cards from
 * each of the four lessons, never the final, since the final is the boss and testing out
 * never skips it. Each lesson lends one card about what git does, one about what to tell
 * Otto, and (where it has one) an order card, so passing means Kyle can both read a branch
 * and direct an agent through one. Every card here makes sense on its own: cards that
 * lean on the card before them ("This time Priya merged...") stay out.
 */
export const act3Placement = {
  pitch: 'Already branch, merge and resolve conflicts with an agent? 85% tests out.',
  cardIds: [
    // 3.1 Branches Are Pointers
    'what-a-branch-is',
    'brief-the-branch',
    'switch-safely',
    // 3.2 Two Ways to Merge
    'fast-forward',
    'ff-only',
    'safe-to-rebase',
    // 3.3 Conflicts Without Panic
    'why-it-stopped',
    'brief-the-resolve',
    'conflict-steps',
    // 3.4 Tools for Bad Days
    'stuck-fix',
    'brief-the-hotfix',
    'bisect-steps',
  ],
  // 35 seconds a card: brisker than the final's 40, since this is for players who already
  // know the ideas, but above the 30-second floor so reading an artifact isn't a race.
  timeLimitSeconds: 420,
} satisfies LessonPlacementInput;
