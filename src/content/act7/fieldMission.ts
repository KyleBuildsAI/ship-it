import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * Act 7's Field Mission (DESIGN.md section 8): on his real SandCastles repo, Kyle writes
 * a spec before his own AI agent writes any code, has the agent write the spec's check as
 * a failing test first, build until it passes, and land it through a PR. Using his own
 * agent is the point: the mission teaches what to ask for and how to check it, not how to
 * type the code.
 *
 * Every check reads output Kyle pastes from PowerShell and runs in the browser, so no
 * GitHub token or API key is needed; the Field Mission panel already says so. Each paste
 * looks at this mission's work, not at what Act 2's Field Mission already proved:
 * - `git ls-files docs/specs` shows a spec file is on main now.
 * - `git log --first-parent` lists only what main itself received, so its newest spec
 *   commit is GitHub's merge of the PR: a squash ends in "(#14)", a merge commit says
 *   "Merge pull request #14". A commit pushed straight to main has neither.
 * - `git log --oneline -1 -- docs/specs` is one commit about the spec, so older history
 *   neither passes nor fails the Conventional check. After a squash merge it's the PR
 *   title, which is why the checklist asks for a Conventional PR title.
 * Logs limited to docs/specs print nothing until a spec reaches main, so those checks say
 * that instead of "paste it first". Pasted git output can't see the PR page itself, so
 * the briefing says linking the spec in the PR is Kyle's to do.
 */
const NO_SPEC_YET =
  'It printed nothing: no spec is on main yet. Merge the PR, then run git switch main and git pull.';

export const specThenShip = {
  id: 'spec-then-ship',
  title: 'Spec It, Then Ship It',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real agent. In SandCastles, you write the brief before your AI agent writes any code: a spec file it reads, builds from, and is checked against.',
    'Your agent can help draft the spec, but you decide what it says. Your pastes show the game your commits, not the PR page, so linking the spec in the PR is on you.',
  ],
  checklist: [
    {
      id: 'pick',
      text: 'Pick one small SandCastles feature or fix. Ask your agent to start a branch for it, like feat/<feature>.',
    },
    {
      id: 'spec',
      text: 'Write docs/specs/<feature>.md with four headings: Goal (one sentence), Constraints (what must not change), Done means (what you will see when it works), How to verify (the exact check to run).',
    },
    {
      id: 'test-first',
      text: 'Tell your agent: "Turn the spec’s How to verify into a test. Write it first and show me it failing. Then make it pass without editing the test."',
    },
    {
      id: 'brief',
      text: 'Then: "Read docs/specs/<feature>.md. Plan first, then build it until that test passes. Stop and ask if the spec is unclear. Use Conventional Commit messages."',
    },
    {
      id: 'check',
      text: 'Run the spec’s How to verify yourself, then read the diff. Anything the spec didn’t ask for goes back to the agent.',
    },
    {
      id: 'pr',
      text: 'Have your agent push the branch and open a PR whose description links docs/specs/<feature>.md. Give the PR a Conventional title like feat: add tide alerts; a squash merge uses it as the commit message. Merge it once its checks pass, or if it has none, once your spec’s How to verify passes.',
    },
    {
      id: 'pull',
      text: 'Switch back to main and run git pull, so your laptop has the merged work.',
    },
  ],
  verifications: [
    {
      id: 'spec-on-main',
      instruction:
        'In PowerShell, in your SandCastles folder on main, run git ls-files docs/specs and paste what it prints: the spec files git tracks.',
      command: 'git ls-files docs/specs',
      parser: 'ls-files',
      check: { kind: 'tracksPath', patterns: ['docs/specs/*.md'] },
      whenEmpty: NO_SPEC_YET,
    },
    {
      id: 'spec-landed-by-pr',
      instruction:
        'Run this and paste the line it prints. It shows how your spec reached main: through a PR, or pushed straight to it.',
      command: 'git log --oneline --first-parent -1 -- docs/specs',
      parser: 'log-oneline',
      check: { kind: 'viaPullRequest' },
      whenEmpty: NO_SPEC_YET,
      advice:
        'That commit has no PR number, so it went straight to main. Land your next spec through a PR and merge it on GitHub.',
    },
    {
      id: 'agent-commits-conventional',
      instruction:
        'Run this and paste the line: the newest commit that touched a spec. Your agent followed the brief if it starts with a type like feat: or docs:.',
      command: 'git log --oneline -1 -- docs/specs',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
      whenEmpty: NO_SPEC_YET,
      advice:
        'Fix it in your next PR’s title: with a squash merge, the PR title becomes the commit message.',
    },
    {
      id: 'nothing-left-behind',
      instruction:
        'Run git status and paste everything it prints. Agents leave stray files; a clean tree means the merged PR holds all the work.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
    {
      id: 'agent-kept-secrets-out',
      instruction:
        'Run git ls-files and paste everything it prints. If your agent made a .env, it must not be on this list; .env.example is fine.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
      advice:
        'Roll (revoke and replace) that key now, since it was pushed; then untrack it with git rm --cached and commit.',
    },
  ],
} satisfies FieldMissionInput;
