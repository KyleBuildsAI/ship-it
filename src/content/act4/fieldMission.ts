import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * The Act 4 Field Mission (DESIGN.md section 8): land one real change on SandCastles the
 * way a team does, through an issue and a pull request. Kyle is expected to let his own AI
 * agent do the typing; the checklist teaches what to ask it for and what to check before
 * merging, which is the skill Act 4's lessons drill.
 *
 * It is the first mission that pushes, so it starts with what a vibe coder trips on: no
 * GitHub remote, a GitHub CLI that isn't signed in, and a .env that Act 2 untracked but
 * that still sits in history, where a push would publish it. The history check comes
 * before any push for that reason.
 *
 * The game verifies by pasted PowerShell output, checked in the browser, so it needs no
 * GitHub token. After a squash merge and a pull, main's newest commit is the PR, ending
 * in its number, like "fix: round tide heights (#12)". A commit made straight on main has
 * no number, and a plain merge ("Merge pull request #12") isn't a Conventional title, so
 * both fail. The status check needs main, in step with origin/main, so a clean feature
 * branch or an unpulled main can't pass. The description's sections and the linked issue
 * are checked by Kyle on GitHub, or by the opt-in GitHub check for a public repo.
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
      id: 'check-the-remote',
      text: 'In PowerShell, in your SandCastles folder, run git remote -v. It should show origin on github.com. If it shows nothing, create an empty repo on github.com and ask your agent to add it as origin.',
    },
    {
      id: 'check-the-cli',
      text: 'Your agent opens issues and PRs with the GitHub CLI. If gh auth status says you are not logged in, run gh auth login yourself; it signs you in through your browser. Or open them yourself on github.com.',
    },
    {
      id: 'check-the-history',
      text: 'Before anything is pushed, do the first check below: git log --all --oneline -- .env. If it lists any commit, stop and don’t push. Change every key that file held, then ask for help cleaning the history.',
    },
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
      text: 'Click "Squash and merge". Before confirming, check the commit title GitHub fills in is the PR’s Conventional title ending in its number, like (#12): for a single commit it may use that commit’s message. Then ask your agent to switch to main and pull.',
    },
  ],
  verifications: [
    {
      id: 'pr-history-no-env',
      instruction:
        'Before anything is pushed, run this and copy the command line too, since it prints nothing when .env was never committed on any branch. Act 2 untracked it, but old commits still hold it.',
      command: 'git log --all --oneline -- .env',
      parser: 'log-oneline',
      check: { kind: 'noCommits', path: '.env' },
    },
    {
      id: 'pr-main-in-sync',
      instruction:
        'After the merge, in your SandCastles folder, run git fetch, then git status, and paste what git status prints. It should say you are on main, up to date with origin/main, with nothing to commit.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' },
    },
    {
      id: 'pr-squashed-onto-main',
      instruction:
        'Run git log --oneline -1 and paste the line. It is your merged PR: its title, then its number, like "fix: round tide heights (#12)". A "Merge pull request" line means it was not squashed.',
      command: 'git log --oneline -1',
      parser: 'log-oneline',
      check: { kind: 'squashMergedPr' },
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
  github: {
    instruction:
      'Optional, if SandCastles is public on GitHub: let GitHub confirm the PR itself. It checks the title, the three sections, that the issue closed, and that main is the merge.',
    sections: ['What changed', 'Why', 'How to test'],
  },
} satisfies FieldMissionInput;
