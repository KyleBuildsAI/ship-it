import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 4's placement test (DESIGN.md section 5): three cards from each lesson, picked for
 * judgment, not vocabulary, so 85% means Kyle already has the habits. Each pick card has
 * four options with a detailed but flawed one, so choosing the longest answer can't pass
 * it, and one order card tests sequence, which is most of what Act 4 teaches. The final,
 * "Rejected Push", is the boss and lends none: it stays playable for its XP, and testing
 * out completes the Act without it.
 */
export const act4Placement = {
  pitch: 'Already push, open PRs and review them? 85% tests out of the lessons.',
  cardIds: [
    // 4.1 Remotes and Pushing: committed isn't shared, a rejection protects someone, no force.
    'committed-not-pushed',
    'push-rejected',
    'agent-wants-force',
    // 4.2 Issues and Pull Requests: a PR's life in order, one change per PR, a useful description.
    'pr-lifecycle',
    'mixed-pr',
    'brief-the-description',
    // 4.3 Reviewing Pull Requests: a skipped test, sending Otto to the root cause, CODEOWNERS.
    'agent-skipped-test',
    'redirect-otto',
    'codeowners',
    // 4.4 Releases and Versions: big isn't breaking, briefing release prep, never moving a tag.
    'big-not-breaking',
    'brief-the-release',
    'never-move-a-tag',
  ],
  // 35 seconds a card: brisker than the final's 45, for players who know this already.
  timeLimitSeconds: 420,
} satisfies LessonPlacementInput;
