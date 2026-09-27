import { repo } from '../../engine/git/fixtures';
import type { MissionInput } from '../../game/missions/schema';
import { CONVENTIONAL_PATTERN, headIsConventional, headIsType } from './shared';

/**
 * Mission 2.3: one logical change per commit, Conventional Commit messages, and
 * `git commit -am`: when it saves time, and when it quietly grabs the wrong things.
 */

const PACKAGE_V1 = '{\n  "name": "quillwork-notes",\n  "version": "1.0.0"\n}\n';
const PACKAGE_V2 = '{\n  "name": "quillwork-notes",\n  "version": "1.1.0"\n}\n';
const CONFIG_V1 = "export const APP_VERSION = '1.0.0';\n";
const CONFIG_V2 = "export const APP_VERSION = '1.1.0';\n";
const README_TYPO = '# Quillwork Notes\n\nInstall with: npm instal\n';
const README_FIXED = '# Quillwork Notes\n\nInstall with: npm install\n';
const LOGIN_V1 =
  'export function normalizeEmail(email: string): string {\n  return email.toLowerCase();\n}\n';
const LOGIN_FIXED =
  'export function normalizeEmail(email: string): string {\n  return email.trim().toLowerCase();\n}\n';
const APP_V1 = "export function start(): void {\n  document.title = 'Quillwork Notes';\n}\n";
const APP_THEMED =
  "import { applyTheme } from './theme';\n\nexport function start(): void {\n  document.title = 'Quillwork Notes';\n  applyTheme('dark');\n}\n";
const THEME =
  "export function applyTheme(mode: 'light' | 'dark'): void {\n  document.body.dataset.theme = mode;\n}\n";

const CART_V1 =
  'export function total(cents: number[]): number {\n  return cents.reduce((a, b) => a + b, 0) / 100;\n}\n';
const CART_ROUNDED =
  'export function total(cents: number[]): number {\n  return Math.round(cents.reduce((a, b) => a + b, 0)) / 100;\n}\n';
const API_V1 = 'export const TIMEOUT_MS = 500;\n';
const API_V2 = 'export const TIMEOUT_MS = 5000;\n';
const SEARCH_V1 = 'export function search(query: string): string[] {\n  return [query];\n}\n';
const SEARCH_V2 =
  'export function search(query: string): string[] {\n  return query.split(" ").filter(Boolean);\n}\n';
const DEBUG_OFF = 'export const DEBUG = false;\n';
const DEBUG_ON = 'export const DEBUG = true;\n';

