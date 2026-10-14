import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * The Act 4 Field Mission (DESIGN.md section 8): land one real change on SandCastles the
 * way a team does, through an issue and a pull request. Kyle is expected to let his own AI
 * agent do the typing; the checklist teaches what to ask it for and what to check before
 * merging, which is the skill Act 4's lessons drill.
 *
 * The game verifies by pasted PowerShell output, checked in the browser, so it needs no
 * GitHub token. A squash merge turns the PR into one commit on main titled after the PR,
 * so `git log --oneline -1` on an up-to-date main shows the PR's title, and the paste
 * checker can hold it to Conventional Commits. A plain merge commit ("Merge pull request
 * #12") is written by GitHub, so the checker ignores it and the check asks for a squash.
 * The description's sections and the linked issue are checked by Kyle on GitHub, as the
 * last checklist item says: no paste shows a PR's body.
 */
export const shipThroughAPullRequest = {
  id: 'ship-it-through-a-pull-request',
  title: 'Ship It Through a Pull Request',
  repoName: 'SandCastles',
  briefing: [
    'On a team, nothing lands on main without an issue that says why and a pull request someone can review. Do it once for real.',
    'Let your own AI agent do the typing. Your job is the one you practised at Quillwork: ask for the right thing, then check it before you merge.',
  ],
  checklist: [
    {
      id: 'pick-a-change',
      text: 'Pick one small, real improvement for SandCastles: a fix, a README section, a tidy-up. Small enough to review in five minutes.',
    },
    {
      id: 'open-the-issue',
      text: 'Ask your agent to open a GitHub issue for it first: what is wrong or missing, and how you will know it is done. Note its number, like #12.',
    },
    {
      id: 'branch-and-commit',
      text: 'Ask it to make a branch like fix/short-name, make only that change there, commit with a Conventional Commit message, and push the branch.',
    },
    {
      id: 'open-the-pr',
      text: 'Ask it to open a pull request whose title is a Conventional Commit, like "fix: ...", and whose description has three sections: What changed, Why, How to test. It ends with "Closes #12".',
    },
    {
      id: 'review-it',
      text: 'Read the PR on GitHub before merging. Does the diff hold only this change? Do the three sections say something real? Is the issue linked in the sidebar? If not, tell your agent what to fix.',
    },
    {
      id: 'squash-and-pull',
      text: 'Merge with "Squash and merge", so main gets one commit named after the PR. Check the issue closed itself. Then ask your agent to switch to main and pull.',
    },
  ],
  verifications: [
    {
      id: 'pr-main-in-sync',
      instruction:
        'In PowerShell, in your SandCastles folder, run git status and paste everything it prints. You should be on main, up to date, with nothing to commit.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
    {
      id: 'pr-squashed-onto-main',
      instruction:
        'Run git log --oneline -1 and paste the line. It is your merged PR: its title, then its number, like "fix: round tide heights (#12)". A "Merge pull request" line means it was not squashed.',
      command: 'git log --oneline -1',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
    {
      id: 'pr-shared-no-secrets',
      instruction:
        'Run git ls-files and paste the list. Everything on it is now on GitHub for reviewers to read, so .env must not be there; .env.example is fine.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
  ],
} satisfies FieldMissionInput;
