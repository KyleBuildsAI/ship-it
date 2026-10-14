import type { FieldMissionInput } from '../../game/missions/schema';

/** Where the story lives in SandCastles. The checks below name this exact path. */
export const STORY_PATH = 'docs/story.md';

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
 * done for real. Kyle writes his SandCastles story in STAR shape and commits it to the
 * real repo. He's a vibe coder, so the steps say what to ask his own AI agent for and how
 * to check what it made, not how to type it all himself.
 *
 * Checks read pasted PowerShell output on this computer, so no GitHub token or API key is
 * needed. `git log --oneline -1 docs/story.md` prints a line only when a commit touched
 * the story, so a Conventional line proves the file exists, is committed, and was
 * committed well. The paste checks can't read the file's headings, so the checklist shows
 * Kyle how to check those himself with Select-String. The path has no `--` before it
 * because Windows PowerShell can drop a bare `--` before git sees it.
 */
export const tellTheSandCastlesStory = {
  id: 'tell-the-sandcastles-story',
  title: 'Tell the SandCastles Story',
  repoName: 'SandCastles',
  briefing: [
    'Every loop asks: tell me about something you built. Your answer is SandCastles, told in STAR shape: the situation, your task, the actions you took, the result, and what you would do differently.',
    'Direct your own AI agent to interview you and draft it. Your job is to make it true, check its shape, and get it committed.',
  ],
  checklist: [
    {
      id: 'brief-your-agent',
      text: 'Open SandCastles with your AI agent and ask: “Interview me about SandCastles one question at a time. Then write docs/story.md with five ## headings: Situation, Task, Action, Result, What I would do differently. Use only what I told you.”',
    },
    {
      id: 'make-it-true',
      text: 'Read the draft out loud. Swap anything vague for a real detail only you know: a bug you hit, a choice you made and why. Give Result something you can point to, and say plainly what the AI did and what you did.',
    },
    {
      id: 'check-the-shape',
      text: "In PowerShell, in your SandCastles folder, run Select-String -Path docs/story.md -Pattern '^## '. You should see five headings, in STAR order. If one is missing, ask your agent to add only that section.",
    },
    {
      id: 'commit-it',
      text: 'Ask your agent to link the story from README.md and commit both with a message like “docs: add the SandCastles project story”. Then check its work with the two commands below.',
    },
  ],
  verifications: [
    {
      id: 'story-committed',
      instruction:
        'In your SandCastles folder, run git log --oneline -1 docs/story.md and paste the line. No line, or an error, means the story isn’t committed yet. A message that starts with docs: passes.',
      command: 'git log --oneline -1 docs/story.md',
      parser: 'log-oneline',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    },
    {
      id: 'story-tree-clean',
      instruction:
        'Run git status and paste everything it prints. A clean tree means nothing your agent wrote is left uncommitted.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
  ],
} satisfies FieldMissionInput;
