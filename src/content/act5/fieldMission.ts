import type { FieldMissionInput } from '../../game/missions/schema';

/**
 * The Act 5 Field Mission (DESIGN.md section 8): give SandCastles its second quality gate,
 * a gitleaks secret scan in GitHub Actions, and get it green through a pull request.
 *
 * SandCastles already has coverage.yml, which runs its tests on every push, so the mission
 * builds on it instead of pretending there's no CI. gitleaks is the gate lesson 5.4 ends
 * on, runs as one step on any repo (no per-folder test commands to work out on a
 * monorepo), and needs no secret of Kyle's own.
 *
 * Kyle is expected to have his own AI agent write the workflow, so the checklist is a
 * brief and a review, not YAML to type. The brief rules out the ways an agent could buy
 * a green run by weakening the gate that's already there.
 *
 * The checks read pasted output in the browser, so the game never handles a token:
 * - `git ls-files .github/workflows` must list gitleaks.yml itself. coverage.yml alone
 *   is on that list already, so "anything listed" would pass with no work.
 * - `git log --oneline -1 origin/main -- .github/workflows/gitleaks.yml` prints the newest
 *   commit on GitHub's main that touched the new file. Output at all proves it merged,
 *   and the `ci` type holds it to the message the checklist asks for.
 * - `gh run list` is GitHub's own answer on whether the run went green. gh uses Kyle's
 *   own login, so this proves the goal without a token reaching the game.
 */
export const greenOnEveryPush: FieldMissionInput = {
  id: 'green-on-every-push',
  title: 'Green on Every Push',
  repoName: 'SandCastles',
  briefing: [
    'SandCastles already has one gate: coverage.yml runs its tests on every push and pull request. Nothing checks for secrets, so a pasted key could be merged into main unnoticed. gitleaks flags it on the pull request, before the merge. The key is on GitHub by then, so that’s your cue to revoke it.',
    'You add the second gate, gitleaks from lesson 5.4, with coverage.yml as the model. You don’t write the YAML: you brief your own AI agent, review what it made, and get it green on a pull request.',
    'Each check below: run it in PowerShell in your sandcastles clone, whatever the folder is called, or ask your agent to run it and paste you the output. Then paste it here.',
  ],
  checklist: [
    {
      id: 'read-the-model',
      text: 'Open your clone of sandcastles from GitHub, the one with .github/workflows/coverage.yml, and ask your agent to explain that file. That gate already exists and is your model. You won’t change it.',
      prompt: 'Explain coverage.yml in plain words: when it runs and what it checks.',
    },
    {
      id: 'brief-the-workflow',
      text: 'Brief it to add the gitleaks workflow on its own branch, leaving the gate that’s already there alone.',
      prompt:
        'On a branch named ci/secret-scan, add .github/workflows/gitleaks.yml. Run gitleaks on every push and pull request, over the full history. Set permissions: contents: read, and add only what gitleaks’s docs require. Never use pull_request_target. No new secrets. Don’t touch coverage.yml or scripts/coverage.sh. Show me the file before committing.',
    },
    {
      id: 'review-the-file',
      text: 'Read the file as in lesson 5.3. Under on: you want push and pull_request, and a step runs gitleaks. Send it back if you see || true, continue-on-error, pull_request_target, a write permission it can’t explain, or any change to coverage.yml or scripts/coverage.sh. Each one weakens a gate or opens a hole.',
    },
    {
      id: 'open-the-pr',
      text: 'Have it commit with a message that starts with ci:, like "ci: scan every push for secrets", push the branch and open a pull request. Not straight to main: the PR is where the new check proves itself before it guards anyone.',
    },
    {
      id: 'green-then-merge',
      text: 'On the PR, wait for every check, gitleaks and coverage, to go green, then squash-merge. Red? Copy the first error to your agent and ask it to fix the cause, never to skip the check. CI runs on Linux, so file name capitals matter there (lesson 5.3). A real key found? Revoke it first (lesson 5.4).',
    },
    {
      id: 'check-the-squash-title',
      text: 'Before you confirm the squash merge, check the title GitHub fills in starts with ci:. With more than one commit it uses the PR’s title, so give the PR a ci: title too.',
    },
  ],
  verifications: [
    {
      id: 'workflow-tracked',
      instruction:
        'After the merge, run git switch main and git pull, then this. Or ask your agent to run them and paste you the output. gitleaks.yml must be on the list, which proves git tracks it.',
      command: 'git ls-files .github/workflows',
      parser: 'ls-files',
      // The other checks name gitleaks.yml too, so a .yaml spelling would fail them anyway.
      check: { kind: 'tracksPath', patterns: ['.github/workflows/gitleaks.yml'] },
    },
    {
      id: 'workflow-pushed',
      instruction:
        'Run git fetch, then this, or have your agent do it. It prints the newest commit on GitHub’s main that changed gitleaks.yml, which proves the pull request merged. Its message must start with “ci:”.',
      command: 'git log --oneline -1 origin/main -- .github/workflows/gitleaks.yml',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1, types: ['ci'] },
      whenEmpty:
        'Nothing printed: GitHub’s main has no commit that touches gitleaks.yml yet. Merge the pull request, run git fetch, then run this again.',
    },
    {
      id: 'run-green',
      instruction:
        'Last, GitHub’s own word, through the gh tool logged in as you, so the game never sees a token. Run this or have your agent run it, and paste the output. The newest run on main must be completed, with success. No gh yet? winget install GitHub.cli, then gh auth login.',
      command:
        'gh run list --workflow gitleaks.yml --branch main --limit 1 --json "status,conclusion,headBranch"',
      parser: 'gh-run-list',
      check: { kind: 'latestRunGreen' },
    },
  ],
};
