import { folder, repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from './agentSchema';
import {
  ActSchema,
  MissionSchema,
  requireComplete,
  type Act,
  type ActInput,
  type CompleteAct,
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
