import type { FieldMissionInput } from '../../game/missions/schema';

/*
 * Act 1's Field Mission, "Brief Your Real Agent" (docs/act1-directed.md section 3.8):
 * real work on Kyle's real SandCastles repo. In the game Otto starts every job knowing
 * nothing about the laptop; Kyle's real coding agent is the same, so he writes the setup
 * section it reads first.
 *
 * Kyle is expected to have his own agent do the typing. The checklist teaches what to ask
 * for and how to check the answer, the same directing Missions 1.1 to 1.4 practise.
 *
 * Verification is the design's first stage (v1): four pasted checks the existing parsers
 * can read, checked in the browser, so no GitHub token or API key is involved. Each one
 * looks at the brief, never the whole repo: a dirty working tree is where Act 2's Field
 * Mission starts, and Act 1 comes before git is taught. They prove the brief is tracked
 * with no secret beside it, that it is committed and pushed, and that the newest commit
 * is a docs: commit. The paste guard (findSecretLike) runs before any of them. Checks
 * that read the section itself (heading, port, names, no values) are the design's v2 and
 * need new parsers.
 *
 * Act 1 also comes before Act 2 adds .env to .gitignore, so SandCastles may not ignore it
 * yet. The commit step stages the brief by name and checks before committing, because a
 * pushed secret has to be rotated, and the handoff tests in a fresh clone so setup can't
 * overwrite the real .env.
 *
 * The design's checklist also suggests the section say deletes and installs need
 * approval. That's kept as one line of the brief: nothing here asks Kyle to write
 * permission rules into a settings file.
 */
export const briefYourRealAgent = {
  id: 'brief-your-real-agent',
  title: 'Brief Your Real Agent',
  repoName: 'SandCastles',
  briefing: [
    'Your real agent starts every session knowing nothing about your machine, just like Otto did.',
    'Have it write the setup section it reads first: runtimes, start command, ports, variable names. Names only; values never leave .env.',
  ],
  checklist: [
    {
      id: 'runtimes',
      text: 'Ask your agent which tools SandCastles needs, and to check which are installed with the command in this brief. A tool that is missing prints nothing.',
      prompt:
        'Which tools does SandCastles need to run? Check which are installed with: Get-Command node, npm, git, python, docker -ErrorAction SilentlyContinue',
    },
    {
      id: 'env-names',
      text: 'Ask it to list the variable names in .env.example, never their values. Check its answer: names like PORT, with nothing after the equals sign.',
    },
    {
      id: 'ports',
      text: 'Start SandCastles, then ask your agent which port it listens on. Check it yourself: open that localhost address in Chrome and see it answer.',
    },
    {
      id: 'doc',
      text: 'Ask it to add an "## Environment" section to the CLAUDE.md or AGENTS.md it reads first: where the project lives (say "the repo root", not a full path with your name in it), the start command, the ports, the variable names, "never print or read .env", and "ask before deleting or installing". Read every line before you accept.',
    },
    {
      id: 'handoff',
      text: 'Test the brief: clone SandCastles into a new, empty folder, never your working one, and in a fresh session ask your agent to set it up using only that section. Tell it to ask before creating or overwriting any .env. Whatever it had to guess, add to the section.',
    },
    {
      id: 'stage',
      text: 'Back in your working folder, ask your agent to stage only the brief, by name (git add CLAUDE.md, or AGENTS.md; never git add . or git add -A), then show you git status before committing. If .env appears anywhere in it, stop and have it add .env to .gitignore first, so git can never pick it up.',
    },
    {
      id: 'commit',
      text: 'Once git status shows only the brief staged, ask it to commit with a docs: message, like "docs: add environment setup for agents", and push it to GitHub.',
    },
  ],
  verifications: [
    {
      id: 'no-secrets-tracked',
      instruction:
        'In PowerShell, in your SandCastles folder, run git ls-files and paste everything it prints. .env must not be on the list.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
    {
      id: 'brief-tracked',
      instruction:
        'Paste the same git ls-files list here. Your CLAUDE.md or AGENTS.md should be on it, which means git keeps it.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'tracksAny', paths: ['CLAUDE.md', 'AGENTS.md'] },
    },
    {
      id: 'brief-pushed',
      instruction:
        'Run this and paste what it prints. It looks only at the brief, so other unfinished work doesn’t matter. The ## line should end in origin/main with no [ahead …], which means GitHub has it.',
      command: 'git status -sb -- CLAUDE.md AGENTS.md',
      parser: 'status-short',
      check: { kind: 'clean', pushed: true },
    },
    {
      id: 'docs-commit',
      instruction:
        'Run git log --oneline -3 and paste the three lines. The top one is your newest commit: it should start with docs:.',
      command: 'git log --oneline -3',
      parser: 'log-oneline',
      // Only the newest commit is judged: the brief is one commit, whatever came before.
      check: {
        kind: 'newestCommitType',
        type: 'docs',
        example: 'docs: add environment setup for agents',
      },
    },
  ],
} satisfies FieldMissionInput;
