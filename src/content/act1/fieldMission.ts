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
 * Verification is the design's first stage (v1): three pastes the existing parsers can
 * read, checked in the browser, so no GitHub token or API key is involved. They prove the
 * new file is tracked with no secret beside it, that nothing is left uncommitted, and
 * that the newest commit has a Conventional message. Checks that read the section itself
 * (heading, port, names, no values) are the design's v2 and need new parsers.
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
      text: 'Ask your agent which tools SandCastles needs, and to check which are installed. It can run: Get-Command node, npm, git, python, docker -ErrorAction SilentlyContinue. Missing ones print nothing.',
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
      text: 'Ask it to add an "## Environment" section to the CLAUDE.md or AGENTS.md it reads first: the project folder, the start command, the ports, the variable names, "never print or read .env", and "ask before deleting or installing". Read every line before you accept.',
    },
    {
      id: 'handoff',
      text: 'Test the brief: in a fresh session, ask your agent to set SandCastles up using only that section. Whatever it had to guess, add to the section.',
    },
    {
      id: 'commit',
      text: 'Ask it to commit the file with a docs: message, like "docs: add environment setup for agents", and push it to GitHub.',
    },
  ],
  verifications: [
    {
      id: 'no-secrets-tracked',
      instruction:
        'In PowerShell, in your SandCastles folder, run git ls-files and paste everything it prints. Your CLAUDE.md or AGENTS.md should be on the list. .env must not be.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'noTrackedSecrets' },
    },
    {
      id: 'clean-tree',
      instruction:
        'Run git status and paste everything it prints. It should say "nothing to commit, working tree clean", and "up to date with \'origin/main\'" means the push landed.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
    {
      id: 'docs-commit',
      instruction:
        'Run git log --oneline -3 and paste the three lines. The top one is your newest commit: it should start with docs:.',
      command: 'git log --oneline -3',
      parser: 'log-oneline',
      // Only the newest commit is judged: the brief is one commit, whatever came before.
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
  ],
} satisfies FieldMissionInput;
