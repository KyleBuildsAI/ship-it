import type { Predicate } from '../../game/missions/predicates';
import type { MissionInput } from '../../game/missions/schema';
import { API, HOME, laptop, QW, WEB } from './shared';

/**
 * Mission 1.1, Where Things Live (docs/act1-directed.md section 3): every command runs in a
 * folder, and a terminal stands in one. A bare name starts there; a full path works from
 * anywhere; a fresh terminal starts at home. Kyle directs Otto with request cards, then
 * checks where things really landed. Nothing here says which answer is right: the engine
 * works that out from the laptop, and agent.test.ts plays every card to prove it.
 */

/** The full paths Otto types, as Windows spells them. */
const API_PATH = 'C:\\Users\\kyle\\quillwork\\api';
const WEB_PATH = 'C:\\Users\\kyle\\quillwork\\web';

const API_INTACT = {
  kind: 'driveFile',
  path: `${API}/package.json`,
  label: 'The API is intact',
} as const;

const apiNotes = { kind: 'driveFolder', path: `${API}/notes` } as const;
const homeNotes = { kind: 'driveFolder', path: `${HOME}/notes` } as const;
const webNotes = { kind: 'driveFolder', path: `${WEB}/notes` } as const;
const apiWeb = { kind: 'driveFolder', path: `${API}/web` } as const;

/** Where a terminal stands: the active one, or the tab with that number, or any tab. */
const standsIn = (path: string, tab?: number | 'any'): Predicate =>
  tab === undefined ? { kind: 'currentDirectory', path } : { kind: 'currentDirectory', path, tab };

const missing = <P extends { readonly kind: 'driveFolder' | 'driveFile' }>(found: P) => ({
  ...found,
  exists: false,
});

