import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 4's placement test (DESIGN.md section 5): three cards from each lesson, picked for
 * the habit each lesson exists to build, so 85% means Kyle already has the judgment and
 * isn't just recognising words. The final, "Rejected Push", is the boss and lends none:
 * testing out skips the lessons, never the boss.
 */
export const act4Placement = {
  pitch: 'Already push, open PRs and review them? 85% tests out of the lessons.',
  cardIds: [
    // 4.1 Remotes and Pushing: committed isn't shared, a rejection protects someone, no force.
    'committed-not-pushed',
    'push-rejected',
    'agent-wants-force',
    // 4.2 Issues and Pull Requests: issue first, a description a reviewer can use, Closes #N.
    'issue-first',
    'brief-the-description',
    'closes-keyword',
    // 4.3 Reviewing Pull Requests: a skipped test, sending Otto to the root cause, protected main.
    'agent-skipped-test',
    'redirect-otto',
    'protected-main',
    // 4.4 Releases and Versions: MAJOR, briefing release prep, never moving a published tag.
    'major',
    'brief-the-release',
    'never-move-a-tag',
  ],
  // 35 seconds a card: brisker than the final's 45, for players who know this already.
  timeLimitSeconds: 420,
} satisfies LessonPlacementInput;
