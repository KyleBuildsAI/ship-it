import { windows } from '../../engine/fixtures';
import { folder, repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from './agentSchema';
import {
  ActSchema,
  MissionSchema,
  requireComplete,
  type Act,
  type ActInput,
  type CompleteAct,
  type JudgmentDrillInput,
  type Mission,
  type MissionInput,
} from './schema';

/**
 * A tiny mission and Act used only by tests in this folder. Real content lives in
 * src/content/. Keeping one complete sample here shows the whole shape of a mission in
 * one place and keeps the tests independent of real content changing.
 */

const CONVENTIONAL = '^(feat|fix|docs|chore|refactor|test)(\\(.+\\))?: .+';

export const sampleMissionInput: MissionInput = {
  id: 'sample-three-rooms',
  act: 2,
  title: 'Three Rooms (sample)',
  xp: 100,
  briefing: {
    sceneId: 'three-rooms',
    captions: [
      'Your files sit on the Workbench.',
      'git add moves a crate to the Loading Dock.',
      'git commit seals the dock into the Vault.',
    ],
    diagram: 'workbench-dock-vault',
  },
  initialRepoState: folder()
    .write('app.ts', "console.log('hello');\n")
    .write('.env', 'TOKEN=dev-only\n')
    .toSpec(),
  steps: [
    {
      id: 'init',
      instruction: 'Turn this folder into a git repository.',
      success: { kind: 'isRepo' },
      hints: [
        'What command starts tracking a brand-new project?',
        'A repository begins with init, which creates the hidden .git folder.',
        'Run: git init',
      ],
    },
    {
      id: 'stage-app',
      instruction: 'Stage app.ts, and leave .env on the Workbench.',
      success: {
        kind: 'all',
        of: [
          // Committing straight away also proves app.ts was staged, so accept either.
          {
            kind: 'any',
            label: 'app.ts is staged',
            of: [
              { kind: 'staged', paths: ['app.ts'] },
              { kind: 'tracked', paths: ['app.ts'] },
            ],
          },
          { kind: 'notStaged', paths: ['.env'] },
          { kind: 'notTracked', paths: ['.env'] },
        ],
      },
      hints: [
        'Which room does a file visit before the Vault?',
        'Staging chooses exactly what the next commit will contain.',
        'Run: git add app.ts',
      ],
      xp: 10,
    },
    {
      id: 'commit',
      instruction: 'Commit app.ts with a Conventional Commit message.',
      success: {
        kind: 'all',
        of: [
          { kind: 'tracked', paths: ['app.ts'] },
          { kind: 'notTracked', paths: ['.env'] },
          {
            kind: 'headMessage',
            pattern: CONVENTIONAL,
            label: 'The message starts with a type like "feat:"',
          },
        ],
      },
      hints: [
        'What seals the Loading Dock into the Vault?',
        'A commit saves a snapshot of what is staged, with a message.',
        'Run: git commit -m "feat: add app"',
      ],
      xp: 20,
    },
  ],
  drills: [
    {
      id: 'sample-init',
      prompt: 'Turn this folder into a git repository.',
      setup: folder().write('notes.md', '# Notes\n').toSpec(),
      success: { kind: 'isRepo' },
      concept: 'init',
    },
    {
      id: 'sample-stage-one',
      prompt: 'Stage notes.md and nothing else.',
      setup: repo().write('notes.md', '# Notes\n').write('todo.md', '- ship\n').toSpec(),
      success: { kind: 'staged', paths: ['notes.md'], exact: true },
      concept: 'staging',
    },
    {
      id: 'sample-commit',
      prompt: 'Commit the staged file with any message.',
      setup: repo().write('a.ts', 'a\n').stage('a.ts').toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'commitCount', min: 1 },
          { kind: 'tracked', paths: ['a.ts'] },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'commit',
    },
    {
      id: 'sample-unstage',
      prompt: 'Unstage .env but keep the file on disk.',
      setup: repo()
        .commit('chore: init', { 'app.ts': 'app\n' })
        .write('.env', 'TOKEN=dev-only\n')
        .stage('.env')
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'notStaged', paths: ['.env'] },
          { kind: 'workingFile', path: '.env' },
        ],
      },
      concept: 'restore',
    },
    {
      id: 'sample-clean',
      prompt: 'Commit your edit so the working tree is clean.',
      setup: repo().commit('chore: init', { 'app.ts': 'v1\n' }).modify('app.ts', 'v2\n').toSpec(),
      success: {
        kind: 'all',
        of: [{ kind: 'clean' }, { kind: 'fileAtHead', path: 'app.ts', equals: 'v2\n' }],
      },
      concept: 'commit',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Make saving better',
      body: 'Users say the app loses their work sometimes. Can you make saving better? Ideally this week.',
    },
    candidates: [
      {
        id: 'when-lost',
        text: 'When exactly is work lost: on refresh, on a crash, or after closing the tab?',
        quality: 'strong',
        rationale: 'Pins down the failure, so you fix the real bug instead of a guess.',
      },
      {
        id: 'done-means',
        text: 'What would "better" look like to you? How will we know it is fixed?',
        quality: 'strong',
        rationale: 'Agrees on a finish line before any code is written.',
      },
      {
        id: 'how-many',
        text: 'How many users have reported this?',
        quality: 'okay',
        rationale: 'Useful for priority, but it does not change what to build.',
      },
      {
        id: 'deadline',
        text: 'Is this week a hard deadline, or a hope?',
        quality: 'okay',
        rationale: 'Helps plan scope. Ask what is broken before asking when.',
      },
      {
        id: 'which-storage',
        text: 'Should I use IndexedDB or localStorage?',
        quality: 'weak',
        rationale: 'A tooling question. Understand the problem before picking tools.',
      },
      {
        id: 'rewrite',
        text: 'Can I rewrite the whole save system?',
        quality: 'weak',
        rationale: 'Jumps to a big answer before knowing the question.',
      },
    ],
    rubric: 'Strong questions narrow down when and how work is lost, or define what fixed means.',
  },
};