export const goodCommits: MissionInput = {
  id: 'good-commits',
  act: 2,
  title: 'Good Commits',
  xp: 120,
  briefing: {
    sceneId: 'good-commits',
    captions: [
      'A good commit is one idea: one fix, one feature, one docs change. Easy to review, easy to undo.',
      'Its message says what kind of change it is: fix:, feat:, docs:, chore:.',
      'git commit -am is a shortcut. It grabs every tracked edit and skips new files.',
    ],
    diagram: 'atomic-commits',
  },
  initialRepoState: repo()
    .commit('chore: scaffold notes app', {
      'package.json': PACKAGE_V1,
      'README.md': README_TYPO,
      'src/app.ts': APP_V1,
      'src/config.ts': CONFIG_V1,
      'src/login.ts': LOGIN_V1,
    })
    .modify('src/login.ts', LOGIN_FIXED)
    .modify('README.md', README_FIXED)
    .untracked('src/theme.ts', THEME)
    .modify('src/app.ts', APP_THEMED)
    .modify('package.json', PACKAGE_V2)
    .modify('src/config.ts', CONFIG_V2)
    .toSpec(),
  steps: [
    {
      id: 'commit-fix',
      instruction:
        'Four unrelated changes sit on the Workbench. Start with the bug fix in src/login.ts: commit it alone, with a message that starts with "fix:".',
      success: {
        kind: 'all',
        of: [{ kind: 'commitChanged', paths: ['src/login.ts'], only: true }, headIsType('fix')],
      },
      hints: [
        'If this fix ever needs undoing, what would you want tangled up with it?',
        'An atomic commit holds one logical change. Conventional Commit messages start with a type: fix for bugs, feat for features, docs, chore.',
        'Run: git add src/login.ts, then git commit -m "fix: trim spaces from login emails"',
      ],
    },
    {
      id: 'commit-docs',
      instruction: 'Next, the README typo. Commit it on its own, typed as docs.',
      success: {
        kind: 'all',
        of: [{ kind: 'commitChanged', paths: ['README.md'], only: true }, headIsType('docs')],
      },
      hints: [
        'Which Conventional Commit type fits a change that only touches documentation?',
        'docs: marks documentation-only changes. Kept separate, the fix commit stays easy to review and revert.',
        'Run: git add README.md, then git commit -m "docs: fix install command in readme"',
      ],
    },
    {
      id: 'commit-feature',
      instruction:
        'Dark mode is one feature in two files: the new src/theme.ts and an edit to src/app.ts. Commit both together as feat. Careful: git commit -am would skip the new file and grab the version bump.',
      success: {
        kind: 'all',
        of: [
          { kind: 'commitChanged', paths: ['src/app.ts', 'src/theme.ts'], only: true },
          headIsType('feat'),
        ],
      },
      hints: [
        'Which of these files has git never seen before?',
        'commit -a only stages files git already tracks, so new files are skipped. It also sweeps up every tracked edit, wanted or not. Stage by name instead.',
        'Run: git add src/theme.ts src/app.ts, then git commit -m "feat: add dark mode"',
      ],
      xp: 20,
    },
    {
      id: 'commit-am',
      instruction:
        'Only the version bump is left: package.json and src/config.ts, both tracked, one change. This is where git commit -am shines. Use it.',
      success: {
        kind: 'all',
        of: [
          { kind: 'clean' },
          { kind: 'commitChanged', paths: ['package.json', 'src/config.ts'], only: true },
          headIsConventional(),
        ],
      },
      hints: [
        'Is anything left on the Workbench that is new, or unrelated to the bump?',
        'git commit -am stages every tracked edit and commits in one step. Safe only when every edit belongs in this commit and nothing new needs adding.',
        'Run: git commit -am "chore: bump version to 1.1.0"',
      ],
    },
  ],
  drills: [
    {
      id: 'commits-type-fix',
      prompt:
        'The staged change fixes a rounding bug. Commit it with a Conventional Commit message of the right type.',
      setup: repo()
        .commit('feat: add cart total', { 'src/cart.ts': CART_V1 })
        .write('src/cart.ts', CART_ROUNDED)
        .stage('src/cart.ts')
        .toSpec(),
      success: {
        kind: 'all',
        of: [{ kind: 'fileAtHead', path: 'src/cart.ts', equals: CART_ROUNDED }, headIsType('fix')],
      },
      timeLimitSeconds: 60,
      concept: 'conventional-commits',
    },
    {
      id: 'commits-scope',
      prompt:
        'Commit the staged README change as docs with the scope readme, like "docs(readme): ...".',
      setup: repo()
        .commit('chore: scaffold app', { 'README.md': README_TYPO })
        .write('README.md', README_FIXED)
        .stage('README.md')
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'fileAtHead', path: 'README.md', equals: README_FIXED },
          {
            kind: 'headMessage',
            pattern: '^docs\\(readme\\): \\S',
            label: 'The message starts with "docs(readme):"',
          },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'conventional-commits',
    },
    {
      id: 'commits-split-two',
      prompt:
        'Two unrelated edits: a typo fix in README.md and a timeout fix in src/api.ts. Make two commits, one per change, with Conventional Commit messages.',
      setup: repo()
        .commit('chore: scaffold app', { 'README.md': README_TYPO, 'src/api.ts': API_V1 })
        .modify('README.md', README_FIXED)
        .modify('src/api.ts', API_V2)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          {
            kind: 'any',
            label: 'Two commits, one change each',
            of: [
              {
                kind: 'all',
                of: [
                  { kind: 'commitChanged', paths: ['README.md'], only: true },
                  { kind: 'commitChanged', ref: 'HEAD~1', paths: ['src/api.ts'], only: true },
                ],
              },
              {
                kind: 'all',
                of: [
                  { kind: 'commitChanged', paths: ['src/api.ts'], only: true },
                  { kind: 'commitChanged', ref: 'HEAD~1', paths: ['README.md'], only: true },
                ],
              },
            ],
          },
          {
            kind: 'allMessagesMatch',
            pattern: CONVENTIONAL_PATTERN,
            last: 2,
            label: 'Both messages start with a type, like "fix:"',
          },
        ],
      },
      timeLimitSeconds: 120,
      concept: 'atomic-commits',
    },
    {
      id: 'commits-leave-debug',
      prompt:
        'Commit the search feature in src/search.ts. The DEBUG flag you flipped in src/config.ts must stay out.',
      setup: repo()
        .commit('chore: scaffold app', { 'src/search.ts': SEARCH_V1, 'src/config.ts': DEBUG_OFF })
        .modify('src/search.ts', SEARCH_V2)
        .modify('src/config.ts', DEBUG_ON)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'commitChanged', paths: ['src/search.ts'], only: true },
          { kind: 'modified', paths: ['src/config.ts'] },
          headIsConventional(),
        ],
      },
      timeLimitSeconds: 90,
      concept: 'atomic-commits',
    },
    {
      id: 'commits-am-tracked',
      prompt:
        'Both tracked edits are one version bump. Commit them together, in as few commands as you can.',
      setup: repo()
        .commit('chore: scaffold app', { 'package.json': PACKAGE_V1, 'src/config.ts': CONFIG_V1 })
        .modify('package.json', PACKAGE_V2)
        .modify('src/config.ts', CONFIG_V2)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'clean' },
          { kind: 'commitChanged', paths: ['package.json', 'src/config.ts'], only: true },
          headIsConventional(),
        ],
      },
      timeLimitSeconds: 45,
      concept: 'commit-am',
    },
    {
      id: 'commits-am-trap',
      prompt:
        'Dark mode needs the edit to src/app.ts and the new file src/theme.ts. Commit both in one commit.',
      setup: repo()
        .commit('chore: scaffold app', { 'src/app.ts': APP_V1 })
        .modify('src/app.ts', APP_THEMED)
        .untracked('src/theme.ts', THEME)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'clean' },
          { kind: 'commitChanged', paths: ['src/app.ts', 'src/theme.ts'], only: true },
        ],
      },
      timeLimitSeconds: 90,
      concept: 'commit-am',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Commit the login work',
      body: 'Can you get all the login stuff committed today? Just do one big commit, it is easier to review that way. Right?',
    },
    candidates: [
      {
        id: 'one-or-many',
        text: 'Is the login work one change, or a fix plus a feature? If it is several, can I commit them separately?',
        quality: 'strong',
        rationale:
          'Separate commits can be reviewed, tested, and reverted on their own, and one big commit cannot.',
      },
      {
        id: 'reviewer',
        text: 'Who reviews it, and do they prefer one big diff or small focused commits?',
        quality: 'strong',
        rationale:
          "Checks Marco's assumption with the person it affects, and most reviewers prefer small commits.",
      },
      {
        id: 'undo-later',
        text: 'If the new feature has a bug, will we want to undo it without losing the fix?',
        quality: 'strong',
        rationale: 'Shows why atomic commits matter: git revert undoes a whole commit, never half.',
      },
      {
        id: 'convention',
        text: 'Does the team follow a message convention, like Conventional Commits?',
        quality: 'okay',
        rationale: 'Good to know, but it does not settle one commit versus several.',
      },
      {
        id: 'today-means',
        text: 'Does "today" mean committed, or reviewed and merged?',
        quality: 'okay',
        rationale: 'Clarifies the finish line, not the shape of the work.',
      },
      {
        id: 'use-am',
        text: 'Can I just run git commit -am and be done?',
        quality: 'weak',
        rationale:
          'A command, not a question about the work, and -am would skip the new files anyway.',
      },
      {
        id: 'skip-message',
        text: 'Can I leave the commit message empty to save time?',
        quality: 'weak',
        rationale: 'Git refuses empty messages, and future you needs the why.',
      },
      {
        id: 'look-bigger',
        text: 'Should I add other changes too, so the commit looks bigger?',
        quality: 'weak',
        rationale: 'Size is not effort, and unrelated changes make review and undo harder.',
      },
    ],
    rubric:
      'A strong question tests whether the work is one logical change or several, and how it will be reviewed or undone, before agreeing to a single commit.',
  },
};
