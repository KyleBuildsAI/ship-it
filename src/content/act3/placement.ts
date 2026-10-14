import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 3's placement test (DESIGN.md section 5, lesson placement tests): three cards from
 * each of the four lessons, never the final, since the final is the boss and testing out
 * never skips it. Each lesson lends one card about what git does and one about what to tell
 * Otto, so passing means Kyle can both read a branch and direct an agent through one.
 * Only two order cards (3.1 and 3.4): an order card is scored all or nothing, and with 11
 * of 12 needed, a third would let one slip end the test. Lesson 3.3 lends markers-left
 * instead of its order card, which hinged on typing git diff --check before git add:
 * judging Otto's "all resolved" against his diff is what a vibe coder actually does. Every card here makes sense on its own: cards that
 * lean on the card before them ("This time Priya merged...") stay out.
 */
export const act3Placement = {
  pitch:
    'Already branch, merge and resolve conflicts with an agent? 85% tests out of the lessons. The Field Mission still needs doing: it lands a real branch on SandCastles.',
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
    'markers-left',
    // 3.4 Tools for Bad Days
    'stuck-fix',
    'brief-the-hotfix',
    'bisect-steps',
  ],
  // 40 seconds a card, as in the final: order cards take several clicks each, and most
  // cards have a diff or log to read first, so a brisker clock would test speed, not judgment.
  timeLimitSeconds: 480,
} satisfies LessonPlacementInput;