export const sampleMission = MissionSchema.parse(sampleMissionInput);

/**
 * The first mission under a new id. Its drill ids get a prefix, because the placement
 * test names drills by id alone, so they must be unique across the whole Act.
 */
function copyOfSample(id: string, title: string, drillPrefix: string): MissionInput {
  return {
    ...sampleMissionInput,
    id,
    title,
    drills: sampleMissionInput.drills.map((drill) => ({
      ...drill,
      id: `${drillPrefix}-${drill.id}`,
    })),
  };
}

// Two more missions for Act-level tests, because an Act has 3 to 6 (DESIGN.md section 5).
export const secondMission = MissionSchema.parse(
  copyOfSample('sample-reading-history', 'Reading History (sample)', 'history'),
);
export const thirdMission = MissionSchema.parse(
  copyOfSample('sample-good-commits', 'Good Commits (sample)', 'commits'),
);

// `satisfies` checks the shape without widening the type, so tests can read the boss and
// Field Mission here without first proving they exist.
export const sampleActInput = {
  act: 2,
  title: 'Git Core (sample)',
  missionIds: ['sample-three-rooms', 'sample-reading-history', 'sample-good-commits'],
  placementTest: {
    pitch: 'Know this already? 85% tests out.',
    drillIds: [
      'sample-init',
      'sample-stage-one',
      'sample-commit',
      'sample-unstage',
      'sample-clean',
      'history-sample-init',
      'history-sample-stage-one',
      'history-sample-commit',
    ],
  },
  boss: {
    id: 'sample-dirty-tree',
    title: 'The Dirty Tree (sample)',
    briefing: ['Dex deploys from a clean checkout in 3:00.', 'Commit the right things. Not .env.'],
    setup: repo()
      .commit('chore: init', { 'app.ts': 'v1\n', '.gitignore': 'dist/\n' })
      .modify('app.ts', 'v2\n')
      .untracked('.env', 'TOKEN=dev-only\n')
      .untracked('src/logger.ts', 'export const log = console.log;\n')
      .untracked('dist/bundle.js', 'bundled\n')
      .toSpec(),
    timeLimitSeconds: 180,
    objectives: [
      { kind: 'fileAtHead', path: 'app.ts', equals: 'v2\n' },
      { kind: 'tracked', paths: ['src/logger.ts'] },
    ],
    failIf: [{ kind: 'tracked', paths: ['.env'] }],
    twists: [
      {
        atSecondsRemaining: 60,
        message: 'Dex: prod crashed. src/logger.ts is missing. It was never tracked!',
      },
      {
        atSecondsRemaining: 30,
        message: 'Marco dropped release notes on the Workbench.',
        apply: folder().write('NOTES.md', 'v2 is out\n').toSpec(),
      },
    ],
  },
  fieldMission: {
    id: 'sample-clean-the-tree',
    title: 'Clean the Dirty Tree (sample)',
    repoName: 'SandCastles',
    briefing: ['Real repo, real stakes.', 'End with a clean git status.'],
    checklist: [
      { id: 'commit-work', text: 'Commit outstanding work in logical commits.' },
      { id: 'ignore-secrets', text: 'Add .env and build output to .gitignore.' },
    ],
    verifications: [
      {
        id: 'status',
        instruction: 'Run this in the SandCastles folder and paste the output.',
        command: 'git status --short',
        parser: 'status-short',
        check: { kind: 'clean' },
      },
      {
        id: 'history',
        instruction: 'Paste your recent history.',
        command: 'git log --oneline -10',
        parser: 'log-oneline',
        check: { kind: 'conventionalRatio', min: 0.8, last: 10 },
      },
    ],
  },
} satisfies ActInput;

