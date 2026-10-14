import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * Act 7's Field Mission (DESIGN.md section 8): on his real SandCastles repo, Kyle writes
 * a spec before his own AI agent writes any code, has the agent build it, checks the work
 * against the spec, and lands it through a PR. Using his own agent is the point: the
 * mission teaches what to ask for and how to check it, not how to type the code.
 *
 * Every check reads output Kyle pastes from PowerShell and runs in the browser, so no
 * GitHub token or API key is needed; the Field Mission panel already says so. Pasted git
 * output can show the spec was committed and the history is tidy, but not the PR page
 * itself, so the briefing says the PR link is Kyle's to make. `git log --oneline -- docs/specs` lists only commits that touched
 * the specs folder: it prints nothing until a spec is committed, and an empty paste fails.
 */
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
      id: 'brief',
      text: 'Tell your agent: "Read docs/specs/<feature>.md. Plan first, then build it. Stop and ask if the spec is unclear. Use Conventional Commit messages."',
    },
    {
      id: 'check',
      text: 'Run the spec’s How to verify yourself, then read the diff. Anything the spec didn’t ask for goes back to the agent.',
    },
    {
      id: 'pr',
      text: 'Have your agent push the branch and open a PR whose description links docs/specs/<feature>.md. Merge it once its checks pass.',
    },
    {
      id: 'pull',
      text: 'Switch back to main and run git pull, so your laptop has the merged work.',
    },
  ],
  verifications: [
    {
      id: 'spec-committed',
      instruction:
        'In PowerShell, in your SandCastles folder on main, run git log --oneline -- docs/specs and paste what it prints. Each line is a commit that touched a spec.',
      command: 'git log --oneline -- docs/specs',
      parser: 'log-oneline',
      check: { kind: 'minCommits', count: 1 },
    },
    {
      id: 'agent-commits-conventional',
      instruction:
        'Run git log --oneline -3 and paste the three lines. Your agent followed the brief if each starts with a type like feat: or docs:.',
      command: 'git log --oneline -3',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 3 },
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
    },
  ],
} satisfies FieldMissionInput;
