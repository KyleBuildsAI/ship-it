import { folder, repo } from '../../engine/git/fixtures';
import type { MissionInput } from '../../game/missions/schema';

/**
 * Mission 2.1: the three areas every change travels through. Workbench (working tree),
 * Loading Dock (index), Vault (history), with init, status, add, and commit.
 */

const README = '# Quillwork Notes\n\nA tiny note-taking app.\n';
const APP =
  "import './styles.css';\n\nexport function addNote(text: string): string {\n  return text.trim();\n}\n";
const STYLES = 'body {\n  font-family: system-ui, sans-serif;\n}\n';
// A personal file that has no business in the project's history.
const TODO = '- buy coffee\n- ask Sage what HEAD means\n';

const HEADER_V1 = "export const header = '<h1>Quillwork</h1>';\n";
const HEADER_V2 = "export const header = '<h1>Quillwork Notes</h1>';\n";

export const threeRooms: MissionInput = {
  id: 'three-rooms',
  act: 2,
  title: 'Three Rooms',
  xp: 100,
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
      id: 'init',
      instruction:
        'Sage: "This project has no history yet. Turn the folder into a git repository."',
      success: { kind: 'isRepo' },
      hints: [
        'Which git command starts tracking a brand-new folder?',
        'git init creates a hidden .git folder: an empty Loading Dock and Vault for this project.',
        'Run: git init',
      ],
    },
    {
      id: 'stage-project',
      instruction:
        'Run git status to see the unlabeled crates. Stage README.md and everything in src/. Leave todo.txt on the Workbench: it is your personal list.',
      success: {
        kind: 'staged',
        paths: ['README.md', 'src/app.ts', 'src/styles.css'],
        exact: true,
        label: 'Only README.md and src/ are on the Loading Dock',
      },
      hints: [
        'Which room does a crate visit before the Vault, and which command carries it there?',
        'git add takes file or folder names, and a folder brings everything inside it. Staged too much before your first commit? git rm --cached <file> takes a crate back.',
        'Run: git add README.md src',
      ],
    },
    {
      id: 'first-commit',
      instruction:
        'Seal the Loading Dock into the Vault with your first commit. Give it a short message.',
      success: {
        kind: 'all',
        of: [
          { kind: 'tracked', paths: ['README.md', 'src/app.ts', 'src/styles.css'] },
          { kind: 'notTracked', paths: ['todo.txt'] },
        ],
      },
      hints: [
        'What turns the Loading Dock into a permanent snapshot?',
        'A commit records exactly what is staged, plus a message saying why. Crates left on the Workbench stay behind.',
        'Run: git commit -m "feat: add notes app"',
      ],
    },
    {
      id: 'edit-readme',
      instruction:
        'Add a line to README.md saying how to run the app. Then run git status: the crate now glows amber as modified.',
      success: {
        kind: 'any',
        label: 'README.md has a new change',
        of: [
          { kind: 'modified', paths: ['README.md'] },
          { kind: 'staged', paths: ['README.md'] },
        ],
      },
      hints: [
        'How could you add a line to the end of a file from the terminal?',
        'In PowerShell, >> appends text to a file. You can also open it in the editor with code README.md.',
        'Run: echo "Run it with npm start." >> README.md',
      ],
    },
    {
      id: 'commit-edit',
      instruction:
        'Stage README.md again and commit it. Every change makes the same trip: Workbench, Loading Dock, Vault. todo.txt still stays out.',
      success: {
        kind: 'all',
        of: [
          { kind: 'commitCount', min: 2 },
          { kind: 'commitChanged', paths: ['README.md'] },
          { kind: 'notTracked', paths: ['todo.txt'] },
        ],
      },
      hints: [
        'The file is modified on the Workbench. Which two commands get it into the Vault?',
        'Git does not save edits on its own. Each change is staged with add, then sealed with commit.',
        'Run: git add README.md, then git commit -m "docs: explain how to run the app"',
      ],
    },
  ],
  drills: [
    {
      id: 'rooms-init',
      prompt: 'Start tracking this folder with git.',
      setup: folder().write('index.html', '<h1>Quillwork</h1>\n').toSpec(),
      success: { kind: 'isRepo' },
      timeLimitSeconds: 45,
      concept: 'init',
    },
    {
      id: 'rooms-stage-one',
      prompt: 'Stage src/app.ts and nothing else. notes.txt stays on the Workbench.',
      setup: repo().write('src/app.ts', APP).write('notes.txt', 'Call the dentist.\n').toSpec(),
      success: { kind: 'staged', paths: ['src/app.ts'], exact: true },
      timeLimitSeconds: 45,
      concept: 'staging',
    },
    {
      id: 'rooms-stage-folder',
      prompt: 'Stage everything inside src/, and nothing outside it.',
      setup: repo()
        .commit('chore: add readme', { 'README.md': README })
        .write('src/header.ts', HEADER_V1)
        .write('src/footer.ts', "export const footer = '<footer>Quillwork AI</footer>';\n")
        .write('scratch.txt', 'ideas for later\n')
        .toSpec(),
      success: { kind: 'staged', paths: ['src/header.ts', 'src/footer.ts'], exact: true },
      timeLimitSeconds: 60,
      concept: 'staging',
    },
    {
      id: 'rooms-first-commit',
      prompt: 'Make the first commit, with both index.html and style.css in it.',
      setup: repo()
        .write('index.html', '<h1>Quillwork</h1>\n')
        .write('style.css', 'h1 {\n  color: gold;\n}\n')
        .toSpec(),
      success: { kind: 'tracked', paths: ['index.html', 'style.css'] },
      timeLimitSeconds: 60,
      concept: 'commit',
    },
    {
      id: 'rooms-commit-staged-only',
      prompt:
        'Commit only what is already on the Loading Dock. The unstaged edit to src/header.ts must stay out of the commit.',
      setup: repo()
        .commit('feat: add header', { 'README.md': README, 'src/header.ts': HEADER_V1 })
        .write('README.md', `${README}\nRun it with npm start.\n`)
        .stage('README.md')
        .write('src/header.ts', HEADER_V2)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'fileAtHead', path: 'README.md', contains: 'npm start' },
          { kind: 'fileAtHead', path: 'src/header.ts', equals: HEADER_V1 },
          { kind: 'modified', paths: ['src/header.ts'] },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'commit',
    },
    {
      id: 'rooms-clean-tree',
      prompt: 'Commit every change, new file included, so git status says the tree is clean.',
      setup: repo()
        .commit('feat: add header', { 'src/header.ts': HEADER_V1 })
        .modify('src/header.ts', HEADER_V2)
        .untracked('src/footer.ts', "export const footer = '<footer>Quillwork AI</footer>';\n")
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'clean' },
          { kind: 'tracked', paths: ['src/footer.ts'] },
          { kind: 'fileAtHead', path: 'src/header.ts', equals: HEADER_V2 },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'commit',
    },
  ],
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