export const sampleAct: CompleteAct = requireComplete(ActSchema.parse(sampleActInput));

/**
 * A second Act for tests of more than one Act: the sample Act as Act 3, with every mission,
 * drill, boss, and Field Mission id prefixed so nothing clashes with the first.
 */
export function otherSampleAct(): { act: CompleteAct; missions: Mission[] } {
  const rename = (id: string) => `other-${id}`;
  const missions = [sampleMission, secondMission, thirdMission].map((mission) => ({
    ...mission,
    id: rename(mission.id),
    act: 3,
    drills: mission.drills.map((drill) => ({ ...drill, id: rename(drill.id) })),
  }));
  const act: CompleteAct = {
    ...sampleAct,
    act: 3,
    title: 'Other Sample',
    missionIds: sampleAct.missionIds.map(rename),
    placementTest: {
      ...sampleAct.placementTest,
      drillIds: sampleAct.placementTest.drillIds.map(rename),
    },
    boss: { ...sampleAct.boss, id: rename(sampleAct.boss.id) },
    fieldMission: { ...sampleAct.fieldMission, id: rename(sampleAct.fieldMission.id) },
  };
  return { act, missions };
}

/** An Act in early access: one mission so far, two on the way, and no other parts yet. */
export const earlyActInput = {
  act: 1,
  title: 'Early Sample',
  earlyAccess: true,
  missionIds: ['early-three-rooms'],
  upcoming: ['Reading History (sample)', 'Good Commits (sample)'],
} satisfies ActInput;

/** The early-access Act as Act 1, with its one mission: a copy of the first sample. */
export function earlySampleAct(): { act: Act; missions: Mission[] } {
  const mission = MissionSchema.parse({
    ...copyOfSample('early-three-rooms', 'Three Rooms (early sample)', 'early'),
    act: 1,
  });
  return { act: ActSchema.parse(earlyActInput), missions: [mission] };
}

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';

/**
 * A directed step's agent task, modelled on Act 1's first step: get Otto's terminal
 * standing in the API folder. The weak card fails and Otto claims success anyway.
 */
