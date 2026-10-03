import type { MissionInput } from '../../game/missions/schema';
import { API, HOME, laptop, WEB } from './shared';

/**
 * Mission 1.1, Where Things Live (docs/act1-directed.md section 3): every command runs in a
 * folder, and a terminal stands in one. A bare name starts there; a full path works from
 * anywhere. This first playable version has Kyle type the PowerShell himself; directing
 * Otto through it comes once the directed-step screens exist.
 */

const API_INTACT = {
  kind: 'driveFile',
  path: `${API}/package.json`,
  label: 'The API project is intact',
} as const;

export const whereThingsLive: MissionInput = {
  id: 'where-things-live',
  act: 1,
  title: 'Where Things Live',
  xp: 100,
  briefing: {
    sceneId: 'machine-island',
    captions: [
      'The Quillwork API has to run on your laptop by Friday. First, know where things live.',
      'Every terminal stands in one folder, and its prompt says which: PS C:\\Users\\kyle> is your home folder.',
      'A bare name like notes starts in that folder. A full path like C:\\Users\\kyle\\quillwork\\api works from anywhere.',
    ],
    diagram: 'folder-terraces',
  },
  // A logs folder already sits at home: someone ran mkdir logs in a fresh terminal.
  initialRepoState: laptop().mkdir(`${HOME}/logs`).toSpec(),
  steps: [
    {
      id: 'stand-in-the-api',
      instruction:
        'Your terminal opens at home: PS C:\\Users\\kyle>. The API lives in C:\\Users\\kyle\\quillwork\\api. Make this terminal stand in that folder.',
      success: { kind: 'currentDirectory', path: API, label: 'The terminal stands in the API' },
      hints: [
        'Read the prompt. Which folder is the terminal standing in right now?',
        'cd (Set-Location) moves a terminal. A full path works from anywhere; a bare name like api only works from the folder just above it.',
        'Run: cd C:\\Users\\kyle\\quillwork\\api',
      ],
    },
    {
      id: 'notes-in-the-api',
      instruction:
        'Make a notes folder inside the API project for your onboarding notes. Then run ls to see where it landed.',
      success: {
        kind: 'all',
        of: [
          { kind: 'driveFolder', path: `${API}/notes`, label: 'A notes folder is in the API' },
          {
            kind: 'driveFolder',
            path: `${HOME}/notes`,
            exists: false,
            label: 'No stray notes folder at home',
          },
        ],
      },
      hints: [
        'A bare name lands in the folder the terminal stands in. Where is it standing?',
        'mkdir makes a folder. ls lists the folder you stand in, with a Directory: line on top saying which.',
        'From the API folder, run: mkdir notes',
      ],
    },
    {
      id: 'web-notes',
      instruction:
        'The web app sits next to the API, in C:\\Users\\kyle\\quillwork\\web. Give it a notes folder too, without leaving the API folder.',
      success: {
        kind: 'all',
        of: [
          { kind: 'driveFolder', path: `${WEB}/notes`, label: 'The web app has a notes folder' },
          {
            kind: 'driveFolder',
            path: `${API}/web`,
            exists: false,
            label: 'No stray web folder inside the API',
          },
          { kind: 'currentDirectory', path: API, label: 'The terminal is still in the API' },
        ],
      },
      hints: [
        'web is not inside the API. Which folder holds both of them?',
        '..\\ means one folder up, so ..\\web is the folder next door. A full path works too.',
        'Run: mkdir ..\\web\\notes',
      ],
    },
    {
      id: 'tidy-home',
      instruction:
        'A logs folder landed at home, C:\\Users\\kyle\\logs, from a mkdir in a fresh terminal. Remove it, and leave the API alone.',
      success: {
        kind: 'all',
        of: [
          {
            kind: 'driveFolder',
            path: `${HOME}/logs`,
            exists: false,
            label: 'The stray logs folder is gone',
          },
          { kind: 'driveFolder', path: `${API}/notes`, label: "The API's notes folder stays" },
          API_INTACT,
        ],
      },
      hints: [
        'You stand in the API. Would Remove-Item logs find the one at home?',
        'Remove-Item deletes, and the terminal skips the Recycle Bin. A full path names exactly one folder, wherever you stand.',
        'Run: Remove-Item C:\\Users\\kyle\\logs',
      ],
    },
  ],
  drills: [
    {
      id: 'wtl-go-web',
      prompt: 'Make the terminal stand in the web app folder, C:\\Users\\kyle\\quillwork\\web.',
      setup: laptop().toSpec(),
      success: { kind: 'currentDirectory', path: WEB },
      timeLimitSeconds: 45,
      concept: 'location',
    },
    {
      id: 'wtl-logs-in-api',
      prompt: 'Make a logs folder inside the API project. Nothing new at home.',
      setup: laptop().toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'driveFolder', path: `${API}/logs` },
          { kind: 'driveFolder', path: `${HOME}/logs`, exists: false },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'paths',
    },
    {
      id: 'wtl-up-two',
      prompt: "You stand in the API's src\\routes folder. Go up to the API folder itself.",
      setup: laptop().cd(`${API}/src/routes`).toSpec(),
      success: { kind: 'currentDirectory', path: API },
      timeLimitSeconds: 45,
      concept: 'location',
    },
    {
      id: 'wtl-todo-in-web',
      prompt: 'Create an empty todo.md file in the web app folder.',
      setup: laptop().toSpec(),
      success: { kind: 'driveFile', path: `${WEB}/todo.md` },
      timeLimitSeconds: 60,
      concept: 'paths',
    },
    {
      id: 'wtl-remove-stray',
      prompt:
        'A notes folder landed at home by mistake. Remove C:\\Users\\kyle\\notes, and nothing else.',
      setup: laptop().mkdir(`${HOME}/notes`).toSpec(),
      success: {
        kind: 'all',
        of: [{ kind: 'driveFolder', path: `${HOME}/notes`, exists: false }, API_INTACT],
      },
      timeLimitSeconds: 45,
      concept: 'deleting',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Grab the demo build',
      body: 'Can you put the demo build where the team runs things? Should be quick!',
    },
    candidates: [
      {
        id: 'source-path',
        text: 'What is the exact path of the demo build right now?',
        quality: 'strong',
        rationale: 'A full path names one folder. "The demo build" could be several.',
      },
      {
        id: 'destination',
        text: 'Which exact folder, on which machine, does the team run things from?',
        quality: 'strong',
        rationale: '"Where the team runs things" is a place you have to pin down before copying.',
      },
      {
        id: 'which-build',
        text: 'Which build: the one from today, or the last one that passed?',
        quality: 'okay',
        rationale: 'Worth knowing, but it still leaves where it goes unanswered.',
      },
      {
        id: 'replace',
        text: 'If a build is already there, should mine replace it?',
        quality: 'okay',
        rationale: 'Avoids overwriting something, once you know where "there" is.',
      },
      {
        id: 'who-runs',
        text: 'Who else runs things from that folder?',
        quality: 'okay',
        rationale: 'Tells you who a change affects, but not where the folder is.',
      },
      {
        id: 'drag-it',
        text: 'Can I just drag it across in File Explorer?',
        quality: 'weak',
        rationale: 'A question about your tools, not about what Marco needs.',
      },
      {
        id: 'why-demo',
        text: 'Why do we need a demo build anyway?',
        quality: 'weak',
        rationale: 'Sounds like pushback, and it does not help you do the task well.',
      },
      {
        id: 'how-long',
        text: 'How long do you think this will take?',
        quality: 'weak',
        rationale: 'Marco asked you; the answer depends on the questions you did not ask.',
      },
    ],
    rubric:
      'A strong question pins an exact path: where the build is now, or the exact folder and machine it should go to.',
  },
};
