import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 7's placement test: three cards from each lesson, answered by clicking on one
 * clock. Each lesson lends the cards closest to its core idea, so testing out means Kyle
 * can already brief Otto, read what Otto wrote, guard it with tests and evals, and limit
 * what Otto can reach. The final stays out: it's the boss, played on its own.
 *
 * Every card here has a wrong option about as long and specific as the right one, so
 * picking the longest answer can't pass; act7.test.ts holds the cards to that.
 */
export const act7Placement = {
  pitch: 'Already brief, review and fence in an AI agent? Miss at most one card to test out.',
  cardIds: [
    // 7.1 Brief the Agent: a spec Otto can follow, what done means, the context to give.
    'spec',
    'define-done',
    'right-context',
    // 7.2 Read What It Wrote: a lost permission check, asking for proof, scope drift.
    'auth-check',
    'ask-for-evidence',
    'scope-drift',
    // 7.3 Tests and Evals: tests first, a test bent to fit the bug, why evals.
    'test-first',
    'bent-test',
    'why-evals',
    // 7.4 Guardrails for Agents: prompt injection, least privilege, secrets in .env.
    'injection',
    'least-privilege',
    'secret-env',
  ],
  // 35 seconds a card: brisker than the final's 40, since it's for players who know this.
  timeLimitSeconds: 420,
} satisfies LessonPlacementInput;