export const sampleAgentTaskInput = {
  plans: [
    {
      id: 'guess',
      text: 'Go to the api folder.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['go to the api folder', 'cd api'],
      script: [{ do: 'run', line: 'cd api', fails: true }],
      claim: "Done: I'm in the API folder.",
      lesson: 'cd api looked inside home, where the terminal stands. It failed.',
      slip: 'overclaim',
    },
    {
      id: 'full-path',
      text: 'Go to C:\\Users\\kyle\\quillwork\\api, then show where you are.',
      quality: 'strong',
      covers: ['goal', 'place', 'check'],
      intents: ['full path to the api', 'show where you are'],
      script: [
        { do: 'run', line: 'cd C:\\Users\\kyle\\quillwork\\api' },
        { do: 'run', line: 'Get-Location' },
      ],
      claim: "Done: I'm in the API folder.",
      lesson: 'A full path works from any folder, and Get-Location proves it.',
    },
  ],
  fixes: [
    {
      id: 'fix-full-path',
      text: "You're still at home. Go to C:\\Users\\kyle\\quillwork\\api.",
      quality: 'strong',
      covers: ['goal', 'place'],
      intents: ['still at home', 'go to the full path'],
      script: [{ do: 'run', line: 'cd C:\\Users\\kyle\\quillwork\\api' }],
      claim: "Fixed: I'm in the API folder now.",
      lesson: 'The full path landed Otto where you meant.',
    },
  ],
  hintPlan: 'full-path',
  check: {
    question: "Where is Otto's terminal standing now?",
    options: [
      {
        id: 'api',
        text: 'C:\\Users\\kyle\\quillwork\\api',
        truth: { kind: 'currentDirectory', path: API },
        feedback: 'Right: the prompt names the API folder.',
      },
      {
        id: 'home',
        text: 'Still C:\\Users\\kyle: the cd failed',
        truth: { kind: 'currentDirectory', path: HOME },
        feedback: 'Read the prompt: it names the folder the terminal stands in.',
      },
    ],
  },
  guards: [{ kind: 'driveFile', path: `${API}/package.json`, label: 'The API is intact' }],
  looks: [{ id: 'where', label: 'Where is Otto?', line: 'Get-Location' }],
} satisfies AgentTaskInput;

/**
 * A small laptop: one terminal open at home, and the API project with its package.json.
 * The terminal opens first, so a setup can cd it somewhere else.
 */
const laptop = () => windows({ mount: API }).session().write(`${API}/package.json`, '{}\n');

/**
 * Judgment drills modelled on Mission 1.1's: one of each kind, and a second approve drill
 * whose right answer is Deny. No option says it's the right one; the engine works it out,
 * and sampleDrills.test.ts proves each drill has the answer described here.
 */