export const whereThingsLive: MissionInput = {
  id: 'where-things-live',
  act: 1,
  title: 'Where Things Live',
  xp: 100,
  approvals: 'destructive',
  briefing: {
    sceneId: 'machine-island',
    captions: [
      'The Quillwork API must run on your laptop by Friday. Otto, our coding agent, types. You direct and check.',
      'Every terminal stands in one folder. The prompt shows it: PS C:\\Users\\kyle> is your home folder.',
      'A bare name like notes starts there. A full path like C:\\Users\\kyle\\quillwork\\api works from anywhere.',
    ],
    diagram: 'folder-terraces',
  },
  initialRepoState: laptop().toSpec(),
  steps: [
    {
      id: 'stand-in-the-api',
      instruction:
        "The API lives under your home folder. Get Otto's terminal standing in its folder.",
      success: { ...standsIn(API), label: 'The terminal stands in the API' },
      hints: [
        'Read the prompt. Which folder does the terminal stand in right now?',
        'A bare name like api starts in that folder. A full path works from anywhere.',
        'Pick the card with the full path C:\\Users\\kyle\\quillwork\\api.',
      ],
      agent: {
        focus: [HOME, API],
        plans: [
          {
            id: 'guess',
            text: 'Go to the api folder.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['go to the api folder', 'cd api', 'open the api'],
            script: [{ do: 'run', line: 'cd api', fails: true }],
            claim: "Done: I'm in the API folder.",
            lesson: 'cd api looked for api inside home, where the terminal stood. It failed.',
            slip: 'overclaim',
          },
          {
            id: 'step-by-step',
            text: 'Go into quillwork, then into api.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['go into quillwork', 'then into api', 'one folder at a time'],
            script: [
              { do: 'run', line: 'cd quillwork' },
              { do: 'run', line: 'cd api' },
            ],
            claim: "Done: I'm in the API folder.",
            lesson: 'It worked because Otto started at home. From anywhere else, it would fail.',
          },
          {
            id: 'full-path',
            text: `Go to ${API_PATH}, then show where you are.`,
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['full path to the api', 'show where you are', 'get-location'],
            script: [
              { do: 'run', line: `cd ${API_PATH}` },
              { do: 'run', line: 'Get-Location' },
            ],
            claim: "Done: I'm in the API folder.",
            lesson: 'A full path works from any folder, and Get-Location proves it.',
          },
        ],
        fixes: [
          {
            id: 'fix-full-path',
            text: `You're still at home. Go to ${API_PATH}.`,
            quality: 'strong',
            covers: ['goal', 'place'],
            intents: ['still at home', 'go to the full path'],
            script: [{ do: 'run', line: `cd ${API_PATH}` }],
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
              text: API_PATH,
              truth: standsIn(API),
              feedback: 'Right: the prompt names the API folder.',
            },
            {
              id: 'home',
              text: 'Still C:\\Users\\kyle: the cd failed',
              truth: standsIn(HOME),
              feedback: 'Read the prompt: it names the folder the terminal stands in.',
            },
          ],
        },
        guards: [API_INTACT],
        looks: [
          { id: 'where', label: 'Where is Otto?', line: 'Get-Location' },
          { id: 'home', label: 'List home', line: 'Get-ChildItem C:\\Users\\kyle' },
        ],
      },
    },
    {
      id: 'notes-in-the-api',
      instruction:
        'Have Otto make a notes folder inside the API project for your onboarding notes.',
      success: { ...apiNotes, label: 'The API has a notes folder' },
      hints: [
        'When a terminal opens fresh, which folder does it stand in?',
        'Fresh terminals start at home. A bare name like notes lands wherever the terminal stands.',
        'Pick the card with the full path C:\\Users\\kyle\\quillwork\\api\\notes.',
      ],
      agent: {
        before: [{ op: 'restartTerminals' }],
        note: "Your laptop restarted overnight. Otto's terminal opened fresh, at home.",
        focus: [API, `${HOME}/notes`],
        plans: [
          {
            id: 'bare-name',
            text: 'Make a notes folder for the API.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['make a notes folder', 'notes folder for the api', 'create notes'],
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
            lesson:
              'A fresh terminal stands at home, so notes landed in C:\\Users\\kyle. The Directory line said so.',
            slip: 'wrong-place',
          },
          {
            id: 'full-path',
            text: `Make ${API_PATH}\\notes.`,
            quality: 'strong',
            covers: ['goal', 'place'],
            intents: ['full path', 'c:\\users\\kyle\\quillwork\\api\\notes'],
            script: [{ do: 'run', line: `mkdir ${API_PATH}\\notes` }],
            claim: 'Done: notes is in the API.',
            lesson: 'A full path lands in one place, whatever folder the terminal stands in.',
          },
          {
            id: 'go-then-make',
            text: 'Go to the API folder, make notes there, then list it.',
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['go to the api', 'then list', 'cd then mkdir'],
            script: [
              { do: 'run', line: `cd ${API_PATH}` },
              { do: 'run', line: 'mkdir notes' },
              { do: 'run', line: 'Get-ChildItem' },
            ],
            claim: 'Done: notes is in the API, see the listing.',
            lesson: 'Going there first, then listing, gives you proof on screen.',
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
              // A delete, so it pauses for approval. Only the empty stray goes: it's safe.
              { do: 'run', line: 'Remove-Item C:\\Users\\kyle\\notes' },
              { do: 'run', line: `mkdir ${API_PATH}\\notes` },
            ],
            claim: 'Fixed: notes is in the API, and home is tidy.',
            lesson: 'Direct the cleanup too: full paths make a fix land exactly where you mean.',
          },
          {
            id: 'just-redo',
            text: `Make ${API_PATH}\\notes too.`,
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['make it in the api too', 'also make'],
            script: [{ do: 'run', line: `mkdir ${API_PATH}\\notes` }],
            claim: 'Done: notes is in the API.',
            lesson: 'The API has notes now, but the stray folder at home is still there.',
          },
        ],
        hintPlan: 'full-path',
        check: {
          question: 'Where did notes land?',
          options: [
            {
              id: 'api',
              text: 'Only in the API folder',
              truth: { kind: 'all', of: [apiNotes, missing(homeNotes)] },
              feedback: 'Right: the Directory line shows the API folder.',
            },
            {
              id: 'home',
              text: 'In C:\\Users\\kyle, where fresh terminals start',
              truth: { kind: 'all', of: [homeNotes, missing(apiNotes)] },
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
        guards: [{ ...missing(homeNotes), label: 'No stray notes folder at home' }, API_INTACT],
        looks: [
          { id: 'where', label: 'Where is Otto?', line: 'Get-Location' },
          { id: 'home', label: 'List home', line: 'Get-ChildItem C:\\Users\\kyle' },
        ],
      },
    },
    {
      id: 'web-notes',
      instruction: 'The web app sits next to the API. Have Otto give it a notes folder too.',
      success: { ...webNotes, label: 'The web app has a notes folder' },
      hints: [
        'Otto stands in the API. Is web inside it, or next to it?',
        '..\\ means one folder up, so ..\\web is the folder next door. A full path works too.',
        'Pick the card that makes ..\\web\\notes, one folder up.',
      ],
      agent: {
        before: [{ op: 'cd', path: API }],
        note: 'Otto is back in the API folder.',
        focus: [QW, WEB, API],
        plans: [
          {
            id: 'by-name',
            text: 'Make web\\notes.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['make web notes', 'web\\notes'],
            script: [{ do: 'run', line: 'mkdir web\\notes' }],
            claim: 'Done: the web app has notes.',
            lesson: 'A bare web\\notes starts in the API, so Otto made a new web folder inside it.',
            slip: 'wrong-place',
          },
          {
            id: 'one-up',
            text: 'Make ..\\web\\notes, one folder up, then list ..\\web.',
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['one folder up', 'dot dot web', 'then list web'],
            script: [
              { do: 'run', line: 'mkdir ..\\web\\notes' },
              { do: 'run', line: 'Get-ChildItem ..\\web' },
            ],
            claim: 'Done: notes is in the web app, see the listing.',
            lesson: '..\\ climbs one folder first, so ..\\web is the web app next door.',
          },
          {
            id: 'full',
            text: `Make ${WEB_PATH}\\notes.`,
            quality: 'strong',
            covers: ['goal', 'place'],
            intents: ['full path to web notes', 'c:\\users\\kyle\\quillwork\\web\\notes'],
            script: [{ do: 'run', line: `mkdir ${WEB_PATH}\\notes` }],
            claim: 'Done: notes is in the web app.',
            lesson: 'A full path lands in one place, wherever the terminal stands.',
          },
        ],
        fixes: [
          {
            id: 'tidy-web',
            text: 'Delete the stray web folder here, then make ..\\web\\notes.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['delete the stray web folder', 'remove api web'],
            script: [
              // A delete, so it pauses: it takes api\web and the notes inside. Both are stray.
              { do: 'run', line: 'Remove-Item web -Recurse' },
              { do: 'run', line: 'mkdir ..\\web\\notes' },
            ],
            claim: 'Fixed: notes is in the web app, and the API is tidy.',
            lesson: 'Clean up the stray folder, then aim one folder up.',
          },
        ],
        hintPlan: 'one-up',
        check: {
          question: "Where is web's notes folder?",
          options: [
            {
              id: 'next-door',
              text: 'Next door, in quillwork\\web\\notes',
              truth: { kind: 'all', of: [webNotes, missing(apiWeb)] },
              feedback: 'Right: the listing of ..\\web shows notes.',
            },
            {
              id: 'inside',
              text: 'Inside the API, in api\\web\\notes',
              truth: { kind: 'all', of: [apiWeb, missing(webNotes)] },
              feedback: 'The Directory line names the API: a bare web\\notes started there.',
            },
            {
              id: 'both',
              text: 'In both places',
              truth: { kind: 'all', of: [apiWeb, webNotes] },
              feedback: 'The web app has notes, but a stray web folder sits inside the API too.',
            },
          ],
        },
        guards: [{ ...missing(apiWeb), label: 'No stray web folder in the API' }, API_INTACT],
        looks: [
          { id: 'web', label: 'List the web app', line: `Get-ChildItem ${WEB_PATH}` },
          { id: 'api', label: 'List the API', line: `Get-ChildItem ${API_PATH}` },
        ],
      },
    },
    {
      id: 'two-terminals',
      instruction:
        "Open a second terminal for the web app, in quillwork\\web. Otto's first terminal stays in the API.",
      success: { ...standsIn(WEB, 'any'), label: 'A terminal stands in the web app' },
      hints: [
        'Opening a terminal is one thing. Where does a new one stand?',
        'A new terminal starts at home. Moving terminal 1 leaves the API behind.',
        'Pick the card that opens terminal 2 in the web app and keeps terminal 1 here.',
      ],
      agent: {
        before: [{ op: 'cd', path: API }],
        focus: [API, WEB, HOME],
        plans: [
          {
            id: 'open-one',
            text: 'Open a terminal for the web app.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['open a terminal', 'new terminal for web'],
            script: [{ do: 'newTerminal', say: 'Opening a terminal for the web app.' }],
            claim: 'Done: terminal 2 is in web.',
            lesson: 'A new terminal starts at home. Opening one is not the same as going to web.',
            slip: 'overclaim',
          },
          {
            id: 'move-here',
            text: `Go to ${WEB_PATH}.`,
            quality: 'weak',
            covers: ['goal', 'place'],
            intents: ['go to web', 'cd to the web app'],
            script: [{ do: 'run', line: `cd ${WEB_PATH}` }],
            claim: 'Done: a terminal is in web.',
            lesson: 'Otto moved terminal 1, so nothing stands in the API anymore.',
            slip: 'wrong-place',
          },
          {
            id: 'open-and-go',
            text: `Open terminal 2 in ${WEB_PATH}. Keep terminal 1 here.`,
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['open terminal 2 in web', 'keep terminal 1 here'],
            script: [
              { do: 'newTerminal' },
              { do: 'run', line: `cd ${WEB_PATH}` },
              { do: 'run', line: 'Get-Location' },
            ],
            claim: 'Done: PS 1 is in the API, PS 2 in web.',
            lesson: 'Each terminal stands in its own folder. Say which one moves, and where.',
          },
        ],
        fixes: [
          {
            id: 'go-in-new',
            text: `Now go to ${WEB_PATH} in that new terminal.`,
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['go to web in the new terminal', 'move terminal 2'],
            // No tab switch: Otto types in the active tab, which is the new one if he opened it.
            script: [{ do: 'run', line: `cd ${WEB_PATH}` }],
            claim: 'Fixed: the new terminal is in web.',
            lesson: 'Otto typed in the terminal he had open. Check which one that was.',
          },
          {
            id: 'back-and-open',
            text: 'Put terminal 1 back in the API, then open one in web.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['terminal 1 back in the api', 'then open one in web'],
            script: [
              { do: 'useTerminal', tab: 1 },
              { do: 'run', line: `cd ${API_PATH}` },
              { do: 'newTerminal' },
              { do: 'run', line: `cd ${WEB_PATH}` },
              { do: 'run', line: 'Get-Location' },
            ],
            claim: 'Fixed: PS 1 is in the API, a new one in web.',
            lesson: 'Name the terminal, then the folder. Full paths make both moves exact.',
          },
        ],
        hintPlan: 'open-and-go',
        check: {
          question: "Where do Otto's terminals stand?",
          options: [
            {
              id: 'api-and-web',
              text: 'PS 1 in the API, and a terminal in web',
              truth: { kind: 'all', of: [standsIn(API, 1), standsIn(WEB, 'any')] },
              feedback: 'Right: each tab has its own folder. The tab strip shows both.',
            },
            {
              id: 'api-and-home',
              text: 'PS 1 in the API, PS 2 still at home',
              truth: {
                kind: 'all',
                of: [
                  standsIn(API, 1),
                  standsIn(HOME, 2),
                  { kind: 'not', predicate: standsIn(WEB, 'any') },
                ],
              },
              feedback: 'A new terminal opens at home. Ask Otto where he is to see it.',
            },
            {
              id: 'moved',
              text: 'PS 1 moved to web',
              truth: standsIn(WEB, 1),
              feedback: "Otto's cd moved terminal 1. Its prompt names web now.",
            },
          ],
        },
        guards: [{ ...standsIn(API, 1), label: 'Terminal 1 stays in the API' }],
        looks: [{ id: 'where', label: 'Where is Otto?', line: 'Get-Location' }],
      },
    },
  ],
  drills: [
    {
      kind: 'predict',
      id: 'wtl-predict-typo-cd',
      prompt: 'Otto is about to run this. What happens?',
      concept: 'location',
      setup: laptop().toSpec(),
      action: { do: 'run', line: 'cd quilwork\\api' },
      options: [
        { id: 'lands', text: 'Otto lands in the API folder', outcome: { state: standsIn(API) } },
        {
          id: 'error',
          text: 'An error, and Otto stays at home',
          outcome: { result: 'error', state: standsIn(HOME) },
        },
        {
          id: 'creates',
          text: 'PowerShell makes the missing folder',
          outcome: { state: { kind: 'driveFolder', path: `${HOME}/quilwork/api` } },
        },
      ],
      explain:
        'quilwork is misspelled, so cd finds no such folder. The terminal stays where it was.',
    },
    {
      kind: 'predict',
      id: 'wtl-predict-fresh-terminal',
      prompt: 'Otto just opened a new terminal. Where will logs land?',
      concept: 'location',
      setup: laptop().cd(API).toSpec(),
      history: [{ do: 'newTerminal' }],
      action: { do: 'run', line: 'mkdir logs' },
      options: [
        {
          id: 'api',
          text: 'In the API folder',
          outcome: { state: { kind: 'driveFolder', path: `${API}/logs` } },
        },
        {
          id: 'home',
          text: 'In C:\\Users\\kyle',
          outcome: { state: { kind: 'driveFolder', path: `${HOME}/logs` } },
        },
        { id: 'fails', text: 'Nowhere: it fails', outcome: { result: 'error' } },
      ],
      explain: 'A new terminal starts at home, whatever folder the first one stands in.',
    },
    {
      kind: 'predict',
      id: 'wtl-predict-dotdot',
      prompt: "Otto stands in the API's src\\routes folder. Where does this take him?",
      concept: 'location',
      setup: laptop().cd(`${API}/src/routes`).toSpec(),
      action: { do: 'run', line: 'cd ..\\..' },
      options: [
        { id: 'api', text: 'The API folder', outcome: { state: standsIn(API) } },
        { id: 'src', text: "The API's src folder", outcome: { state: standsIn(`${API}/src`) } },
        { id: 'quillwork', text: 'The quillwork folder', outcome: { state: standsIn(QW) } },
      ],
      explain: 'Each .. climbs one folder: routes to src, then src to the API.',
    },
    {
      kind: 'diagnose',
      id: 'wtl-diagnose-no-package',
      prompt: 'Otto opened a terminal and listed package.json. Why did it fail?',
      concept: 'location',
      setup: laptop().cd(API).toSpec(),
      history: [
        { do: 'newTerminal' },
        { do: 'run', line: 'Get-ChildItem package.json', fails: true },
      ],
      options: [
        {
          id: 'home',
          text: 'The new terminal stands at home, not in the API',
          truth: {
            kind: 'all',
            of: [standsIn(HOME), { kind: 'driveFile', path: `${API}/package.json` }],
          },
        },
        {
          id: 'deleted',
          text: 'package.json was deleted',
          truth: missing({ kind: 'driveFile', path: `${API}/package.json` } as const),
        },
        { id: 'typo', text: 'Get-ChildItem only lists folders' },
      ],
      explain:
        'A new terminal starts at home. package.json is in the API folder, so a bare name misses it.',
    },
    {
      kind: 'diagnose',
      id: 'wtl-diagnose-claim-todo',
      prompt: 'Otto opened a terminal and made todo.md. Is he right?',
      concept: 'location',
      setup: laptop().cd(API).toSpec(),
      history: [{ do: 'newTerminal' }, { do: 'run', line: 'New-Item todo.md' }],
      claim: 'Done: todo.md is in the API.',
      options: [
        {
          id: 'right',
          text: "Yes: it's in the API folder",
          truth: { kind: 'driveFile', path: `${API}/todo.md` },
        },
        {
          id: 'home',
          text: "No: it's in C:\\Users\\kyle",
          truth: { kind: 'driveFile', path: `${HOME}/todo.md` },
        },
        {
          id: 'nowhere',
          text: 'No: New-Item made nothing',
          truth: {
            kind: 'all',
            of: [
              missing({ kind: 'driveFile', path: `${API}/todo.md` } as const),
              missing({ kind: 'driveFile', path: `${HOME}/todo.md` } as const),
            ],
          },
        },
      ],
      explain:
        'The new terminal stood at home, so todo.md landed there. The Directory line says so.',
    },
    {
      kind: 'fix',
      id: 'wtl-fix-web-notes',
      prompt: 'Otto stands in the API. Which direction gives the web app a notes folder?',
      concept: 'paths',
      setup: laptop().cd(API).toSpec(),
      goal: webNotes,
      failIf: [apiWeb],
      options: [
        {
          id: 'one-up',
          text: 'Make ..\\web\\notes.',
          script: [{ do: 'run', line: 'mkdir ..\\web\\notes' }],
        },
        {
          id: 'full',
          text: `Make ${WEB_PATH}\\notes.`,
          script: [{ do: 'run', line: `mkdir ${WEB_PATH}\\notes` }],
        },
        {
          id: 'by-name',
          text: 'Make web\\notes.',
          script: [{ do: 'run', line: 'mkdir web\\notes' }],
        },
        {
          id: 'cd-web',
          text: 'Go into web, then make notes.',
          script: [
            { do: 'run', line: 'cd web', fails: true },
            { do: 'run', line: 'mkdir notes' },
          ],
        },
      ],
      explain: 'web is next to the API, not inside it. ..\\web or the full path reaches it.',
    },
    {
      kind: 'approve',
      id: 'wtl-approve-stray',
      prompt: 'Otto wants to tidy up. Allow?',
      concept: 'approvals',
      setup: laptop().mkdir(`${API}/notes`).mkdir(`${HOME}/notes`).toSpec(),
      action: {
        do: 'run',
        line: 'Remove-Item C:\\Users\\kyle\\notes',
        say: 'Removing the stray notes folder at home.',
      },
      guards: [{ ...apiNotes, label: "The API's notes stay" }, API_INTACT],
      explain: 'The full path names only the empty stray at home. The API keeps its notes.',
    },
    {
      kind: 'approve',
      id: 'wtl-approve-real-notes',
      prompt: 'Otto wants to tidy up. Allow?',
      concept: 'approvals',
      setup: laptop().write(`${API}/notes/onboarding.md`, '# Week 1\n').cd(API).toSpec(),
      action: {
        do: 'run',
        line: 'Remove-Item notes -Recurse',
        say: 'Tidying the old notes folder.',
      },
      guards: [
        {
          kind: 'driveFile',
          path: `${API}/notes/onboarding.md`,
          label: 'Your onboarding notes survive',
        },
      ],
      explain:
        'Otto stands in the API, so notes is your real notes folder. -Recurse takes onboarding.md too.',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Grab the demo build',
      body: 'Can you get Otto to put the demo build where the team runs things? Should be quick!',
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
      'A strong question pins an exact absolute path for the build or its destination, or names the machine.',
  },
};
