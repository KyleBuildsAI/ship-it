import { repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from '../../game/missions/agentSchema';
import type { Predicate } from '../../game/missions/predicates';
import type { JudgmentDrillInput, MissionInput } from '../../game/missions/schema';
import { headIsType } from './shared';

/**
 * Mission 2.4: the blocklist sign, directed. .gitignore patterns, untracking a file git
 * already knows with `git rm --cached`, and keeping secrets out while sharing their names.
 *
 * Kyle directs Otto instead of typing. Otto's slips are the real ones: `git add .` sweeps
 * build output into a commit, plain `git rm` deletes .env from disk, an ignore rule is
 * trusted to untrack a file git already has, and .env is copied, values and all, into the
 * example teammates share. Nothing here says which answer is right: gates come from dry
 * runs against the guards, checks and drills from git predicates.
 *
 * Every "secret" here is an obvious placeholder. gitleaks scans this repository in CI,
 * and realistic-looking keys would fail the build (and teach the wrong habit).
 */

const ENV = 'API_KEY=dev-only\nDATABASE_URL=postgres://localhost/dev\n';
const PACKAGE = '{\n  "name": "quillwork-notes",\n  "version": "1.0.0"\n}\n';
const README = '# Quillwork Notes\n\nCopy .env.example to .env and fill in your own values.\n';
const APP = "export function start(): void {\n  document.title = 'Quillwork Notes';\n}\n";
const BUNDLE = '(()=>{document.title="Quillwork Notes"})();\n';
const DIST_HTML = '<!doctype html>\n<script src="app.js"></script>\n';
const LOG_LINE = '[12:00:01] server started on port 3000\n';

/** The ignore list each step ends with on the reference path. */
const NOISE_RULES = 'dist/\n*.log\n';
const ALL_RULES = 'dist/\n*.log\n.env\n';
/** Names only: what a teammate copies to .env and fills in with their own values. */
const EXAMPLE = 'API_KEY=\nDATABASE_URL=\n';

const DIST = ['dist/index.html', 'dist/app.js'];
const LOGS = ['debug.log', 'server/logs/error.log'];

// ---- What the checks and guards ask -----------------------------------------------------

const envOnDisk: Predicate = {
  kind: 'workingFile',
  path: '.env',
  label: '.env stays on your disk',
};
const distIgnored: Predicate = {
  kind: 'ignored',
  paths: DIST,
  label: 'Everything in dist/ is ignored',
};
const logsIgnored: Predicate = {
  kind: 'ignored',
  paths: LOGS,
  label: 'Every .log file is ignored',
};
const noiseIgnored: Predicate = { kind: 'all', of: [distIgnored, logsIgnored] };
/** Any piece of the noise sealed in the last commit, where every clone would get it. */
const noiseCommitted: Predicate = {
  kind: 'any',
  of: [...DIST, ...LOGS].map((path): Predicate => ({ kind: 'tracked', paths: [path] })),
};
/** .env is off the dock and hidden: only an untracked file on disk can be ignored. */
const envIgnored: Predicate = { kind: 'ignored', paths: ['.env'] };
const exampleCommitted: Predicate = { kind: 'tracked', paths: ['.env.example'] };
/** Either real value from .env, sealed into the shared example. */
const valuesLeaked: Predicate = {
  kind: 'any',
  of: [
    { kind: 'fileAtHead', path: '.env.example', contains: 'dev-only' },
    { kind: 'fileAtHead', path: '.env.example', contains: 'localhost' },
  ],
};

/** Read-only lines Kyle can have Otto run while he checks a claim. */
const gitLooks = [
  { id: 'status', label: "What's on the dock?", line: 'git status' },
  { id: 'log', label: "What's in the Vault?", line: 'git log --oneline' },
  { id: 'staged', label: 'What will commit?', line: 'git diff --staged' },
];

// ---- Step 1: hide the build output and the logs ------------------------------------------

/**
 * The weak card makes git status quiet the wrong way: `git add .` commits the noise. The
 * okay card names one log file instead of a pattern, so a log in another folder still
 * shows. The fix re-reads the ignore list the usual way: empty the dock with
 * `git rm -r --cached .`, then `git add .` loads everything the new rules allow.
 */
const ignoreNoiseTask = {
  plans: [
    {
      id: 'quiet-status',
      text: 'Make git status clean.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['make git status clean', 'clean up git status'],
      script: [
        { do: 'run', line: 'git add .', say: 'Tidying up git status.' },
        { do: 'run', line: 'git commit -m "chore: clean up"' },
      ],
      claim: 'Done: git status is clean.',
      lesson: 'Clean, by committing the noise. Build output and logs are in the Vault now.',
      slip: 'too-broad',
    },
    {
      id: 'ignore-rules',
      text: 'Ignore dist/ and every *.log file, commit .gitignore, show git status.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['ignore dist and every log', 'add a gitignore for dist and logs'],
      script: [
        { do: 'write', path: '.gitignore', content: NOISE_RULES, say: 'Writing the ignore list.' },
        { do: 'run', line: 'git add .gitignore' },
        { do: 'run', line: 'git commit -m "chore: ignore build output and logs"' },
        {
          do: 'run',
          line: 'git status',
          predict: {
            question: 'Before Otto runs it: does git status still list dist/ and the logs?',
            // Split by one question, so exactly one holds wherever Otto gets to.
            options: [
              { id: 'hidden', text: 'No: the rules hide them', outcome: { state: noiseIgnored } },
              {
                id: 'listed',
                text: 'Yes: they still show',
                outcome: { state: { kind: 'not', predicate: noiseIgnored } },
              },
            ],
          },
        },
      ],
      claim: 'Done: dist/ and every log are ignored.',
      lesson: 'dist/ hides a whole folder, and *.log hides logs in every folder.',
    },
    {
      id: 'ignore-debug',
      text: 'Ignore dist/ and debug.log, then commit .gitignore.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['ignore dist and debug.log', 'ignore debug.log'],
      script: [
        { do: 'write', path: '.gitignore', content: 'dist/\ndebug.log\n' },
        { do: 'run', line: 'git add .gitignore' },
        { do: 'run', line: 'git commit -m "chore: ignore build output"' },
      ],
      claim: 'Done: all the noise is ignored.',
      lesson:
        'debug.log names one file, so server/logs/error.log still shows. *.log covers them all.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'reload-dock',
      text: 'Untrack everything, re-add it under dist/ and *.log rules, commit.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['untrack everything and re-add', 'git rm -r --cached'],
      script: [
        { do: 'run', line: 'git rm -r --cached .', say: 'Emptying the dock. Files stay put.' },
        { do: 'write', path: '.gitignore', content: NOISE_RULES },
        { do: 'run', line: 'git add .' },
        { do: 'run', line: 'git commit -m "chore: stop tracking build output and logs"' },
      ],
      claim: 'Fixed: dist/ and the logs are untracked and ignored.',
      // True on both paths it fixes: after quiet-status the noise was tracked, after
      // ignore-debug only the *.log rule was missing.
      lesson:
        '*.log catches logs in every folder. Rules skip tracked files, so emptying the dock untracks any already committed.',
    },
  ],
  hintPlan: 'ignore-rules',
  check: {
    question: 'Where are dist/ and the logs now?',
    // Split by two questions: is any of it in the last commit, and is all of it hidden?
    options: [
      {
        id: 'hidden',
        // "Not in the last commit", not "never committed": after quiet-status, an older
        // commit still holds them, and step 3 teaches that history keeps what it got.
        text: 'Hidden from git, not in the last commit',
        truth: { kind: 'all', of: [{ kind: 'not', predicate: noiseCommitted }, noiseIgnored] },
        feedback: 'git status lists none of them, and the last commit holds none of them.',
      },
      {
        id: 'committed',
        text: 'Sealed in the last commit',
        truth: noiseCommitted,
        feedback: 'git log shows the commit that took them. Every clone gets them now.',
      },
      {
        id: 'some-show',
        text: 'Some still show in git status',
        truth: {
          kind: 'all',
          of: [
            { kind: 'not', predicate: noiseCommitted },
            { kind: 'not', predicate: noiseIgnored },
          ],
        },
        feedback: 'A rule only hides what it matches. Read git status for what slipped through.',
      },
    ],
  },
  guards: [envOnDisk],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Step 2: untrack .env, keep it, ignore it --------------------------------------------

/**
 * The approval this mission is about. The strong card asks before `git rm --cached .env`
 * (it only takes .env off the dock, so it would not pause on its own) and Kyle allows it.
 * The weak card's plain `git rm .env` pauses because it deletes the file, and a dry run
 * finds it harmful: .env must stay on disk. The okay card trusts the ignore rule alone,
 * which does nothing for a file git already tracks.
 */
const untrackEnvTask = {
  plans: [
    {
      id: 'git-rm',
      text: 'Get .env out of git.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['get env out of git', 'remove env from git'],
      script: [
        { do: 'run', line: 'git rm .env', say: 'Removing .env from git.' },
        { do: 'run', line: 'git commit -m "chore: remove .env"' },
      ],
      claim: 'Done: .env is out of git.',
      lesson: 'Plain git rm deleted .env from your disk too. Your local settings are gone.',
      slip: 'big-hammer',
    },
    {
      id: 'rm-cached',
      text: 'Untrack .env with git rm --cached, keep the file, then ignore it.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['git rm --cached .env', 'untrack env and keep the file'],
      script: [
        {
          do: 'run',
          line: 'git rm --cached .env',
          ask: true,
          say: 'Untracking .env. The file stays on disk.',
          predict: {
            question: 'Before Otto runs it: where does .env end up?',
            options: [
              { id: 'on-disk', text: 'Still on your disk', outcome: { state: envOnDisk } },
              {
                id: 'deleted',
                text: 'Deleted from your disk',
                outcome: { state: { kind: 'not', predicate: envOnDisk } },
              },
            ],
          },
        },
        { do: 'write', path: '.gitignore', content: ALL_RULES, say: 'Adding .env to the list.' },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: .env is untracked, ignored, and still on disk.',
      lesson: '--cached only touches the dock. The file stayed, and the rule keeps it out.',
    },
    {
      id: 'rule-only',
      text: 'Add .env to .gitignore.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['add env to gitignore', 'ignore env'],
      script: [
        { do: 'write', path: '.gitignore', content: ALL_RULES },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: .env is ignored now.',
      lesson: 'Ignore rules skip files git already tracks. .env still rides in every commit.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'untrack-now',
      text: 'Now untrack .env with git rm --cached. Keep the file.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['now untrack env', 'rm --cached env'],
      script: [
        { do: 'run', line: 'git rm --cached .env', ask: true },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Fixed: .env is untracked and ignored.',
      lesson: 'With .env off the dock, the rule you already have hides it.',
    },
  ],
  hintPlan: 'rm-cached',
  check: {
    question: 'Where is .env now?',
    // Split by two questions: is it on disk, and is it hidden from git?
    options: [
      {
        id: 'safe',
        text: 'On your disk, hidden from git',
        truth: envIgnored,
        // Step 2 doesn't commit, so git status still shows .env: as a staged deletion.
        feedback:
          'git status lists .env only as a removal for the next commit. The file is still there.',
      },
      {
        id: 'exposed',
        text: 'On your disk, and git still tracks it',
        truth: { kind: 'all', of: [envOnDisk, { kind: 'not', predicate: envIgnored }] },
        feedback: 'An ignore rule skips files git already has. Untrack it first.',
      },
      {
        id: 'deleted',
        text: 'Deleted from your disk',
        truth: { kind: 'not', predicate: envOnDisk },
        feedback: 'Plain git rm deletes the file. --cached would have kept it.',
      },
    ],
  },
  guards: [envOnDisk],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Step 3: share the names, commit the cleanup -----------------------------------------

/**
 * The weak card copies .env, values and all, into the example and commits it: the leak
 * the whole mission guards against. The okay card commits the cleanup but leaves
 * teammates no example. The fix writes names only, and its lesson says what a blank file
 * can't undo: the old commit still holds the values.
 */
const commitCleanupTask = {
  plans: [
    {
      id: 'copy-env',
      text: 'Share our settings with the team.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['share our settings', 'share the env'],
      script: [
        // Otto's file tool, filled from the .env he just read: a copy, values and all.
        { do: 'write', path: '.env.example', content: ENV, say: 'Copying .env for the team.' },
        { do: 'run', line: 'git add .env.example' },
        { do: 'run', line: 'git commit -m "chore: share settings"' },
      ],
      claim: 'Done: teammates have every setting.',
      lesson: 'The copy carried your real values. They are in the Vault now, for every clone.',
      slip: 'leak',
    },
    {
      id: 'names-only',
      text: 'Add .env.example with names only, then commit it all as chore.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['env example with names only', 'commit the cleanup'],
      script: [
        { do: 'write', path: '.env.example', content: EXAMPLE, say: 'Names only, no values.' },
        { do: 'run', line: 'git add .gitignore .env.example' },
        { do: 'run', line: 'git commit -m "chore: keep secrets out of git"' },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: names shared, .env untracked and still on disk.',
      lesson: 'Teammates copy .env.example and fill in their own values. Yours never leave.',
    },
    {
      id: 'add-all',
      text: 'Commit the cleanup with git add ., as chore.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['commit with git add .', 'commit everything'],
      script: [
        { do: 'run', line: 'git add .' },
        { do: 'run', line: 'git commit -m "chore: keep secrets out of git"' },
      ],
      claim: 'Done: cleanup committed.',
      lesson: 'The rule kept .env out of git add ., but teammates got no .env.example.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'blank-example',
      text: 'Write .env.example with empty values, commit it and .gitignore.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['blank the example values', 'empty values in env example'],
      script: [
        { do: 'write', path: '.env.example', content: EXAMPLE },
        { do: 'run', line: 'git add .gitignore .env.example' },
        { do: 'run', line: 'git commit -m "chore: share setting names only"' },
      ],
      claim: 'Fixed: .env.example lists names only.',
      lesson: 'Names only now. A value that ever reached the Vault stays in history: rotate it.',
    },
  ],
  hintPlan: 'names-only',
  check: {
    question: "What does .env.example in Otto's last commit share?",
    // Split by two questions: is there a committed example, and does it hold a value?
    options: [
      {
        id: 'names',
        text: 'Setting names, no values',
        truth: { kind: 'all', of: [exampleCommitted, { kind: 'not', predicate: valuesLeaked }] },
        feedback: "Otto's write decides it: a copy of .env carries its values, names alone don't.",
      },
      {
        id: 'values',
        text: 'Your real values',
        truth: valuesLeaked,
        feedback: 'The copy carried dev-only and the database address into the Vault.',
      },
      {
        id: 'none',
        text: 'Nothing: no .env.example was committed',
        truth: { kind: 'not', predicate: exampleCommitted },
        feedback: 'git log shows the commit, but .env.example never reached the dock.',
      },
    ],
  },
  guards: [envOnDisk],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Judgment drills ---------------------------------------------------------------------

/** A project that committed .env on day one, the mistake the drills start from. */
const envCommitted = () => repo().commit('chore: scaffold app', { 'src/app.ts': APP, '.env': ENV });

/**
 * One of each kind, two approves (deny and allow) and a second diagnose. The engine works
 * out every key by running the drill: plain git rm breaks ".env stays on your disk",
 * `git rm --cached` doesn't.
 */
const ignoreDrills = [
  {
    kind: 'approve',
    id: 'ignore-approve-git-rm',
    prompt: '.env was committed by mistake. Otto wants to fix it. Allow?',
    concept: 'rm-cached',
    setup: envCommitted().toSpec(),
    action: { do: 'run', line: 'git rm .env', say: 'Removing .env from git.' },
    guards: [envOnDisk],
    explain: 'Plain git rm deletes the file from disk too. git rm --cached only untracks it.',
  },
  {
    kind: 'approve',
    id: 'ignore-approve-rm-cached',
    prompt: '.env was committed by mistake. Otto wants to fix it. Allow?',
    concept: 'rm-cached',
    setup: envCommitted().toSpec(),
    action: { do: 'run', line: 'git rm --cached .env', say: 'Untracking .env, keeping the file.' },
    guards: [envOnDisk],
    explain: '--cached takes .env off the dock only. The file stays on your disk.',
  },
  {
    kind: 'predict',
    id: 'ignore-negate',
    prompt: '.gitignore says .env* and then !.env.example. Otto runs this. What gets staged?',
    concept: 'gitignore',
    setup: repo()
      .commit('chore: ignore env files', {
        'src/app.ts': APP,
        '.gitignore': '.env*\n!.env.example\n',
      })
      .untracked('.env', ENV)
      .untracked('.env.local', ENV)
      .untracked('.env.example', EXAMPLE)
      .toSpec(),
    action: { do: 'run', line: 'git add .' },
    options: [
      {
        id: 'example-only',
        text: 'Only .env.example',
        outcome: { state: { kind: 'staged', paths: ['.env.example'], exact: true } },
      },
      {
        id: 'all-three',
        text: 'All three .env files',
        outcome: { state: { kind: 'staged', paths: ['.env', '.env.local', '.env.example'] } },
      },
      {
        id: 'none',
        text: 'None: .env* hides all three',
        outcome: { state: { kind: 'notStaged', paths: ['.env', '.env.local', '.env.example'] } },
      },
    ],
    explain: '.env* hides every .env file, then ! brings .env.example back. Later rules win.',
  },
  {
    kind: 'diagnose',
    id: 'ignore-diagnose-rule',
    prompt: 'Otto added a rule for the committed .env. Is he right?',
    concept: 'gitignore',
    setup: envCommitted().toSpec(),
    history: [{ do: 'write', path: '.gitignore', content: '.env\n' }],
    claim: 'Done: .env is ignored now.',
    options: [
      {
        id: 'still-tracked',
        text: 'No: git still tracks .env',
        truth: { kind: 'tracked', paths: ['.env'] },
      },
      { id: 'ignored', text: 'Yes: git ignores it now', truth: envIgnored },
      {
        id: 'deleted',
        text: 'No: the rule deleted .env',
        truth: { kind: 'not', predicate: envOnDisk },
      },
    ],
    explain: 'A rule only hides untracked files. .env stays tracked until git rm --cached.',
  },
  {
    kind: 'diagnose',
    id: 'ignore-diagnose-leak',
    prompt: 'Otto shared the settings with the team. Is he right?',
    concept: 'secrets',
    setup: repo()
      .commit('chore: ignore env', { 'src/app.ts': APP, '.gitignore': '.env\n' })
      .untracked('.env', ENV)
      .toSpec(),
    history: [
      { do: 'write', path: '.env.example', content: ENV },
      { do: 'run', line: 'git add .env.example' },
      { do: 'run', line: 'git commit -m "chore: share settings"' },
    ],
    claim: 'Done: teammates can copy .env.example.',
    options: [
      { id: 'leaked', text: 'No: it holds your real values', truth: valuesLeaked },
      {
        id: 'names',
        text: 'Yes: it lists names only',
        truth: { kind: 'all', of: [exampleCommitted, { kind: 'not', predicate: valuesLeaked }] },
      },
      {
        id: 'env-committed',
        text: 'No: .env itself was committed',
        truth: { kind: 'tracked', paths: ['.env'] },
      },
    ],
    explain: 'A copy of .env carries its values. An example needs the names with nothing after.',
  },
  {
    kind: 'fix',
    id: 'ignore-tracked-dist',
    prompt: 'dist/ was committed before anyone ignored it. Which fix is right?',
    concept: 'rm-cached',
    setup: repo()
      .commit('chore: scaffold app', {
        'src/app.ts': APP,
        'dist/app.js': BUNDLE,
        'dist/index.html': DIST_HTML,
      })
      .toSpec(),
    goal: {
      kind: 'all',
      of: [
        { kind: 'notTracked', paths: DIST },
        { kind: 'ignored', paths: DIST },
      ],
    },
    failIf: [{ kind: 'workingFile', path: 'dist/app.js', exists: false }],
    options: [
      {
        id: 'rm-cached',
        text: 'git rm -r --cached dist, ignore dist/, commit',
        script: [
          { do: 'run', line: 'git rm -r --cached dist' },
          { do: 'write', path: '.gitignore', content: 'dist/\n' },
          { do: 'run', line: 'git add .gitignore' },
          { do: 'run', line: 'git commit -m "chore: stop tracking dist"' },
        ],
      },
      {
        id: 'rule-only',
        text: 'Ignore dist/ and commit the rule',
        script: [
          { do: 'write', path: '.gitignore', content: 'dist/\n' },
          { do: 'run', line: 'git add .gitignore' },
          { do: 'run', line: 'git commit -m "chore: ignore dist"' },
        ],
      },
      {
        id: 'git-rm',
        text: 'git rm -r dist, ignore dist/, commit',
        script: [
          { do: 'run', line: 'git rm -r dist' },
          { do: 'write', path: '.gitignore', content: 'dist/\n' },
          { do: 'run', line: 'git add .gitignore' },
          { do: 'run', line: 'git commit -m "chore: drop dist"' },
        ],
      },
    ],
    explain: '--cached untracks dist/ and keeps the files, so the rule can hide them.',
  },
] satisfies JudgmentDrillInput[];

export const ignoreList: MissionInput = {
  id: 'ignore-list',
  act: 2,
  title: 'The Ignore List',
  xp: 140,
  briefing: {
    sceneId: 'ignore-list',
    captions: [
      'Some crates should never reach the Vault: build output, logs, and secrets.',
      'A .gitignore file is the blocklist sign. Ignored crates grey out and cannot be staged.',
      'But the sign only stops new crates. A secret already in the Vault must be untracked first.',
    ],
    diagram: 'blocklist-sign',
  },
  initialRepoState: repo()
    .commit('chore: scaffold notes app', {
      'package.json': PACKAGE,
      'README.md': README,
      'src/app.ts': APP,
      // The mistake this mission cleans up: secrets committed on day one.
      '.env': ENV,
    })
    .untracked('dist/index.html', DIST_HTML)
    .untracked('dist/app.js', BUNDLE)
    .untracked('debug.log', LOG_LINE)
    .untracked('server/logs/error.log', LOG_LINE)
    .toSpec(),
  // Pauses only where something is lost: a deleted file, edits git no longer holds, or
  // dropped commits. Rewriting a committed .gitignore loses nothing, so it doesn't pause.
  // The one untrack that matters asks on purpose, so Kyle approves it knowingly.
  approvals: 'destructive',
  steps: [
    {
      id: 'ignore-noise',
      instruction:
        'git status is noisy: dist/ is build output, and .log files pile up. Keep them all out of git.',
      success: { kind: 'all', of: [distIgnored, logsIgnored] },
      hints: [
        'Should build output and logs ever reach the Vault?',
        'A .gitignore lists patterns. dist/ hides a folder, and *.log hides logs in every folder.',
        'Pick the card that ignores dist/ and every *.log file.',
      ],
      agent: ignoreNoiseTask,
    },
    {
      id: 'untrack-env',
      instruction:
        '.env holds secrets, and it was committed on day one. Get it out of git, but keep it on disk.',
      success: { ...envIgnored, label: '.env is untracked, ignored, and on disk' },
      hints: [
        'Does an ignore rule stop git tracking a file it already has?',
        'git rm --cached takes a file off the dock but leaves it on disk. Plain git rm deletes it.',
        'Pick the card that untracks .env with git rm --cached.',
      ],
      xp: 20,
      agent: untrackEnvTask,
    },
    {
      id: 'commit-cleanup',
      instruction:
        'Commit the cleanup, with a .env.example that tells teammates the setting names but not your values.',
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['.env'], label: '.env is out of the last commit' },
          { ...envOnDisk, label: '.env is still on your disk' },
          {
            kind: 'all',
            label: '.env.example lists both setting names',
            of: [
              { kind: 'fileAtHead', path: '.env.example', contains: 'API_KEY' },
              { kind: 'fileAtHead', path: '.env.example', contains: 'DATABASE_URL' },
            ],
          },
          { kind: 'not', predicate: valuesLeaked, label: 'No real values in .env.example' },
          {
            kind: 'all',
            label: 'The ignore rules are committed',
            of: [{ kind: 'tracked', paths: ['.gitignore'] }, noiseIgnored, envIgnored],
          },
          { kind: 'clean', label: 'Nothing left uncommitted' },
          headIsType('chore'),
        ],
      },
      hints: [
        'How do teammates learn which settings exist, without seeing your values?',
        'A .env.example lists the names with empty values. Commit it with the rule and the removal.',
        'Pick the card that writes .env.example with names only.',
      ],
      agent: commitCleanupTask,
    },
  ],
  drills: ignoreDrills,
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Our API key is on GitHub?',
      body: 'A customer emailed saying they found our API key in our public repo. Can you just delete it? Kind of urgent.',
    },
    candidates: [
      {
        id: 'rotated-yet',
        text: 'Has the key been revoked or rotated yet? Deleting the file does not remove it from git history.',
        quality: 'strong',
        rationale:
          'Anyone may have copied it already, so a new key is the real fix and cleanup comes second.',
      },
      {
        id: 'how-long',
        text: 'How long has the repo been public with the key in it?',
        quality: 'strong',
        rationale: 'Tells you how far back to check the key for misuse.',
      },
      {
        id: 'other-secrets',
        text: 'Could other secrets be committed too, like a .env file or a config with passwords?',
        quality: 'strong',
        rationale:
          'One leaked secret often means more, so check the whole history, not just one file.',
      },
      {
        id: 'key-owner',
        text: 'Who owns the account for that key and can issue a new one?',
        quality: 'okay',
        rationale: 'Needed to act, but first confirm what leaked and whether it is still live.',
      },
      {
        id: 'tell-anyone',
        text: 'Do we need to tell customers or a security contact?',
        quality: 'okay',
        rationale: 'Important soon, but stopping the leak comes first.',
      },
      {
        id: 'just-delete',
        text: 'Can I delete the file and push, so it is gone?',
        quality: 'weak',
        rationale: "The key stays in history and in everyone's clone, so rotate it first.",
      },
      {
        id: 'go-private',
        text: 'Should I make the repo private so nobody can see it?',
        quality: 'weak',
        rationale: 'Too late for anyone who already saw it, and the key must still be replaced.',
      },
      {
        id: 'who-did-it',
        text: 'Who committed the key?',
        quality: 'weak',
        rationale:
          'Blame does not stop the leak; better habits like .gitignore and secret scanning do.',
      },
    ],
    rubric:
      'A strong question makes sure the exposed key is revoked or rotated first, and asks how long it was exposed or whether other secrets leaked with it.',
  },
};