export const sampleJudgmentDrillsInput = [
  {
    kind: 'predict',
    id: 'sample-predict-typo',
    prompt: 'Otto is about to run this. What happens?',
    concept: 'paths',
    setup: laptop().toSpec(),
    action: { do: 'run', line: 'cd quilwork\\api' },
    options: [
      {
        id: 'lands',
        text: 'Otto lands in the API folder',
        outcome: { state: { kind: 'currentDirectory', path: API } },
      },
      {
        id: 'error',
        text: 'An error, and Otto stays at home',
        outcome: { result: 'error', state: { kind: 'currentDirectory', path: HOME } },
      },
      {
        id: 'creates',
        text: 'PowerShell makes the missing folder',
        outcome: { state: { kind: 'driveFolder', path: `${HOME}/quilwork/api` } },
      },
    ],
    explain: 'quilwork is misspelled, so cd finds no such folder. The terminal stays where it was.',
  },
  {
    kind: 'diagnose',
    id: 'sample-diagnose-home',
    prompt: 'Why did Get-ChildItem fail?',
    concept: 'paths',
    setup: laptop().toSpec(),
    history: [{ do: 'run', line: 'Get-ChildItem package.json', fails: true }],
    options: [
      {
        id: 'home',
        text: 'The terminal stands at home, not in the API',
        truth: {
          kind: 'all',
          of: [
            { kind: 'currentDirectory', path: HOME },
            { kind: 'driveFile', path: `${API}/package.json` },
          ],
        },
      },
      {
        id: 'deleted',
        text: 'package.json was deleted',
        truth: { kind: 'driveFile', path: `${API}/package.json`, exists: false },
      },
      { id: 'typo', text: 'Get-ChildItem is spelled wrong' },
    ],
    explain:
      'A fresh terminal stands at home. package.json is in the API folder, so a bare name misses it.',
  },
  {
    kind: 'fix',
    id: 'sample-fix-cd',
    prompt: "Otto's cd failed. Which direction gets him into the API folder?",
    concept: 'paths',
    setup: laptop().toSpec(),
    history: [{ do: 'run', line: 'cd api', fails: true }],
    claim: "Done: I'm in the API folder.",
    goal: { kind: 'currentDirectory', path: API },
    options: [
      {
        id: 'full-path',
        text: 'Go to C:\\Users\\kyle\\quillwork\\api.',
        script: [{ do: 'run', line: 'cd C:\\Users\\kyle\\quillwork\\api' }],
      },
      {
        id: 'again',
        text: 'Try cd api again.',
        script: [{ do: 'run', line: 'cd api', fails: true }],
      },
      {
        id: 'step-by-step',
        text: 'Go into quillwork, then into api.',
        script: [
          { do: 'run', line: 'cd quillwork' },
          { do: 'run', line: 'cd api' },
        ],
      },
    ],
    explain:
      'Otto stands at home. A full path works from anywhere; quillwork then api works from home.',
  },
  {
    kind: 'approve',
    id: 'sample-approve-stray',
    prompt: 'Otto wants to tidy up. Allow?',
    concept: 'approvals',
    setup: laptop().mkdir(`${HOME}/notes`).toSpec(),
    action: {
      do: 'run',
      line: 'Remove-Item C:\\Users\\kyle\\notes',
      say: 'Removing a stray folder.',
    },
    guards: [{ kind: 'driveFile', path: `${API}/package.json`, label: 'The API is intact' }],
    explain: 'The notes folder at home is empty and stray. Deleting it leaves the API alone.',
  },
  {
    kind: 'approve',
    id: 'sample-approve-notes',
    prompt: 'Otto wants to tidy up. Allow?',
    concept: 'approvals',
    setup: laptop().write(`${API}/notes/onboarding.md`, '# Week 1\n').cd(API).toSpec(),
    action: { do: 'run', line: 'Remove-Item notes -Recurse', say: 'Tidying the old notes folder.' },
    guards: [
      { kind: 'driveFile', path: `${API}/notes/onboarding.md`, label: 'Onboarding notes survive' },
    ],
    explain:
      'Otto stands in the API, so notes is your real notes folder. -Recurse takes onboarding.md too.',
  },
] satisfies JudgmentDrillInput[];

/** A directed mission on a laptop: one step where Kyle directs Otto, and judgment drills. */
export const directedMissionInput: MissionInput = {
  ...copyOfSample('sample-where-things-live', 'Where Things Live (sample)', 'directed'),
  act: 1,
  briefing: {
    sceneId: 'machine-island',
    captions: ['Every terminal stands in one folder.', 'Otto types. You direct and check.'],
  },
  initialRepoState: laptop().toSpec(),
  drills: sampleJudgmentDrillsInput,
  approvals: 'destructive',
  steps: [
    {
      id: 'stand-in-the-api',
      instruction: "Get Otto's terminal standing in the API folder, under your home folder.",
      success: { kind: 'currentDirectory', path: API },
      hints: [
        'When a terminal opens fresh, which folder does it stand in?',
        'A bare name starts where the terminal stands. A full path works from anywhere.',
        'Pick the card with the full path C:\\Users\\kyle\\quillwork\\api.',
      ],
      agent: sampleAgentTaskInput,
    },
  ],
};

export const directedMission = MissionSchema.parse(directedMissionInput);

const NOTES_LINE = 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes';
const apiNotes = { kind: 'driveFolder', path: `${API}/notes` } as const;
const homeNotes = { kind: 'driveFolder', path: `${HOME}/notes` } as const;

/**
 * A directed step modelled on Mission 1.1's second step, with every way Otto can pause:
 * a prediction on the weak card, a safe delete in one fix, and in another a Confirm
 * question whose Yes to All would delete the whole API, with a plan B for a deny.
 */
