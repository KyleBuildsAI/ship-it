import { repo, type FixtureBuilder } from '../../engine/fixtures';
import type { AgentTaskInput } from './agentSchema';
import type { Predicate } from './predicates';
import { sampleMissionInput } from './sample.test-mission';
import {
  ActSchema,
  MissionSchema,
  type JudgmentDrillInput,
  type Mission,
  type MissionInput,
} from './schema';

/*
 * A directed mission on a git project, used only by tests: the groundwork for directing
 * Act 2. Otto runs git through the same shell Kyle would type in, so the Git World moves
 * its crates for his lines exactly as it does for typed ones. Nothing here says which
 * answer is right: gates come from dry runs (git reset --hard pauses and is harmful, git
 * rm pauses and is safe), checks from git predicates, and drill keys from running each
 * drill's scene. Content authors can copy its shape for real Act 2 missions.
 */

const EDITED_APP = "console.log('hello, team');\n";

/**
 * Two commits in the Vault, an unsaved edit to app.ts on the Workbench, and a notes file
 * git has never seen. The edit is the work Otto must not throw away.
 */
const project = (): FixtureBuilder =>
  repo()
    .commit('feat: add app', { 'app.ts': "console.log('hello');\n" })
    .commit('feat: add login', { 'login.ts': 'export const login = true;\n' })
    .write('app.ts', EDITED_APP)
    .write('notes.txt', 'ask about the login page\n');

/** The edit survives on the Workbench: what reset --hard would throw away. */
const editSurvives: Predicate = {
  kind: 'workingFile',
  path: 'app.ts',
  contains: 'team',
  label: 'Your app.ts edit survives',
};
const notesSurvive: Predicate = {
  kind: 'workingFile',
  path: 'notes.txt',
  label: 'Your notes survive',
};

/** The last commit changed app.ts, and nothing else. */
const appAlone: Predicate = { kind: 'commitChanged', paths: ['app.ts'], only: true };
const appCommitted: Predicate = { kind: 'commitChanged', paths: ['app.ts'] };
const appStaged: Predicate = { kind: 'staged', paths: ['app.ts'] };
/** No commit was taken off the history: at least the three step 2 starts with. */
const historyKept: Predicate = { kind: 'commitCount', min: 3, label: 'History stays' };

/** Read-only lines Kyle can have run while he checks Otto's claim. */
const gitLooks = [
  { id: 'status', label: "What's on the dock?", line: 'git status' },
  { id: 'log', label: "What's in the Vault?", line: 'git log --oneline' },
  { id: 'staged', label: 'What will commit?', line: 'git diff --staged' },
];

/**
 * Step 1: commit the app.ts edit alone. The weak card only stages everything and claims
 * it saved the work; the okay card "starts clean" with reset --hard, which a dry run
 * finds harmful because it throws the unsaved edit away.
 */
