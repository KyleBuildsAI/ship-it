import { repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from '../../game/missions/agentSchema';
import type { Predicate } from '../../game/missions/predicates';
import type { JudgmentDrillInput, MissionInput } from '../../game/missions/schema';
import { CONVENTIONAL_PATTERN, headIsType } from './shared';

/**
 * Mission 2.3, directed: one logical change per commit, Conventional Commit messages, and
 * `git commit -am`: when it saves time, and when it quietly grabs the wrong things.
 *
 * Otto commits, and Kyle decides what goes in each commit. Every change pauses
 * (`changes`), so each `git add` and each commit shows what it loads or seals before it
 * runs, and Kyle can stop a bundle before it lands. Nothing here says which line is
 * harmful: a dry run against each step's guards works that out, and goodCommits.test.ts
 * plays every card to prove it.
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

/** The messages Otto writes when he gets it right, one per step. */
const FIX_MESSAGE = 'fix: trim spaces from login emails';
const DOCS_MESSAGE = 'docs: fix install command in readme';
const FEAT_MESSAGE = 'feat: add dark mode';
const CHORE_MESSAGE = 'chore: bump version to 1.1.0';

const LOGIN = 'src/login.ts';
const README = 'README.md';
const APP = 'src/app.ts';
const THEME_PATH = 'src/theme.ts';
const PACKAGE = 'package.json';
const CONFIG = 'src/config.ts';

const not = (predicate: Predicate): Predicate => ({ kind: 'not', predicate });
const all = (...of: Predicate[]): Predicate => ({ kind: 'all', of });
/** One checklist row for several checks, the way Act 1 words a step's goal. */
const labelled = (label: string, ...of: Predicate[]): Predicate => ({ kind: 'all', of, label });
const changed = (...paths: string[]): Predicate => ({ kind: 'commitChanged', paths });
const changedOnly = (...paths: string[]): Predicate => ({
  kind: 'commitChanged',
  paths,
  only: true,
});
/** The commit before the newest changed exactly these paths. */
const parentChangedOnly = (...paths: string[]): Predicate => ({
  kind: 'commitChanged',
  ref: 'HEAD~1',
  paths,
  only: true,
});
const historyKeeps = (min: number): Predicate => ({
  kind: 'commitCount',
  min,
  label: 'Earlier commits stay',
});
/** The newest message has a type. Labelled, so the checklist never shows the regex. */
const TYPED: Predicate = {
  kind: 'headMessage',
  pattern: CONVENTIONAL_PATTERN,
  label: 'The newest message starts with a type',
};

/** Four unrelated changes on the Workbench, the way a busy afternoon leaves them. */
const workbench = () =>
  repo()
    .commit('chore: scaffold notes app', {
      'package.json': PACKAGE_V1,
      'README.md': README_TYPO,
      'src/app.ts': APP_V1,
      'src/config.ts': CONFIG_V1,
      'src/login.ts': LOGIN_V1,
    })
    .modify(LOGIN, LOGIN_FIXED)
    .modify(README, README_FIXED)
    .untracked(THEME_PATH, THEME)
    .modify(APP, APP_THEMED)
    .modify(PACKAGE, PACKAGE_V2)
    .modify(CONFIG, CONFIG_V2);

/** Read-only lines Kyle can have Otto run while he checks a claim. */
const gitLooks = [
  { id: 'status', label: "What's on the dock?", line: 'git status' },
  { id: 'log', label: "What's in the Vault?", line: 'git log --oneline' },
  { id: 'staged', label: 'What will commit?', line: 'git diff --staged' },
];

/*
 * Each step's first guard says "if the newest commit holds this change, it holds only this
 * change, under the right type". It holds before the change is committed at all, so the
 * only line that breaks it is one that seals the change wrongly: bundled with others, or
 * mislabelled. That is the line Kyle should deny.
 *
 * That guard alone misses a bundle that leaves this step's change out, like sealing dark
 * mode and the bump under docs: once the README fix is already in. So each step also
 * guards the changes later steps commit: none of them may reach a commit yet.
 */

const README_AT_HEAD: Predicate = { kind: 'fileAtHead', path: README, contains: 'npm install' };
const APP_AT_HEAD: Predicate = { kind: 'fileAtHead', path: APP, contains: 'applyTheme' };
const THEME_AT_HEAD: Predicate = { kind: 'fileAtHead', path: THEME_PATH, contains: 'applyTheme' };
const BUMP_OUT = [
  not({ kind: 'fileAtHead', path: PACKAGE, contains: '1.1.0' }),
  not({ kind: 'fileAtHead', path: CONFIG, contains: '1.1.0' }),
];
const DARK_MODE_OUT = [not(APP_AT_HEAD), not(THEME_AT_HEAD)];

// Step 1: the login fix.
const LOGIN_AT_HEAD: Predicate = { kind: 'fileAtHead', path: LOGIN, contains: 'trim()' };
const FIX_ALONE = all(changedOnly(LOGIN), headIsType('fix'));
const FIX_GUARD: Predicate = {
  ...not(all(changed(LOGIN), LOGIN_AT_HEAD, not(FIX_ALONE))),
  label: 'The login fix is its own fix commit',
};
const LATER_OUT_1 = labelled(
  'README, dark mode and the bump stay uncommitted',
  not(README_AT_HEAD),
  ...DARK_MODE_OUT,
  ...BUMP_OUT,
);

/**
 * Step 1: commit the login fix alone. The weak card only loads every crate and calls
 * that saved; the okay card's `commit -am` seals every tracked edit with the fix, which a
 * dry run finds harmful.
 */
const commitFixTask = {
  note: 'Every change Otto makes pauses for you, so read what each commit seals.',
  plans: [
    {
      id: 'just-fix',
      text: `Stage only src/login.ts, commit it as "${FIX_MESSAGE}".`,
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['stage only src/login.ts', 'commit the login fix alone'],
      script: [
        {
          do: 'run',
          line: `git add ${LOGIN}`,
          predict: {
            question: 'Before Otto runs it: where does src/login.ts go?',
            // Two options that split every state: is login.ts waiting on the dock or not?
            options: [
              {
                id: 'dock',
                text: 'Onto the Loading Dock, to wait for a commit',
                outcome: { state: { kind: 'staged', paths: [LOGIN] } },
              },
              {
                id: 'vault',
                text: 'Straight into a commit in the Vault',
                outcome: { state: not({ kind: 'staged', paths: [LOGIN] }) },
              },
            ],
          },
        },
        { do: 'run', line: `git commit -m "${FIX_MESSAGE}"` },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: the login fix has a commit of its own.',
      lesson: 'Naming the file kept the other three changes off the dock. One fix, one commit.',
    },
    {
      id: 'save-all',
      text: 'Save all my work.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['save all my work', 'save everything'],
      script: [{ do: 'run', line: 'git add .' }],
      claim: 'Done: all your work is saved.',
      lesson: 'git add . loaded every crate onto the dock. Nothing was committed.',
      slip: 'overclaim',
    },
    {
      id: 'am-fix',
      text: 'Commit the login fix with commit -am, typed fix.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['commit -am the login fix', 'commit all as a fix'],
      script: [{ do: 'run', line: `git commit -am "${FIX_MESSAGE}"`, say: 'Quickest way: -am.' }],
      claim: 'Done: the login fix is committed.',
      lesson: '-am sealed every tracked edit: README, app.ts and the version bump rode along.',
      slip: 'too-broad',
    },
  ],
  fixes: [
    {
      id: 'unload-fix',
      text: 'Unload the dock, then commit only src/login.ts as fix.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['unload the dock', 'take everything off the dock'],
      // Once a commit holds the fix there is nothing left to stage, so the card is dead.
      when: not(LOGIN_AT_HEAD),
      script: [
        { do: 'run', line: 'git restore --staged .', say: 'Unloading the dock. Files stay put.' },
        { do: 'run', line: `git add ${LOGIN}` },
        { do: 'run', line: `git commit -m "${FIX_MESSAGE}"` },
      ],
      claim: 'Fixed: the login fix has a commit of its own.',
      lesson: 'restore --staged unloaded every crate and kept every edit. Then one file went back.',
    },
  ],
  hintPlan: 'just-fix',
  check: {
    question: "What does Otto's newest commit hold?",
    // Split by two questions: is the fix committed at all, and is the newest commit just
    // the fix? So exactly one holds wherever Otto stops, even after a Stop mid-card.
    options: [
      {
        id: 'alone',
        text: 'Only the login fix, typed fix:',
        truth: FIX_ALONE,
        feedback: 'git log --oneline shows the fix: commit on top, and nothing else new.',
      },
      {
        id: 'bundled',
        text: 'More than the login fix: other changes got committed too',
        truth: all(LOGIN_AT_HEAD, not(FIX_ALONE)),
        feedback: 'Other files rode along. Undoing the fix now undoes them too.',
      },
      {
        id: 'none',
        text: 'No commit holds the login fix yet',
        truth: not(LOGIN_AT_HEAD),
        feedback: 'git log ends at the scaffold. The fix still waits on the dock.',
      },
    ],
  },
  guards: [FIX_GUARD, LATER_OUT_1],
  looks: gitLooks,
} satisfies AgentTaskInput;

// Step 2: the README typo.
const DOCS_ALONE = all(changedOnly(README), headIsType('docs'));
const DOCS_GUARD: Predicate = {
  ...not(all(changed(README), README_AT_HEAD, not(DOCS_ALONE))),
  label: 'The README fix is its own docs commit',
};
const LATER_OUT_2 = labelled(
  'Dark mode and the bump stay uncommitted',
  ...DARK_MODE_OUT,
  ...BUMP_OUT,
);

/**
 * Step 2: commit the README typo as docs. The okay card leaves the type to Otto, who
 * reads "typo fix" literally and types fix:, then retypes it when Kyle denies. The weak
 * card loads everything and seals it as docs.
 */
const commitDocsTask = {
  plans: [
    {
      id: 'just-docs',
      text: `Stage only README.md, commit it as "${DOCS_MESSAGE}".`,
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['stage only README.md', 'commit the readme as docs'],
      script: [
        { do: 'run', line: `git add ${README}` },
        { do: 'run', line: `git commit -m "${DOCS_MESSAGE}"` },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: the README fix is a docs commit.',
      lesson: 'docs: tells a reviewer only words changed, so nobody hunts for a behaviour change.',
    },
    {
      id: 'type-fix',
      text: 'Commit the README typo fix on its own.',
      quality: 'okay',
      covers: ['goal', 'limits'],
      intents: ['commit the readme typo fix', 'commit the readme alone'],
      script: [
        { do: 'run', line: `git add ${README}` },
        {
          do: 'run',
          line: 'git commit -m "fix: correct install typo"',
          say: 'It fixes a typo, so it is a fix.',
          denyLine: 'Right, it only touches docs. Retyping it.',
          onDeny: [{ do: 'run', line: `git commit -m "${DOCS_MESSAGE}"` }],
        },
      ],
      claim: 'Done: the README fix is committed.',
      lesson: 'The fix: type means the code had a bug. A README typo is a docs: change.',
      slip: 'wrong-label',
    },
    {
      id: 'commit-docs',
      text: 'Commit my changes as docs.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['commit my changes as docs', 'commit everything as docs'],
      script: [
        { do: 'run', line: 'git add .' },
        { do: 'run', line: 'git commit -m "docs: update readme"' },
      ],
      claim: 'Done: your docs are committed.',
      lesson: 'git add . loaded dark mode and the bump too. The docs commit holds code.',
      slip: 'too-broad',
    },
  ],
  fixes: [
    {
      id: 'retype',
      text: 'Undo that commit, keep the edits, recommit only README.md as docs.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['retype the message', 'undo the commit and keep the edits'],
      // Only while the newest commit holds the README fix. After a deny, the newest commit
      // is step 1's good one, and undoing it would be the harm.
      when: changed(README),
      script: [
        // Not --soft: that would keep a whole bundle on the dock and reseal all of it.
        {
          do: 'run',
          line: 'git reset HEAD~1',
          say: 'Taking the commit back. Every edit stays on the Workbench.',
        },
        { do: 'run', line: `git add ${README}` },
        { do: 'run', line: `git commit -m "${DOCS_MESSAGE}"` },
      ],
      claim: 'Fixed: the README fix is a docs commit.',
      lesson: 'reset HEAD~1 took the commit back and kept every edit. Then only README.md went in.',
    },
    {
      id: 'unload-docs',
      text: 'Unload the dock, then commit only README.md as docs.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['unload the dock', 'take everything off the dock'],
      // While no commit holds the README fix: after a denied bundle, the dock is still full.
      when: not(README_AT_HEAD),
      script: [
        { do: 'run', line: 'git restore --staged .', say: 'Unloading the dock. Files stay put.' },
        { do: 'run', line: `git add ${README}` },
        { do: 'run', line: `git commit -m "${DOCS_MESSAGE}"` },
      ],
      claim: 'Fixed: the README fix is a docs commit.',
      lesson: 'restore --staged unloaded every crate and kept every edit. Then one file went back.',
    },
  ],
  hintPlan: 'just-docs',
  check: {
    question: "What does Otto's newest commit hold?",
    // Split by three questions: README in it? Alone? Typed docs? Exactly one holds.
    options: [
      {
        id: 'alone',
        text: 'Only the README fix, typed docs:',
        truth: DOCS_ALONE,
        feedback: 'git log --oneline shows the docs: commit on top.',
      },
      {
        id: 'mislabelled',
        text: 'Only the README fix, under the wrong type',
        truth: all(changedOnly(README), not(headIsType('docs'))),
        feedback: 'Read the newest line of git log --oneline: the type is not docs.',
      },
      {
        id: 'bundled',
        text: 'The README fix, plus other changes',
        truth: all(changed(README), not(changedOnly(README))),
        feedback: 'git show --stat lists every file the commit changed. Count them.',
      },
      {
        id: 'other',
        text: 'Changes that leave out the README fix',
        truth: not(changed(README)),
        feedback: 'The newest commit never touched README.md.',
      },
    ],
  },
  guards: [DOCS_GUARD, historyKeeps(2), LATER_OUT_2],
  looks: gitLooks,
} satisfies AgentTaskInput;

// Step 3: dark mode, one feature in two files.
const THEME_TRACKED: Predicate = { kind: 'tracked', paths: [THEME_PATH] };
const FEATURE_ALONE = changedOnly(APP, THEME_PATH);
const FEATURE_GUARD: Predicate = {
  ...not(all(APP_AT_HEAD, not(all(FEATURE_ALONE, headIsType('feat'))))),
  label: 'Dark mode is one feat commit, nothing else',
};
const LATER_OUT_3 = labelled('The version bump stays uncommitted', ...BUMP_OUT);

/**
 * Step 3: commit dark mode, the new theme.ts with the app.ts edit that imports it. The
 * okay card's `commit -am` skips the new file and sweeps in the version bump; the weak
 * card commits app.ts alone, importing a file no commit holds.
 */
const commitFeatureTask = {
  plans: [
    {
      id: 'name-both',
      text: `Stage theme.ts and app.ts by name, commit as "${FEAT_MESSAGE}".`,
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['stage theme.ts and app.ts', 'commit dark mode by name'],
      script: [
        { do: 'run', line: `git add ${THEME_PATH} ${APP}` },
        { do: 'run', line: `git commit -m "${FEAT_MESSAGE}"` },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: dark mode is one commit.',
      lesson: 'Naming both files took the new one and left the version bump on the Workbench.',
    },
    {
      id: 'am-feature',
      text: 'Commit dark mode with commit -am, typed feat.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['commit -am dark mode', 'commit all as feat'],
      script: [
        {
          do: 'run',
          line: `git commit -am "${FEAT_MESSAGE}"`,
          say: 'Quickest way: -am.',
          predict: {
            question: 'Before Otto runs it: does the new theme.ts go in?',
            options: [
              {
                id: 'skipped',
                text: 'No: -am skips files git has never seen',
                outcome: { state: { kind: 'untracked', paths: [THEME_PATH] } },
              },
              {
                id: 'included',
                text: 'Yes: -am takes every change',
                outcome: { state: THEME_TRACKED },
              },
            ],
          },
        },
      ],
      claim: 'Done: dark mode is committed.',
      lesson: '-am skipped the new theme.ts and swept in the version bump. Name files instead.',
      slip: 'too-broad',
    },
    {
      id: 'app-only',
      text: 'Commit the dark mode change.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['commit the dark mode change', 'commit dark mode'],
      script: [
        { do: 'run', line: `git add ${APP}` },
        { do: 'run', line: `git commit -m "${FEAT_MESSAGE}"` },
      ],
      claim: 'Done: dark mode is committed.',
      lesson: 'app.ts now imports a theme.ts no commit holds. Anyone checking it out gets a crash.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'split-feature',
      text: 'Undo that commit, keep the edits, then commit both files as feat.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['undo that commit and keep the edits', 'recommit both files'],
      // Only while the newest commit holds app.ts: after a deny, it is step 2's docs commit.
      when: changed(APP),
      script: [
        { do: 'run', line: 'git reset HEAD~1', say: 'Taking the commit back. Your edits stay.' },
        { do: 'run', line: `git add ${THEME_PATH} ${APP}` },
        { do: 'run', line: `git commit -m "${FEAT_MESSAGE}"` },
      ],
      claim: 'Fixed: dark mode is one commit.',
      lesson: 'reset HEAD~1 took the commit back and left every edit on the Workbench to restage.',
    },
  ],
  hintPlan: 'name-both',
  check: {
    question: "What does Otto's newest commit hold?",
    // Split by: is app.ts's dark mode committed, is theme.ts, and are they one clean commit?
    options: [
      {
        id: 'feature',
        text: 'Exactly theme.ts and app.ts',
        truth: FEATURE_ALONE,
        feedback: 'git log --oneline shows one feat: commit for dark mode.',
      },
      {
        id: 'no-theme',
        text: 'app.ts, but not the new theme.ts',
        truth: all(APP_AT_HEAD, not(THEME_TRACKED)),
        feedback: 'git status still lists theme.ts as untracked.',
      },
      {
        id: 'mixed',
        text: 'Both are committed, but not as one clean commit',
        truth: all(APP_AT_HEAD, THEME_TRACKED, not(FEATURE_ALONE)),
        feedback: 'git log --oneline shows dark mode spread over more than one commit.',
      },
    ],
  },
  guards: [FEATURE_GUARD, historyKeeps(3), LATER_OUT_3],
  looks: gitLooks,
} satisfies AgentTaskInput;

// Step 4: the version bump, where -am is the right tool.
const BUMP_TOGETHER = changedOnly(PACKAGE, CONFIG);

/**
 * Step 4: the version bump. Both files are tracked and nothing else is loose, so
 * `commit -am` is right. The okay card commits half the bump; the weak card's message has
 * no type, which a dry run finds harmful.
 */
const commitBumpTask = {
  plans: [
    {
      id: 'am-bump',
      text: `Check git status, then commit -am "${CHORE_MESSAGE}".`,
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['check git status then commit -am', 'commit -am the bump'],
      script: [
        { do: 'run', line: 'git status' },
        { do: 'run', line: `git commit -am "${CHORE_MESSAGE}"` },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: the version bump is one commit.',
      lesson: 'Every edit left belonged to the bump, and nothing was new. That is when -am shines.',
    },
    {
      id: 'one-file',
      text: `Commit package.json as "${CHORE_MESSAGE}".`,
      quality: 'okay',
      covers: ['goal'],
      intents: ['commit package.json', 'commit the package file'],
      script: [
        { do: 'run', line: `git add ${PACKAGE}` },
        { do: 'run', line: `git commit -m "${CHORE_MESSAGE}"` },
      ],
      claim: 'Done: the version bump is committed.',
      lesson: 'config.ts still says 1.0.0. Half the bump is committed, half is loose.',
      slip: 'overclaim',
    },
    {
      id: 'quick-bump',
      text: 'Commit the bump quickly.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['commit the bump quickly', 'just commit it'],
      script: [{ do: 'run', line: 'git commit -am "bump"' }],
      claim: 'Done: bump committed.',
      lesson: '-am was right here, but "bump" has no type. A changelog cannot sort it.',
      slip: 'wrong-label',
    },
  ],
  fixes: [
    {
      id: 'redo-bump',
      text: 'Undo that commit, keep it staged, then commit -am as chore.',
      quality: 'strong',
      covers: ['goal'],
      intents: ['undo that commit and keep it staged', 'redo the bump commit'],
      // Only while the newest commit holds the bump: after a deny, it is step 3's feature.
      when: changed(PACKAGE),
      script: [
        {
          do: 'run',
          line: 'git reset --soft HEAD~1',
          say: 'Taking the commit back. The dock stays loaded.',
        },
        { do: 'run', line: `git commit -am "${CHORE_MESSAGE}"` },
      ],
      claim: 'Fixed: the version bump is one commit.',
      lesson: 'reset --soft took the commit back. -am then sealed both files under one message.',
    },
  ],
  hintPlan: 'am-bump',
  check: {
    question: "What does Otto's newest commit hold?",
    options: [
      {
        id: 'both',
        text: 'Both files, under a typed message',
        truth: all(BUMP_TOGETHER, TYPED),
        feedback: 'git log --oneline shows one chore: commit with both files.',
      },
      {
        id: 'untyped',
        text: 'Both files, but the message has no type',
        truth: all(BUMP_TOGETHER, not(TYPED)),
        feedback: 'Read the newest line of git log --oneline: no type before the colon.',
      },
      {
        id: 'half',
        text: 'Not exactly the two bump files',
        truth: not(BUMP_TOGETHER),
        feedback:
          'git status still lists a bump file, or the commit holds files from another change.',
      },
    ],
  },
  guards: [TYPED, historyKeeps(4)],
  looks: gitLooks,
} satisfies AgentTaskInput;

/**
 * Judgment drills on git scenes. The ids are the typed drills' ids, so the placement test
 * and any saved review history still find them. The engine works out each key.
 */
const drills = [
  {
    kind: 'fix',
    id: 'commits-type-fix',
    prompt: 'The staged change fixes a rounding bug. Which commit should Otto make?',
    concept: 'conventional-commits',
    setup: repo()
      .commit('feat: add cart total', { 'src/cart.ts': CART_V1 })
      .write('src/cart.ts', CART_ROUNDED)
      .stage('src/cart.ts')
      .toSpec(),
    goal: all({ kind: 'fileAtHead', path: 'src/cart.ts', equals: CART_ROUNDED }, headIsType('fix')),
    options: [
      {
        id: 'fix-type',
        text: 'git commit -m "fix: round cart totals to the cent"',
        script: [{ do: 'run', line: 'git commit -m "fix: round cart totals to the cent"' }],
      },
      {
        id: 'feat-type',
        text: 'git commit -m "feat: round cart totals"',
        script: [{ do: 'run', line: 'git commit -m "feat: round cart totals"' }],
      },
      {
        id: 'no-type',
        text: 'git commit -m "round cart totals"',
        script: [{ do: 'run', line: 'git commit -m "round cart totals"' }],
      },
    ],
    explain: 'A bug fix is typed fix:. feat: would tell the changelog a new feature shipped.',
  },
  {
    kind: 'diagnose',
    id: 'commits-scope',
    prompt: "Otto says the message follows the team's format. Is he right?",
    concept: 'conventional-commits',
    setup: repo()
      .commit('chore: scaffold app', { 'README.md': README_TYPO })
      .write(README, README_FIXED)
      .stage(README)
      .toSpec(),
    history: [{ do: 'run', line: 'git commit -m "docs(readme): fix install command"' }],
    claim: 'Done: committed as docs, scoped to readme.',
    options: [
      {
        id: 'right',
        text: 'Yes: type, scope in brackets, colon, then a summary',
        truth: { kind: 'headMessage', pattern: '^docs\\(readme\\): \\S' },
      },
      {
        id: 'no-scope',
        text: 'No: Conventional Commits have no brackets',
        truth: not(TYPED),
      },
      {
        id: 'not-saved',
        text: 'No: the fix never reached a commit',
        truth: not(README_AT_HEAD),
      },
    ],
    explain: 'type(scope): summary is valid. The scope names the part of the project it touches.',
  },
  {
    kind: 'fix',
    id: 'commits-split-two',
    prompt: 'Two unrelated edits: a README typo and an API timeout. Which plan commits them right?',
    concept: 'atomic-commits',
    setup: repo()
      .commit('chore: scaffold app', { 'README.md': README_TYPO, 'src/api.ts': API_V1 })
      .modify(README, README_FIXED)
      .modify('src/api.ts', API_V2)
      .toSpec(),
    goal: all(
      {
        kind: 'any',
        label: 'Two commits, one change each',
        of: [
          all(changedOnly(README), parentChangedOnly('src/api.ts')),
          all(changedOnly('src/api.ts'), parentChangedOnly(README)),
        ],
      },
      {
        kind: 'allMessagesMatch',
        pattern: CONVENTIONAL_PATTERN,
        last: 2,
        label: 'Both messages start with a type',
      },
    ),
    options: [
      {
        id: 'two-commits',
        text: 'Add and commit README.md as docs, then src/api.ts as fix',
        script: [
          { do: 'run', line: `git add ${README}` },
          { do: 'run', line: 'git commit -m "docs: fix install typo"' },
          { do: 'run', line: 'git add src/api.ts' },
          { do: 'run', line: 'git commit -m "fix: raise api timeout"' },
        ],
      },
      {
        id: 'one-am',
        text: 'git commit -am "fix: readme typo and api timeout"',
        script: [{ do: 'run', line: 'git commit -am "fix: readme typo and api timeout"' }],
      },
      {
        id: 'add-all',
        text: 'git add . then git commit -m "docs: fix readme and timeout"',
        script: [
          { do: 'run', line: 'git add .' },
          { do: 'run', line: 'git commit -m "docs: fix readme and timeout"' },
        ],
      },
    ],
    explain: 'One idea per commit: each one can be reviewed, and reverted, on its own.',
  },
  {
    kind: 'approve',
    id: 'commits-leave-debug',
    prompt: 'Otto wants to commit the search feature. Allow?',
    concept: 'atomic-commits',
    setup: repo()
      .commit('chore: scaffold app', { 'src/search.ts': SEARCH_V1, 'src/config.ts': DEBUG_OFF })
      .modify('src/search.ts', SEARCH_V2)
      .modify(CONFIG, DEBUG_ON)
      .toSpec(),
    action: {
      do: 'run',
      line: 'git commit -am "feat: split search terms"',
      say: 'Committing the search feature.',
    },
    guards: [
      {
        ...not({ kind: 'fileAtHead', path: CONFIG, contains: 'true' }),
        label: 'The DEBUG flag stays out of commits',
      },
    ],
    explain:
      '-am sweeps every tracked edit, so DEBUG = true would ship. Stage src/search.ts by name.',
  },
  {
    kind: 'approve',
    id: 'commits-am-tracked',
    prompt: 'Both tracked edits are one version bump. Otto wants to run this. Allow?',
    concept: 'commit-am',
    setup: repo()
      .commit('chore: scaffold app', { 'package.json': PACKAGE_V1, 'src/config.ts': CONFIG_V1 })
      .modify(PACKAGE, PACKAGE_V2)
      .modify(CONFIG, CONFIG_V2)
      .toSpec(),
    action: {
      do: 'run',
      line: `git commit -am "${CHORE_MESSAGE}"`,
      say: 'Both edits are the bump.',
    },
    guards: [TYPED, { kind: 'workingFile', path: CONFIG, contains: '1.1.0' }],
    explain: 'Every edit belongs to the bump and nothing is new, so -am is safe and quick.',
  },
  {
    kind: 'predict',
    id: 'commits-am-trap',
    prompt: 'Otto is about to run this for dark mode. What does the commit hold?',
    concept: 'commit-am',
    setup: repo()
      .commit('chore: scaffold app', { 'src/app.ts': APP_V1 })
      .modify(APP, APP_THEMED)
      .untracked(THEME_PATH, THEME)
      .toSpec(),
    action: { do: 'run', line: `git commit -am "${FEAT_MESSAGE}"` },
    options: [
      {
        id: 'app-only',
        text: 'Only src/app.ts',
        outcome: { state: changedOnly(APP) },
      },
      {
        id: 'both',
        text: 'src/app.ts and the new src/theme.ts',
        outcome: { state: FEATURE_ALONE },
      },
      { id: 'nothing', text: 'Nothing: it fails', outcome: { result: 'error' } },
    ],
    explain: '-a only takes files git already tracks. The new theme.ts stays loose.',
  },
] satisfies JudgmentDrillInput[];

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
      'Otto loves git commit -am. It grabs every tracked edit and skips new files.',
    ],
    diagram: 'atomic-commits',
  },
  initialRepoState: workbench().toSpec(),
  approvals: 'changes',
  steps: [
    {
      id: 'commit-fix',
      instruction:
        'Four unrelated changes sit on the Workbench. Get the login fix into its own fix: commit.',
      success: labelled(
        'One fix commit holds just src/login.ts',
        changedOnly(LOGIN),
        headIsType('fix'),
      ),
      hints: [
        'If this fix ever needs undoing, what would you want tangled up with it?',
        'An atomic commit holds one change. Only crates on the Loading Dock get sealed.',
        'Pick the card that stages only src/login.ts.',
      ],
      agent: commitFixTask,
    },
    {
      id: 'commit-docs',
      instruction: 'Next, the README typo. Get it into a commit of its own, typed docs.',
      success: labelled(
        'One docs commit holds just README.md',
        changedOnly(README),
        headIsType('docs'),
      ),
      hints: [
        'Which Conventional Commit type fits a change that only touches documentation?',
        'docs: marks documentation-only changes. fix: means the code had a bug.',
        'Pick the card that names README.md and the docs: type.',
      ],
      agent: commitDocsTask,
    },
    {
      id: 'commit-feature',
      instruction:
        'Dark mode is one feature in two files: the new src/theme.ts and src/app.ts. Commit them together.',
      success: labelled(
        'One feat commit holds exactly dark mode',
        FEATURE_ALONE,
        headIsType('feat'),
      ),
      hints: [
        'Which of these files has git never seen before?',
        'commit -a only takes tracked files, and takes every one of them. Name files instead.',
        'Pick the card that stages both files by name.',
      ],
      xp: 20,
      agent: commitFeatureTask,
    },
    {
      id: 'commit-am',
      instruction:
        'Only the version bump is left: package.json and src/config.ts, both tracked. Commit it in one go.',
      success: labelled(
        'One typed commit holds the whole bump',
        { kind: 'clean' },
        BUMP_TOGETHER,
        TYPED,
      ),
      hints: [
        'Is anything left on the Workbench that is new, or unrelated to the bump?',
        'commit -am is safe when every tracked edit belongs in the commit and nothing is new.',
        'Pick the card that checks git status, then uses -am.',
      ],
      agent: commitBumpTask,
    },
  ],
  drills,
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