export const notesAgentTaskInput = {
  before: [{ op: 'restartTerminals' }],
  plans: [
    {
      id: 'bare-name',
      text: 'Make a notes folder for the API.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['make a notes folder', 'notes for the api'],
      script: [
        {
          do: 'run',
          line: 'mkdir notes',
          predict: {
            question: 'Before Otto runs it: where will notes land?',
            options: [
              { id: 'api', text: 'In the API folder', outcome: { state: apiNotes } },
              { id: 'home', text: 'In C:\\Users\\kyle', outcome: { state: homeNotes } },
              { id: 'fails', text: 'Nowhere: it fails', outcome: { result: 'error' } },
            ],
          },
        },
      ],
      claim: 'Done: notes is in the API project.',
      lesson: 'A fresh terminal stands at home, so notes landed in C:\\Users\\kyle.',
      slip: 'wrong-place',
    },
    {
      id: 'full-path',
      text: 'Make C:\\Users\\kyle\\quillwork\\api\\notes.',
      quality: 'strong',
      covers: ['goal', 'place'],
      intents: ['full path', 'api notes'],
      script: [{ do: 'run', line: NOTES_LINE }],
      claim: 'Done: notes is in the API.',
      lesson: 'A full path lands in one place, wherever the terminal stands.',
    },
  ],
  fixes: [
    {
      id: 'tidy-and-redo',
      text: 'Delete the empty notes at home, then make it in the API.',
      quality: 'strong',
      covers: ['goal', 'place', 'limits'],
      intents: ['delete the stray', 'remove home notes'],
      script: [
        { do: 'run', line: 'Remove-Item C:\\Users\\kyle\\notes' },
        { do: 'run', line: NOTES_LINE },
      ],
      claim: 'Fixed: notes is in the API, and home is tidy.',
      lesson: 'Direct the cleanup too: full paths make a fix land where you mean.',
    },
    {
      id: 'start-over',
      text: 'Clear out the API folder, then make notes there.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['clear out the api', 'start over'],
      script: [
        {
          do: 'run',
          line: 'Remove-Item C:\\Users\\kyle\\quillwork\\api',
          answer: 'A',
          onDeny: [{ do: 'run', line: 'Remove-Item C:\\Users\\kyle\\notes' }],
          denyLine: 'Good stop. That was the whole project.',
        },
        { do: 'run', line: NOTES_LINE },
      ],
      claim: 'Fixed: a clean API with notes.',
      lesson: 'Yes to All on a folder delete takes everything inside. Read the question first.',
      slip: 'too-broad',
    },
  ],
  hintPlan: 'full-path',
  check: {
    question: 'Where did notes land?',
    options: [
      {
        id: 'api',
        text: 'Only in the API folder',
        truth: { kind: 'all', of: [apiNotes, { ...homeNotes, exists: false }] },
        feedback: 'Right: the Directory line shows the API folder.',
      },
      {
        id: 'home',
        text: 'In C:\\Users\\kyle, where fresh terminals start',
        truth: { kind: 'all', of: [homeNotes, { ...apiNotes, exists: false }] },
        feedback: 'Read the Directory line above the table: it says where mkdir put it.',
      },
      {
        id: 'both',
        text: 'In both places',
        truth: { kind: 'all', of: [apiNotes, homeNotes] },
        feedback: 'Two Directory lines, two folders. List home to see the stray one.',
      },
    ],
  },
  guards: [
    { ...homeNotes, exists: false, label: 'No stray notes folder at home' },
    { kind: 'driveFile', path: `${API}/package.json`, label: 'The API is intact' },
  ],
  looks: [{ id: 'home', label: 'List home', line: 'Get-ChildItem C:\\Users\\kyle' }],
} satisfies AgentTaskInput;

/** A directed mission whose one step is the notes step above. */
export const notesMission = MissionSchema.parse({
  ...directedMissionInput,
  id: 'sample-notes',
  steps: [
    {
      id: 'notes-in-the-api',
      instruction: 'Have Otto make a notes folder inside the API project.',
      success: { ...apiNotes, label: 'The API has a notes folder' },
      hints: [
        'When a terminal opens fresh, which folder does it stand in?',
        'Fresh terminals start at home. A bare name lands wherever the terminal stands.',
        'Pick the card with the full path C:\\Users\\kyle\\quillwork\\api\\notes.',
      ],
      agent: notesAgentTaskInput,
    },
  ],
});