export const commitAppTaskInput = {
  plans: [
    {
      id: 'save-all',
      text: 'Save all my work.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['save all my work', 'save everything'],
      script: [{ do: 'run', line: 'git add .' }],
      claim: 'Done: all your work is saved.',
      lesson: 'git add . only loaded crates onto the dock, notes.txt too. Nothing was committed.',
      slip: 'overclaim',
    },
    {
      id: 'just-app',
      text: 'Stage only app.ts, commit it as feat: greet the team.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['stage only app.ts', 'feat: greet the team'],
      script: [
        {
          do: 'run',
          line: 'git add app.ts',
          predict: {
            question: 'Before Otto runs it: where does app.ts go?',
            // Two options that split every state: is app.ts waiting on the dock or not?
            options: [
              {
                id: 'dock',
                text: 'Onto the Loading Dock, to wait for a commit',
                outcome: { state: appStaged },
              },
              {
                id: 'nowhere',
                text: 'Nowhere: git has nothing new to load',
                outcome: { state: { kind: 'not', predicate: appStaged } },
              },
            ],
          },
        },
        { do: 'run', line: 'git commit -m "feat: greet the team"' },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: committed only app.ts.',
      lesson: 'Naming the file kept notes.txt off the dock, and the log shows the commit.',
    },
    {
      id: 'start-clean',
      text: 'Start clean from the last commit, then commit app.ts.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['start clean', 'reset and commit'],
      script: [
        { do: 'run', line: 'git reset --hard', say: 'Cleaning the Workbench first.' },
        { do: 'run', line: 'git add app.ts' },
        { do: 'run', line: 'git commit -m "feat: greet the team"', fails: true },
      ],
      claim: 'Done: clean start, app.ts committed.',
      lesson: 'reset --hard threw away the unsaved edit. Nothing was left to commit.',
      slip: 'big-hammer',
    },
  ],
  fixes: [
    {
      id: 'unstage-notes',
      text: 'Take notes.txt off the dock, then commit as feat: greet the team.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['take notes.txt off the dock', 'unstage notes'],
      script: [
        { do: 'run', line: 'git restore --staged notes.txt' },
        { do: 'run', line: 'git commit -m "feat: greet the team"' },
      ],
      claim: 'Fixed: committed only app.ts.',
      lesson: 'restore --staged took notes.txt off the dock. Then the commit held only app.ts.',
    },
  ],
  hintPlan: 'just-app',
  check: {
    question: "What does Otto's last commit hold?",
    // The three options split every state in two questions: is app.ts in the last
    // commit, and is it alone there? So exactly one is true wherever Otto stops.
    options: [
      {
        id: 'only-app',
        text: 'Only your app.ts edit',
        truth: appAlone,
        feedback: 'git log and git show name what the last commit changed.',
      },
      {
        id: 'extra',
        text: 'app.ts, plus files you never asked for',
        truth: { kind: 'all', of: [appCommitted, { kind: 'not', predicate: appAlone }] },
        feedback: 'Other files rode along: git add . loads every crate.',
      },
      {
        id: 'no-commit',
        text: 'No commit holds your edit',
        truth: { kind: 'not', predicate: appCommitted },
        feedback: 'The log ends at an old commit. Nothing new holds app.ts.',
      },
    ],
  },
  guards: [editSurvives, notesSurvive],
  looks: gitLooks,
} satisfies AgentTaskInput;

/**
 * Step 2: take login.ts out of the project and keep the history. The weak card goes
 * back in time with reset --hard, which drops two commits; the okay card deletes the
 * Workbench copy with rm, which pauses (it deletes a file) but leaves the commit alone.
 */
export const dropLoginTaskInput = {
  plans: [
    {
      id: 'rm-commit',
      text: 'Remove login.ts with git rm, commit it as chore: drop login.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['git rm login.ts', 'chore: drop login'],
      script: [
        { do: 'run', line: 'git rm login.ts', say: 'Removing login.ts from the project.' },
        { do: 'run', line: 'git commit -m "chore: drop login"' },
      ],
      claim: 'Done: login.ts is gone, history kept.',
      lesson: 'git rm removed the file and loaded that removal. History kept every commit.',
    },
    {
      id: 'go-back',
      text: 'Go back to before login was added.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['go back to before login', 'undo login'],
      script: [{ do: 'run', line: 'git reset --hard HEAD~2', say: 'Rewinding the project.' }],
      claim: 'Done: login.ts is gone.',
      lesson:
        'reset --hard HEAD~2 dropped your app.ts commit too. Removing one file needs no time travel.',
      slip: 'big-hammer',
    },
    {
      id: 'delete-file',
      text: 'Delete login.ts.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['delete login.ts', 'remove the file'],
      script: [{ do: 'run', line: 'rm login.ts', say: 'Deleting login.ts.' }],
      claim: 'Done: login.ts is gone.',
      lesson: 'rm deleted the Workbench copy only. The last commit still holds login.ts.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'fix-rm',
      text: 'Remove login.ts and commit that as chore: drop login.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['remove login.ts', 'commit the removal'],
      script: [
        { do: 'run', line: 'git rm login.ts' },
        { do: 'run', line: 'git commit -m "chore: drop login"' },
      ],
      claim: 'Fixed: login.ts removed and committed.',
      lesson: 'A removal is a change like any other: load it, then commit it.',
    },
  ],
  hintPlan: 'rm-commit',
  check: {
    question: 'Where are login.ts and the history now?',
    // Split by two questions: did older commits go, and is login.ts in the last commit?
    options: [
      {
        id: 'kept',
        text: 'login.ts is out, and every old commit is kept',
        truth: { kind: 'all', of: [historyKept, { kind: 'notTracked', paths: ['login.ts'] }] },
        feedback: 'git log --oneline lists every commit, and the last one drops login.ts.',
      },
      {
        id: 'lost',
        text: 'Older commits are gone',
        truth: { kind: 'not', predicate: historyKept },
        feedback: 'Count the lines in git log --oneline: commits went missing.',
      },
      {
        id: 'still-there',
        text: 'login.ts is still in the last commit',
        truth: { kind: 'all', of: [historyKept, { kind: 'tracked', paths: ['login.ts'] }] },
        feedback: 'A removal waits on the dock until a commit seals it.',
      },
    ],
  },
  guards: [historyKept, notesSurvive],
  looks: gitLooks,
} satisfies AgentTaskInput;

/** Where step 2 starts when step 1 went well: app.ts committed, notes.txt still loose. */
const committed = () => project().stage('app.ts').commit('feat: greet the team');

/**
 * Judgment drills on git scenes, one of each kind and a second approve drill. The engine
 * works out each key: deny for reset --hard over an unsaved edit, allow for git add.
 */
export const gitJudgmentDrillsInput = [
  {
    kind: 'approve',
    id: 'git-approve-reset-hard',
    prompt: 'Otto wants to start clean. Allow?',
    concept: 'losing work',
    setup: project().toSpec(),
    action: { do: 'run', line: 'git reset --hard', say: 'Cleaning the Workbench first.' },
    guards: [editSurvives],
    explain: 'reset --hard rewrites the Workbench from the last commit. Your unsaved edit goes.',
  },
  {
    kind: 'approve',
    id: 'git-approve-add-app',
    prompt: 'Otto wants to stage your edit. Allow?',
    concept: 'staging',
    setup: project().toSpec(),
    action: { do: 'run', line: 'git add app.ts', say: 'Loading app.ts onto the dock.' },
    guards: [{ kind: 'untracked', paths: ['notes.txt'], label: 'notes.txt stays loose' }],
    explain: 'git add app.ts loads one crate. notes.txt stays on the Workbench.',
  },
  {
    kind: 'predict',
    id: 'git-predict-commit',
    prompt: 'Otto is about to run this. What does the commit hold?',
    concept: 'commits',
    setup: project().toSpec(),
    history: [{ do: 'run', line: 'git add app.ts' }],
    action: { do: 'run', line: 'git commit -m "feat: greet the team"' },
    options: [
      {
        id: 'app-only',
        text: 'Only app.ts',
        outcome: { state: { kind: 'commitChanged', paths: ['app.ts'], only: true } },
      },
      {
        id: 'both',
        text: 'app.ts and notes.txt',
        outcome: { state: { kind: 'commitChanged', paths: ['notes.txt'] } },
      },
      { id: 'nothing', text: 'Nothing: it fails', outcome: { result: 'error' } },
    ],
    explain: 'A commit seals what is on the dock, and only app.ts was loaded.',
  },
  {
    kind: 'diagnose',
    id: 'git-diagnose-lost-edit',
    prompt: 'Otto says your edit is safe. Is he right?',
    concept: 'losing work',
    setup: project().toSpec(),
    history: [{ do: 'run', line: 'git reset --hard' }],
    claim: 'Done: Workbench clean, your edit is safe.',
    options: [
      {
        id: 'lost',
        text: 'No: the edit is gone',
        truth: { kind: 'not', predicate: editSurvives },
      },
      {
        id: 'on-dock',
        text: 'Yes: it waits on the Loading Dock',
        truth: { kind: 'staged', paths: ['app.ts'] },
      },
      {
        id: 'in-vault',
        text: 'Yes: it is in the last commit',
        truth: { kind: 'fileAtHead', path: 'app.ts', contains: 'team' },
      },
    ],
    explain: 'The edit was never staged or committed, so reset --hard left no copy anywhere.',
  },
  {
    kind: 'fix',
    id: 'git-fix-unstage-notes',
    prompt: 'notes.txt is on the dock by mistake. Which fix is right?',
    concept: 'staging',
    setup: project().stage('app.ts', 'notes.txt').toSpec(),
    goal: {
      kind: 'all',
      of: [
        { kind: 'staged', paths: ['app.ts'] },
        { kind: 'untracked', paths: ['notes.txt'] },
      ],
    },
    failIf: [{ kind: 'not', predicate: notesSurvive }],
    options: [
      {
        id: 'restore-staged',
        text: 'git restore --staged notes.txt',
        script: [{ do: 'run', line: 'git restore --staged notes.txt' }],
      },
      {
        id: 'commit',
        text: 'Commit, and sort it out later',
        script: [{ do: 'run', line: 'git commit -m "update"' }],
      },
      {
        id: 'reset-hard',
        text: 'git reset --hard',
        script: [{ do: 'run', line: 'git reset --hard' }],
      },
    ],
    explain: 'restore --staged takes a crate off the dock and leaves the file alone.',
  },
] satisfies JudgmentDrillInput[];

export const gitDirectedMissionInput: MissionInput = {
  ...sampleMissionInput,
  id: 'sample-directed-git',
  title: 'Directing Git (sample)',
  briefing: {
    sceneId: 'three-rooms',
    captions: ['Otto runs git. You direct and check.', 'Watch the crates move.'],
  },
  initialRepoState: project().toSpec(),
  approvals: 'destructive',
  drills: gitJudgmentDrillsInput,
  steps: [
    {
      id: 'commit-app',
      instruction: 'Get your app.ts edit into a commit of its own. Leave notes.txt out.',
      success: {
        kind: 'all',
        of: [
          { kind: 'commitChanged', paths: ['app.ts'], only: true },
          { kind: 'headMessage', pattern: '^feat: ' },
          { kind: 'untracked', paths: ['notes.txt'] },
        ],
      },
      hints: [
        'Which crates should ride in this commit?',
        'Only what is on the Loading Dock goes into a commit.',
        'Pick the card that stages only app.ts.',
      ],
      agent: commitAppTaskInput,
    },
    {
      id: 'drop-login',
      instruction: 'Take login.ts out of the project, and keep every commit in history.',
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['login.ts'] },
          { kind: 'headMessage', pattern: '^chore: ' },
        ],
      },
      hints: [
        'Does removing one file need any old commits undone?',
        'A removal is a change: load it onto the dock, then commit it.',
        'Pick the card that uses git rm.',
      ],
      agent: dropLoginTaskInput,
    },
  ],
};

export const gitDirectedMission: Mission = MissionSchema.parse(gitDirectedMissionInput);

/** Step 2's start on the reference path, for tests that begin there. */
export const afterCommitApp = committed;

/** An early-access Act holding only the sample, as a scratch catalog would. */
export const gitDirectedAct = ActSchema.parse({
  act: 2,
  title: 'Directed Git (sample)',
  earlyAccess: true,
  missionIds: [gitDirectedMission.id],
});
