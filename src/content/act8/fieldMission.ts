import type { FieldMissionInput } from '../../game/missions/schema';

/** Where the story lives in SandCastles. The checks below name this exact path. */
export const STORY_PATH = 'docs/story.md';

/** The files this mission commits. The other checks look only at these, never the rest. */
export const STORY_FILES = [STORY_PATH, 'README.md'] as const;

/** The five headings a STAR story needs, in order: the four parts and the lesson learned. */
export const STORY_HEADINGS = [
  'Situation',
  'Task',
  'Action',
  'Result',
  'What I would do differently',
] as const;

/*
 * The Act 8 Field Mission (DESIGN.md section 8): the project deep-dive every loop has,
 * done for real. Kyle writes his SandCastles story in STAR shape and lands it in the real
 * repo through a pull request, the workflow Act 3 taught. He's a vibe coder, so the steps
 * say what to ask his own AI agent for (with a brief he can copy) and how to check what it
 * made, not how to type it all himself.
 *
 * Checks read pasted PowerShell output on this computer, so no GitHub token or API key is
 * needed. Between them they read the story itself, not just that a commit happened:
 * - the log line proves a commit touched the story, with a Conventional message (a squash
 *   merge keeps the pull request's title, so it still passes);
 * - `git show HEAD:docs/story.md | Select-String '^## '` prints the committed story's
 *   headings, so the STAR shape is checked, not taken on trust;
 * - `git ls-files` proves the story and README are tracked, and that no .env rides along
 *   into what may be a public repo;
 * - a status limited to the two files proves they're fully committed, while unrelated
 *   work in progress elsewhere in SandCastles is left alone, so nobody is pushed into
 *   stashing, reverting or sweeping it into a commit.
 * No command has a bare `--`, because Windows PowerShell can drop one before git sees it.
 */
export const tellTheSandCastlesStory = {
  id: 'tell-the-sandcastles-story',
  title: 'Tell the SandCastles Story',
  repoName: 'SandCastles',
  briefing: [
    'Every loop asks: tell me about something you built. Your answer is SandCastles, told in STAR shape: the situation, your task, the actions you took, the result, and what you would do differently.',
    'Direct your own AI agent to interview you and draft it. Your job is to make it true, check its shape, and get it merged.',
  ],
  checklist: [
    {
      id: 'brief-your-agent',
      text: 'Open SandCastles with your AI agent and give it this brief. It asks you questions first, then drafts the story from your answers.',
      prompt:
        'Interview me about SandCastles one question at a time. Then write docs/story.md with five ## headings: Situation, Task, Action, Result, What I would do differently. Use only what I told you.',
    },
    {
      id: 'make-it-true',
      text: 'Read the draft out loud. Swap anything vague for a real detail only you know, like a bug you hit. Say plainly what the AI did and what you did. If your repo is public, so is this file: leave out keys, passwords, client names and other people’s full names.',
    },
    {
      id: 'commit-it',
      text: 'Ask your agent to link the story from README.md and merge it through a pull request, as in Act 3. If git status shows other files, leave them alone. They aren’t part of this.',
      prompt:
        'Make a branch called docs/story. Link docs/story.md from README.md. Commit only those two files, with a message like “docs: add the SandCastles project story”. Don’t delete, revert, stash or git clean any other file, or add everything at once. Open a pull request, squash-merge it, then switch to main and pull.',
    },
  ],
  verifications: [
    {
      id: 'story-committed',
      instruction:
        'In your SandCastles folder, on main, run this and paste the line. Any Conventional message like docs: ... passes. No line means no commit has touched docs/story.md yet.',
      command: 'git log --oneline -1 docs/story.md',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
    {
      id: 'story-headings',
      instruction:
        'This prints the ## headings of the story you committed. Paste them: all five, in STAR order.',
      command: "git show HEAD:docs/story.md | Select-String '^## '",
      parser: 'select-string',
      check: { kind: 'headings', headings: [...STORY_HEADINGS] },
    },
    {
      id: 'story-tracked',
      instruction:
        'Run git ls-files and paste everything it prints. The story and README must be on it, and no .env or other secret file, since a public repo shows every tracked file.',
      command: 'git ls-files',
      parser: 'ls-files',
      check: { kind: 'tracked', paths: [...STORY_FILES] },
    },
    {
      id: 'story-files-clean',
      instruction:
        'This looks only at the story and README, so other work in progress doesn’t count. Paste what it prints. If it prints nothing, both are fully committed: just press Check.',
      command: 'git status --short docs/story.md README.md',
      parser: 'status-short',
      check: { kind: 'clean', paths: [...STORY_FILES] },
    },
  ],
} satisfies FieldMissionInput;
