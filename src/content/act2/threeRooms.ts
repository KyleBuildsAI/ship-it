import { folder, repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from '../../game/missions/agentSchema';
import type { Predicate } from '../../game/missions/predicates';
import type { JudgmentDrillInput, MissionInput } from '../../game/missions/schema';

/**
 * Mission 2.1: the three areas every change travels through. Workbench (working tree),
 * Loading Dock (index), Vault (history), with init, status, add, and commit. Kyle directs
 * Otto, who runs the git lines, and the Git World moves the crates for each one. The
 * trap all the way through is todo.txt: a personal list that "save everything" sweeps
 * into the Vault, and that only a careful request (check git status, name the files)
 * leaves on the Workbench.
 */

const README = '# Quillwork Notes\n\nA tiny note-taking app.\n';
const RUN_LINE = 'Run it with npm start.\n';
const APP =
  "import './styles.css';\n\nexport function addNote(text: string): string {\n  return text.trim();\n}\n";
const STYLES = 'body {\n  font-family: system-ui, sans-serif;\n}\n';
// A personal file that has no business in the project's history.
const TODO = '- buy coffee\n- ask Sage what HEAD means\n';
const PROJECT_FILES = ['README.md', 'src/app.ts', 'src/styles.css'];

const HEADER_V1 = "export const header = '<h1>Quillwork</h1>';\n";
const HEADER_V2 = "export const header = '<h1>Quillwork Notes</h1>';\n";

/*
 * What the steps grade and guard. Each is a question about the three areas, never about
 * which command Otto typed, so any route to the same Vault counts the same.
 */

/**
 * Neither on the Loading Dock nor in the Vault. Untracked, not just uncommitted, so the
 * gate on git add . is the one that breaks it: that is where Kyle can still say no.
 */
const todoOut: Predicate = {
  kind: 'untracked',
  paths: ['todo.txt'],
  label: 'todo.txt stays out of git',
};
/** The list itself survives on the Workbench: git rm without --cached would delete it. */
const todoKept: Predicate = {
  kind: 'workingFile',
  path: 'todo.txt',
  label: 'Your todo.txt survives',
};
/**
 * No commit ever held it. A later commit that drops todo.txt leaves it in the older one,
 * where git log and git show still print it, so only Rewind undoes a commit that sealed
 * it. As a guard, it makes the commit after an allowed git add . harmful too: denying
 * that commit is the last chance to keep the list out of history.
 */
const todoNeverCommitted: Predicate = {
  kind: 'not',
  predicate: { kind: 'inHistory', path: 'todo.txt' },
  label: 'No commit ever holds todo.txt',
};
const todoAtHead: Predicate = { kind: 'fileAtHead', path: 'todo.txt' };
const projectAtHead: Predicate = {
  kind: 'all',
  of: PROJECT_FILES.map((path): Predicate => ({ kind: 'fileAtHead', path })),
  label: 'README.md and src are in the latest commit',
};
const readmeEditAtHead: Predicate = {
  kind: 'fileAtHead',
  path: 'README.md',
  contains: 'npm start',
  label: 'Your README.md edit is in the latest commit',
};
const noCommits: Predicate = { kind: 'commitCount', max: 0 };

/** Read-only lines Kyle can have Otto run while checking a claim. */
const gitLooks = [
  { id: 'status', label: "What's on the dock?", line: 'git status' },
  { id: 'log', label: "What's in the Vault?", line: 'git log --oneline' },
  { id: 'staged', label: 'What will commit?', line: 'git diff --staged' },
];

/**
 * Step 1: make the repository. The weak card asks Otto to "save" before there is
 * anything to save into, so git add fails and he claims it worked anyway.
 */
const startTracking: AgentTaskInput = {
  note: 'Quillwork is a plain folder: no Loading Dock, no Vault yet.',
  plans: [
    {
      id: 'save-it',
      text: 'Save my project in git.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['save my project in git', 'save the project', 'put it in git'],
      script: [{ do: 'run', line: 'git add .', say: 'Saving everything into git.', fails: true }],
      claim: 'Done: your project is saved in git.',
      lesson: 'There was no repository yet, so git add failed and nothing was saved.',
      slip: 'overclaim',
    },
    {
      id: 'init-only',
      text: 'Turn this folder into a git repository.',
      quality: 'okay',
      covers: ['goal', 'place'],
      intents: ['turn this folder into a git repository', 'make a repository', 'git init'],
      script: [{ do: 'run', line: 'git init' }],
      claim: 'Done: this folder is a git repository.',
      lesson: 'git init made the repository. Asking for git status too shows what git now sees.',
    },
    {
      id: 'init-status',
      text: 'Run git init here, then show me git status.',
      quality: 'strong',
      covers: ['goal', 'place', 'check'],
      intents: ['git init then git status', 'init and show me status', 'init here and status'],
      script: [
        {
          do: 'run',
          line: 'git init',
          say: 'Starting a repository in this folder.',
          predict: {
            question: 'Before Otto runs it: what happens to your four files?',
            // Split by one question: does git init load anything onto the dock?
            options: [
              {
                id: 'stay',
                text: 'They stay on the Workbench, unstaged',
                outcome: {
                  state: { kind: 'not', predicate: { kind: 'staged', paths: ['README.md'] } },
                },
              },
              {
                id: 'dock',
                text: 'They all go onto the Loading Dock',
                outcome: { state: { kind: 'staged', paths: ['README.md'] } },
              },
            ],
          },
        },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: repository made, nothing committed yet.',
      lesson:
        'git status proved it: README.md, src/ and todo.txt wait untracked. It folds a new folder into one line.',
    },
  ],
  fixes: [
    {
      id: 'fix-init',
      text: 'There is no repository. Run git init, then git status.',
      quality: 'strong',
      covers: ['goal', 'place', 'check'],
      intents: ['run git init first', 'there is no repository'],
      script: [
        { do: 'run', line: 'git init' },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Fixed: this folder is a repository now.',
      lesson: 'A folder needs git init before git can stage or save anything in it.',
    },
  ],
  hintPlan: 'init-status',
  check: {
    question: 'What does git see in the Quillwork folder now?',
    options: [
      {
        id: 'four-new',
        text: 'A new repository, with nothing committed yet',
        // Not "nothing staged": Kyle can Stop Otto and pick a card that stages.
        truth: { kind: 'all', of: [{ kind: 'isRepo' }, noCommits] },
        feedback:
          'git status says "No commits yet" and lists README.md, src/ and todo.txt as untracked.',
      },
      {
        id: 'no-repo',
        text: 'Nothing: there is no repository here',
        truth: { kind: 'not', predicate: { kind: 'isRepo' } },
        feedback: 'git status says "not a git repository". git init never ran.',
      },
    ],
  },
  looks: gitLooks,
};

/**
 * Step 2: the first commit. The weak card loads every crate, todo.txt too; the okay card
 * loads the right ones and never commits. The strong card looks first and names files.
 */
const firstCommit: AgentTaskInput = {
  note: 'Every line that moves a crate pauses for you, so you see each trip.',
  plans: [
    {
      id: 'commit-all',
      text: 'Commit everything as the first version.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['commit everything', 'save everything as the first version'],
      script: [
        { do: 'run', line: 'git add .', say: 'Loading every file onto the dock.' },
        { do: 'run', line: 'git commit -m "first version"' },
      ],
      claim: 'Done: first commit made, project saved.',
      lesson:
        'git add . loaded todo.txt, and the commit sealed it into history. Only Rewind takes that back.',
      slip: 'too-broad',
    },
    {
      id: 'stage-project',
      text: 'Stage README.md and src for the first commit.',
      quality: 'okay',
      covers: ['goal', 'limits'],
      intents: ['stage readme and src', 'stage the project files'],
      script: [{ do: 'run', line: 'git add README.md src' }],
      claim: 'Done: your first commit is made.',
      lesson: 'Otto staged the right files but never ran git commit. The Vault is still empty.',
      slip: 'overclaim',
    },
    {
      id: 'status-first',
      text: 'Check status, stage README.md and src, commit as feat: add notes app.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['check status then stage readme and src', 'feat: add notes app'],
      script: [
        { do: 'run', line: 'git status', say: 'Looking before I load anything.' },
        {
          do: 'run',
          line: 'git add README.md src',
          predict: {
            question: 'Before Otto runs it: which crates go onto the dock?',
            // Each option says what is on the dock, never "not the other one": played as a
            // fix after everything was committed, nothing is staged, and a negation would
            // call "todo.txt too" right.
            options: [
              {
                id: 'three',
                text: 'README.md, app.ts and styles.css',
                outcome: { state: { kind: 'staged', paths: PROJECT_FILES, exact: true } },
              },
              {
                id: 'four',
                text: 'All four, todo.txt too',
                outcome: { state: { kind: 'staged', paths: ['todo.txt'] } },
              },
              {
                id: 'none',
                text: 'None: they are all committed already',
                outcome: { state: { kind: 'notStaged', paths: [...PROJECT_FILES, 'todo.txt'] } },
              },
            ],
          },
        },
        { do: 'run', line: 'git commit -m "feat: add notes app"' },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: the first commit holds README.md and src.',
      lesson:
        'git status showed todo.txt waiting. Naming README.md and src left it on the Workbench.',
    },
  ],
  fixes: [
    {
      // Works from every state a fix round can start in: after the okay card (the
      // project on the dock), after a denied git add . (an empty dock), and after an
      // allowed git add . whose commit was denied (todo.txt on the dock too). git reset
      // with no options only empties the dock, even before the first commit, and never
      // touches the Workbench. After an allowed commit nothing helps but Rewind.
      id: 'clear-dock',
      text: 'Empty the dock, then commit only README.md and src.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: [
        'empty the dock then commit readme and src',
        'unstage everything, commit the project',
      ],
      script: [
        { do: 'run', line: 'git reset', say: 'Emptying the dock. Your files stay put.' },
        { do: 'run', line: 'git add README.md src' },
        { do: 'run', line: 'git commit -m "feat: add notes app"' },
      ],
      claim: 'Fixed: the first commit holds only README.md and src.',
      lesson: 'git reset only empties the dock. Then only the project went on, and into the Vault.',
    },
  ],
  hintPlan: 'status-first',
  check: {
    question: 'What does the latest commit in the Vault hold?',
    // Split by two questions: is there a commit, and does it hold todo.txt?
    options: [
      {
        id: 'project',
        text: 'README.md and src, with todo.txt left out',
        truth: {
          kind: 'all',
          of: [
            { kind: 'commitCount', min: 1 },
            { kind: 'not', predicate: todoAtHead },
          ],
        },
        feedback: 'git log shows the commit, and git status still lists todo.txt as untracked.',
      },
      {
        id: 'todo-too',
        text: 'The project, plus your todo.txt',
        truth: todoAtHead,
        feedback: 'git add . loads every crate. todo.txt rode into the commit.',
      },
      {
        id: 'empty',
        text: 'Nothing: the Vault has no commits yet',
        truth: noCommits,
        feedback: 'git log says there are no commits yet. Staged files are not saved.',
      },
    ],
  },
  guards: [todoOut, todoNeverCommitted, todoKept],
  looks: gitLooks,
};

/**
 * Step 3: the same trip again, for an edit. The okay card commits without staging, so
 * git finds an empty dock; the weak card sweeps todo.txt in once more.
 */
const commitEdit: AgentTaskInput = {
  before: [{ op: 'write', path: 'README.md', content: `${README}\n${RUN_LINE}` }],
  note: 'You added a line to README.md saying how to run the app.',
  plans: [
    {
      id: 'commit-changes',
      text: 'Commit all my changes.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['commit all my changes', 'commit everything'],
      script: [
        { do: 'run', line: 'git add .', say: 'Loading all your changes.' },
        { do: 'run', line: 'git commit -m "update"' },
      ],
      claim: 'Done: all your changes are committed.',
      lesson:
        'git add . loaded todo.txt again, and the commit sealed it into history. Only Rewind takes that back.',
      slip: 'too-broad',
    },
    {
      id: 'just-commit',
      text: 'Commit my README change as docs: explain how to run.',
      quality: 'okay',
      covers: ['goal', 'limits'],
      intents: ['commit my readme change', 'docs: explain how to run'],
      script: [
        { do: 'run', line: 'git commit -m "docs: explain how to run the app"', fails: true },
      ],
      claim: 'Done: your README change is committed.',
      lesson:
        'The edit was only on the Workbench. git commit found an empty dock and saved nothing.',
      slip: 'overclaim',
    },
    {
      id: 'add-readme',
      text: 'Check status, stage only README.md, commit as docs: explain how to run.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['stage only readme then commit', 'check status, stage readme'],
      script: [
        { do: 'run', line: 'git status', say: 'Checking what changed first.' },
        { do: 'run', line: 'git add README.md' },
        { do: 'run', line: 'git commit -m "docs: explain how to run the app"' },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: your README edit is in a new commit.',
      lesson:
        'Same trip as before: Workbench, Loading Dock, Vault. todo.txt never left the Workbench.',
    },
  ],
  fixes: [
    {
      id: 'stage-readme',
      text: 'Stage README.md first, then commit as docs: explain how to run.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['stage readme first', 'add readme then commit'],
      script: [
        { do: 'run', line: 'git add README.md' },
        { do: 'run', line: 'git commit -m "docs: explain how to run the app"' },
      ],
      claim: 'Fixed: your README edit is committed.',
      lesson: 'An edit has to be loaded onto the dock again before a commit can seal it.',
    },
    {
      // For a dock that holds todo.txt: git add . allowed, its commit denied. git reset
      // only empties the dock, so after any other miss it changes nothing.
      id: 'clear-dock-readme',
      text: 'Empty the dock, then commit only README.md.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['empty the dock then commit readme', 'unstage everything, commit readme'],
      script: [
        { do: 'run', line: 'git reset', say: 'Emptying the dock. Your files stay put.' },
        { do: 'run', line: 'git add README.md' },
        { do: 'run', line: 'git commit -m "docs: explain how to run the app"' },
      ],
      claim: 'Fixed: your README edit is committed, todo.txt is not.',
      lesson: 'git reset only empties the dock. Then README.md alone went on, and into the Vault.',
    },
  ],
  hintPlan: 'add-readme',
  check: {
    question: 'Where is your README.md edit now?',
    // Split by two questions: is the edit in the latest commit, and is todo.txt?
    options: [
      {
        id: 'committed',
        text: 'In a new commit, with todo.txt left out',
        truth: { kind: 'all', of: [readmeEditAtHead, { kind: 'not', predicate: todoAtHead }] },
        feedback: 'git log shows the new commit, and todo.txt is still untracked.',
      },
      {
        id: 'with-todo',
        text: 'In a new commit that also holds todo.txt',
        truth: { kind: 'all', of: [readmeEditAtHead, todoAtHead] },
        feedback: 'git add . loaded todo.txt again, and the commit sealed it.',
      },
      {
        id: 'workbench',
        text: 'Only on the Workbench: no commit holds it',
        truth: { kind: 'not', predicate: readmeEditAtHead },
        feedback: 'git status still lists README.md as modified. Nothing was staged.',
      },
    ],
  },
  guards: [todoOut, todoNeverCommitted, todoKept],
  looks: gitLooks,
};

/** A Quillwork repo after the first commit, with todo.txt still loose. */
const committedProject = () =>
  repo()
    .commit('feat: add notes app', { 'README.md': README, 'src/app.ts': APP })
    .write('todo.txt', TODO);

/**
 * Judgment drills on git scenes. No drill names its answer: the engine finds each key by
 * running the drill. Two keep their typed-era ids, since the placement test draws them.
 */
const drills: JudgmentDrillInput[] = [
  {
    kind: 'approve',
    id: 'rooms-approve-add-all',
    prompt: 'Otto wants to stage everything. Allow?',
    concept: 'staging',
    setup: repo()
      .write('README.md', README)
      .write('src/app.ts', APP)
      .write('todo.txt', TODO)
      .toSpec(),
    action: { do: 'run', line: 'git add .', say: 'Loading every file onto the dock.' },
    guards: [todoOut],
    explain: 'git add . loads every crate, your todo.txt included. Deny, and name the files.',
  },
  {
    kind: 'approve',
    id: 'rooms-approve-add-readme',
    prompt: 'Otto wants to stage your README.md edit. Allow?',
    concept: 'staging',
    setup: committedProject().write('README.md', `${README}\n${RUN_LINE}`).toSpec(),
    action: { do: 'run', line: 'git add README.md', say: 'Loading README.md onto the dock.' },
    guards: [todoOut],
    explain: 'git add README.md loads one crate. todo.txt stays on the Workbench.',
  },
  {
    kind: 'predict',
    id: 'rooms-stage-folder',
    prompt: 'Otto is about to run this. What lands on the Loading Dock?',
    concept: 'staging',
    setup: repo()
      .commit('chore: add readme', { 'README.md': README })
      .write('src/header.ts', HEADER_V1)
      .write('src/footer.ts', "export const footer = '<footer>Quillwork AI</footer>';\n")
      .write('scratch.txt', 'ideas for later\n')
      .toSpec(),
    action: { do: 'run', line: 'git add src' },
    options: [
      {
        id: 'src-only',
        text: 'header.ts and footer.ts, nothing else',
        outcome: {
          state: { kind: 'staged', paths: ['src/header.ts', 'src/footer.ts'], exact: true },
        },
      },
      {
        id: 'everything',
        text: 'Both src files, and scratch.txt too',
        outcome: { state: { kind: 'staged', paths: ['scratch.txt'] } },
      },
      {
        id: 'error',
        text: 'Nothing: git add needs file names, not folders',
        outcome: { result: 'error' },
      },
    ],
    explain: 'A folder name loads everything inside it, and only that. scratch.txt stays loose.',
  },
  {
    kind: 'predict',
    id: 'rooms-commit-staged-only',
    prompt: 'Otto is about to commit. What does the commit hold?',
    concept: 'commit',
    setup: repo()
      .commit('feat: add header', { 'README.md': README, 'src/header.ts': HEADER_V1 })
      .write('README.md', `${README}\n${RUN_LINE}`)
      .stage('README.md')
      .write('src/header.ts', HEADER_V2)
      .toSpec(),
    history: [{ do: 'run', line: 'git status' }],
    action: { do: 'run', line: 'git commit -m "docs: add run command"' },
    options: [
      {
        id: 'readme-only',
        text: 'Only README.md: the header.ts edit stays behind',
        outcome: {
          state: {
            kind: 'all',
            of: [
              { kind: 'commitChanged', paths: ['README.md'], only: true },
              { kind: 'modified', paths: ['src/header.ts'] },
            ],
          },
        },
      },
      {
        id: 'both',
        text: 'README.md and the header.ts edit',
        outcome: { state: { kind: 'commitChanged', paths: ['src/header.ts'] } },
      },
      { id: 'error', text: 'Nothing: it fails', outcome: { result: 'error' } },
    ],
    explain: 'A commit seals only what is on the dock. The header.ts edit was never staged.',
  },
  {
    kind: 'diagnose',
    id: 'rooms-diagnose-staged',
    prompt: 'Otto says your edit is saved. Is he right?',
    concept: 'commit',
    setup: committedProject().write('README.md', `${README}\n${RUN_LINE}`).toSpec(),
    history: [{ do: 'run', line: 'git add README.md' }],
    claim: 'Done: your README edit is saved in git.',
    options: [
      {
        id: 'on-dock',
        text: 'Not yet: it waits on the Loading Dock',
        truth: {
          kind: 'all',
          of: [
            { kind: 'staged', paths: ['README.md'] },
            { kind: 'not', predicate: readmeEditAtHead },
          ],
        },
      },
      { id: 'in-vault', text: 'Yes: it is in the latest commit', truth: readmeEditAtHead },
      {
        id: 'lost',
        text: 'No: the edit is gone',
        truth: {
          kind: 'not',
          predicate: { kind: 'workingFile', path: 'README.md', contains: 'npm start' },
        },
      },
    ],
    explain: 'git add only loads the dock. Until git commit runs, the Vault holds the old README.',
  },
  {
    kind: 'diagnose',
    id: 'rooms-diagnose-no-repo',
    prompt: 'Otto says the project is saved. Is he right?',
    concept: 'init',
    setup: folder().write('index.html', '<h1>Quillwork</h1>\n').toSpec(),
    history: [{ do: 'run', line: 'git add .' }],
    claim: 'Done: the project is saved in git.',
    options: [
      {
        id: 'no-repo',
        text: 'No: there is no repository yet',
        truth: { kind: 'not', predicate: { kind: 'isRepo' } },
      },
      {
        id: 'on-dock',
        text: 'Partly: the files wait on the dock',
        truth: { kind: 'staged', paths: ['index.html'] },
      },
      {
        id: 'saved',
        text: 'Yes: they are in a first commit',
        truth: { kind: 'commitCount', min: 1 },
      },
    ],
    explain: 'git add failed: git only works inside a repository, and git init makes one.',
  },
  {
    kind: 'fix',
    id: 'rooms-fix-todo-staged',
    prompt: 'todo.txt is on the dock by mistake. Which fix is right?',
    concept: 'staging',
    setup: committedProject()
      .write('README.md', `${README}\n${RUN_LINE}`)
      .stage('README.md', 'todo.txt')
      .toSpec(),
    goal: {
      kind: 'all',
      of: [
        { kind: 'staged', paths: ['README.md'] },
        { kind: 'untracked', paths: ['todo.txt'] },
      ],
    },
    failIf: [{ kind: 'not', predicate: todoKept }],
    options: [
      {
        id: 'restore-staged',
        text: 'git restore --staged todo.txt',
        script: [{ do: 'run', line: 'git restore --staged todo.txt' }],
      },
      {
        id: 'commit',
        text: 'Commit now, and sort it out later',
        script: [{ do: 'run', line: 'git commit -m "update"' }],
      },
      {
        id: 'rm-force',
        text: 'git rm -f todo.txt',
        script: [{ do: 'run', line: 'git rm -f todo.txt' }],
      },
    ],
    explain:
      'restore --staged takes a crate off the dock and leaves the file alone. rm -f deletes it.',
  },
];

export const threeRooms: MissionInput = {
  id: 'three-rooms',
  act: 2,
  title: 'Three Rooms',
  xp: 100,
  approvals: 'changes',
  briefing: {
    sceneId: 'three-rooms',
    captions: [
      'Every file starts as a crate on the Workbench. Git can see it, but nothing is saved yet.',
      'git add carries a crate to the Loading Dock: the next commit, packed and waiting.',
      'git commit seals the dock into the Vault as a snapshot you can always come back to.',
    ],
    diagram: 'workbench-dock-vault',
  },
  initialRepoState: folder()
    .write('README.md', README)
    .write('src/app.ts', APP)
    .write('src/styles.css', STYLES)
    .write('todo.txt', TODO)
    .toSpec(),
  steps: [
    {
      id: 'start-tracking',
      instruction: 'Quillwork has no history yet. Have Otto turn the folder into a git repository.',
      success: { kind: 'isRepo', label: 'The folder is a git repository' },
      hints: [
        'Can git stage or save anything in a folder it is not tracking yet?',
        'git init creates a hidden .git folder: an empty Loading Dock and Vault for this project.',
        'Pick the card that runs git init, then shows git status.',
      ],
      agent: startTracking,
    },
    {
      id: 'first-commit',
      instruction:
        'Make the first commit: README.md and everything in src/. todo.txt is your personal list, so it stays out.',
      success: {
        kind: 'all',
        of: [projectAtHead, todoOut, todoNeverCommitted],
        label: 'README.md and src are committed, todo.txt is not',
      },
      hints: [
        'Which crates belong in the Vault, and which one is only yours?',
        'A commit seals exactly what is on the Loading Dock. git add . loads every crate, todo.txt too.',
        'Pick the card that checks git status, then stages only README.md and src.',
      ],
      agent: firstCommit,
    },
    {
      id: 'commit-edit',
      instruction: 'Get your README.md edit into a new commit. todo.txt still stays out.',
      success: {
        kind: 'all',
        of: [readmeEditAtHead, todoOut, todoNeverCommitted, { kind: 'commitCount', min: 2 }],
        label: 'The README.md edit is committed, todo.txt is not',
      },
      hints: [
        'The edit is on the Workbench. Which two rooms does it still have to pass through?',
        'Git never saves edits on its own. Each change is staged with add, then sealed with commit.',
        'Pick the card that stages only README.md, then commits.',
      ],
      agent: commitEdit,
    },
  ],
  drills,
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Get the landing page into git',
      body: 'Design finished the new landing page. Can you get it into git today? Everything is in the shared folder. Should be quick!',
    },
    candidates: [
      {
        id: 'which-files',
        text: 'Which files in the shared folder are the page itself, and which are exports, drafts, or private files?',
        quality: 'strong',
        rationale:
          'Decides what belongs in the Vault, since drafts, exports, and secrets should never be committed.',
      },
      {
        id: 'which-repo',
        text: 'Should the page live in our existing web repository, or in a new one?',
        quality: 'strong',
        rationale: 'Changes where you run git init, and whether you run it at all.',
      },
      {
        id: 'done-means',
        text: 'Does "in git" mean committed on my machine, or shared where the team can see it?',
        quality: 'okay',
        rationale: 'Clarifies the finish line, but not what goes into the first commit.',
      },
      {
        id: 'who-else',
        text: 'Is anyone else editing these files right now?',
        quality: 'okay',
        rationale: "Avoids clobbering someone's work, but doesn't change what you commit.",
      },
      {
        id: 'old-versions',
        text: 'Do we need the old versions of the design, or just the final files?',
        quality: 'okay',
        rationale:
          'Worth a quick check, though one clean first commit of the final files is usually right.',
      },
      {
        id: 'drag-and-drop',
        text: 'Can I use a drag-and-drop app instead of the terminal?',
        quality: 'weak',
        rationale: 'A question about your tools that Marco cannot answer, but Sage can.',
      },
      {
        id: 'commit-message',
        text: 'What should my commit message say?',
        quality: 'weak',
        rationale: 'That one is your call, since Marco cares what ships, not the wording.',
      },
      {
        id: 'why-git',
        text: 'Why does a landing page even need git?',
        quality: 'weak',
        rationale: 'Sounds like pushback, and it does not help you do the task well.',
      },
    ],
    rubric:
      'A strong question separates the real source files from exports, drafts, and secrets, or confirms which repository the page belongs in before running git init.',
  },
};
