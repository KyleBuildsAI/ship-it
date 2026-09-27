import type { ActInput } from '../../game/missions/schema';

/**
 * The Act 2 Field Mission (DESIGN.md section 8): clean the dirty tree on Kyle's real
 * SandCastles repo. Kyle runs each command in PowerShell and pastes the output; the
 * paste checker in engine/verify reads it.
 *
 * The secrets check reads `git ls-files`, the only output that lists every tracked file,
 * changed or not. The build-output check reads `git status --short --ignored`, because
 * plain `git status` never lists ignored files; with --ignored, git marks them with `!!`.
 */
export const cleanTheDirtyTree: ActInput['fieldMission'] = {
  id: 'clean-the-dirty-tree',
  title: 'Clean the Dirty Tree',
  repoName: 'SandCastles',
  briefing: [
    'Real repo, real stakes. A deploy that builds from a clean checkout ships only what is committed. Uncommitted work silently disappears.',
    "Sort SandCastles' outstanding work into logical commits, ignore secrets and build output, and finish with a clean tree.",
  ],
  checklist: [
    {
      id: 'survey',
      text: 'In PowerShell, cd into your SandCastles folder and run git status. Group every change by the one idea it belongs to.',
    },
    {
      id: 'ignore',
      text: 'Add .env and your build output folders (like dist/ and node_modules/) to .gitignore. If one was committed before, untrack it with git rm -r --cached <path>.',
    },
    {
      id: 'commit',
      text: 'Commit each group on its own, with a Conventional Commit message like "feat: ..." or "fix: ...".',
    },
    {
      id: 'finish',
      text: 'Run git status again. It should say "nothing to commit, working tree clean".',
    },
  ],
  verifications: [
    {
      id: 'clean-status',
      instruction:
        'In PowerShell, in your SandCastles folder, run git status. Copy everything it prints and paste it here.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
    {
      id: 'conventional-history',
      instruction:
        'Run git log --oneline -3 and paste the three lines. Each one should start with a type like feat: or fix:.',
      command: 'git log --oneline -3',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 3 },
    },
    {
      id: 'no-tracked-secrets',
      instruction:
        'Run git ls-files and paste everything it prints. It lists every file git tracks, changed or not. .env must not be on it; .env.example is fine.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
    {
      id: 'build-output-ignored',
      instruction:
        'Run git status --short --ignored again and paste the output. dist/ and node_modules/ must show only with !! in front, or not at all.',
      command: 'git status --short --ignored',
      parser: 'status-short',
      check: { kind: 'ignores', patterns: ['dist/', 'node_modules/'] },
    },
  ],
};
