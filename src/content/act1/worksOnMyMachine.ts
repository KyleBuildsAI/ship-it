import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Works on My Machine: Act 1's timed final, standing in for its boss (DESIGN.md section
 * 11). Priya's laptop fails where Marco's works, and each card is the next symptom with
 * Otto's suggestion beside it, some of them traps. It checks that the habits from 1.1 to
 * 1.6 hold under a clock: read the error, fix its cause, and turn down the big hammer.
 */
export const worksOnMyMachine = {
  id: 'works-on-my-machine',
  act: 1,
  title: 'Works on My Machine',
  kind: 'final',
  // Six minutes for eight cards: 45 seconds each, enough to read an error and think.
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    'The Quillwork API works on Marco’s laptop. On Priya’s, npm run dev fails. Dex demos localhost:3000/health in six minutes.',
    'Read each error, fix its cause, run it again. Otto will suggest fixes. Some are traps.',
  ],
  cards: [
    {
      id: 'stale-terminal',
      kind: 'choose',
      situation:
        'Priya installed Node an hour ago. This terminal has been open since this morning. Otto suggests reinstalling Node.',
      artifact: {
        kind: 'error',
        label: 'PS 1',
        text: [
          'PS C:\\Users\\priya\\quillwork-api> npm run dev',
          "npm: The term 'npm' is not recognized as a name of a cmdlet, function, script file, or executable program.",
          'Check the spelling of the name, or if a path was included, verify that the path is correct and try again.',
        ].join('\n'),
      },
      question: 'What’s the fix?',
      options: [
        {
          id: 'reinstall',
          text: 'Reinstall Node, as Otto says.',
          correct: false,
          feedback:
            'Node is installed. Reinstalling changes nothing for a terminal that opened before it.',
        },
        {
          id: 'new-terminal',
          text: 'Open a new terminal. This one copied PATH before the installer added Node to it.',
          correct: true,
          feedback: 'Yes. Ten seconds, not ten minutes.',
        },
        {
          id: 'typo',
          text: 'Check the spelling of npm.',
          correct: false,
          feedback: 'It’s spelled right. “Not recognized” means not on this terminal’s PATH.',
        },
      ],
      explanation:
        'A terminal copies PATH when it opens. Anything installed after that is invisible to it. Before reinstalling anything, open a fresh terminal and try again.',
    },
    {
      // The dev script runs nodemon from node_modules, so with nothing installed it is
      // the first thing missing: this card has to come before old Node can crash anything.
      id: 'no-modules',
      kind: 'prompt',
      situation:
        'In the new terminal, npm runs, but the dev script fails. Otto suggests a clean slate.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          'PS C:\\Users\\priya\\quillwork-api> npm run dev',
          '',
          '> quillwork-api@1.0.0 dev',
          '> nodemon server.js',
          '',
          "'nodemon' is not recognized as an internal or external command,",
          'operable program or batch file.',
          'PS C:\\Users\\priya\\quillwork-api> Test-Path node_modules',
          'False',
          '',
          'otto › Let’s delete package-lock.json and reinstall everything fresh.',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'clean-slate',
          text: 'Do it. Delete package-lock.json, then run npm install so every package arrives fresh at its newest version.',
          correct: false,
          feedback:
            'Deleting the lockfile throws away the versions Marco’s laptop runs, the exact thing that works.',
        },
        {
          id: 'global',
          text: 'Install nodemon globally with -g.',
          correct: false,
          feedback:
            'That fixes one tool on one laptop. The API still needs express and the rest of its own list.',
        },
        {
          id: 'npm-ci',
          text: 'Keep the lockfile. node_modules was never installed here. Run npm ci in C:\\Users\\priya\\quillwork-api.',
          correct: true,
          feedback: 'Yes. npm ci installs exactly what the lockfile pins, the same as Marco’s.',
        },
        {
          id: 'copy',
          text: 'Copy node_modules over from Marco’s laptop.',
          correct: false,
          feedback:
            'Slow, and some packages are built for one machine. The lockfile already says what to install.',
        },
      ],
      explanation:
        'A project’s own tool “not recognized”, with no node_modules, means nothing is installed yet. Install from the project’s own list. The lockfile is how Priya gets exactly what works for Marco.',
    },
    {
      id: 'old-node-first',
      kind: 'prompt',
      situation:
        'npm ci worked. Now server.js crashes: it calls fetch, built into Node 18 and later. An old build tool put a lone Node 16 node.exe, no npm, early on her saved system PATH.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          'PS C:\\Users\\priya\\quillwork-api> npm run dev',
          '',
          '> quillwork-api@1.0.0 dev',
          '> nodemon server.js',
          '',
          '[nodemon] starting `node server.js`',
          'ReferenceError: fetch is not defined',
          '    at Object.<anonymous> (C:\\Users\\priya\\quillwork-api\\server.js:4:19)',
          '[nodemon] app crashed - waiting for file changes before starting...',
          '^C',
          'PS C:\\Users\\priya\\quillwork-api> (Get-Command node).Source',
          'C:\\tools\\buildkit\\node.exe',
          '',
          'otto › Old Node comes first on PATH. I’ll fix it for good:',
          'otto › setx PATH "C:\\Program Files\\nodejs"',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'setx',
          text: 'Approve the setx. Saving PATH fixes it for good: every new terminal finds the right Node first, and nobody hits this again.',
          correct: false,
          // Without /M, setx writes only the user PATH, and Windows puts the system PATH
          // first, so this both wipes Priya's entries and leaves old Node in front.
          feedback:
            'setx replaces Priya’s whole saved user PATH with that one folder, wiping her own entries, and the system PATH still comes first, so old Node still wins.',
        },
        {
          id: 'this-terminal',
          text: 'No setx. Put C:\\Program Files\\nodejs first on this terminal’s PATH with $env:Path, check node --version, and note the old Node 16 for Priya.',
          correct: true,
          feedback: 'Yes. A fix you can see and undo, and Priya decides about her old Node.',
        },
        {
          id: 'rewrite',
          text: 'Rewrite server.js so it doesn’t need fetch.',
          correct: false,
          feedback: 'That changes the project for everyone to dodge one laptop’s problem.',
        },
        {
          id: 'uninstall',
          text: 'Delete the build tool’s old node.exe.',
          correct: false,
          feedback: 'Her build tool may need it. That’s Priya’s call, not yours mid-demo.',
        },
      ],
      explanation:
        'The first matching folder on PATH wins. Fix the order in this terminal to get moving, and leave saved, laptop-wide changes to their owner. setx with one folder wipes her user PATH, and the system PATH comes first anyway.',
    },
    {
      id: 'no-env',
      kind: 'prompt',
      situation:
        'Next error. Priya has no .env yet. Marco DMs her the dev DATABASE_URL, password included. Otto has a suggestion.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          '[nodemon] starting `node server.js`',
          'Error: DATABASE_URL is not set',
          '    at Object.<anonymous> (C:\\Users\\priya\\quillwork-api\\server.js:9:9)',
          '[nodemon] app crashed - waiting for file changes before starting...',
          '^C',
          'PS C:\\Users\\priya\\quillwork-api> Get-ChildItem -Name -Force .env*',
          '.env.example',
          '',
          'otto › I’ll put DATABASE_URL in .env.example, so the whole team has it.',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'env-from-template',
          text: 'Copy .env.example to .env and put Marco’s DATABASE_URL in .env only. .env.example keeps names only.',
          correct: true,
          feedback:
            'Yes. Values live in the ignored .env; the committed template stays names only.',
        },
        {
          id: 'template',
          text: 'Good idea. Put Marco’s DATABASE_URL in .env.example and commit it, so the next teammate who clones the repo has it too.',
          correct: false,
          feedback:
            '.env.example is committed. The password would sit in git history, for everyone, for good.',
        },
        {
          id: 'env-var',
          text: 'Set it with $env:DATABASE_URL in this terminal, so the password never touches a file, then run npm run dev again.',
          correct: false,
          feedback:
            'It works until this terminal closes. Tomorrow, or after a restart, the error is back.',
        },
        {
          id: 'hardcode',
          text: 'Write the URL straight into server.js.',
          correct: false,
          feedback:
            'Now the password is committed, and the deployed server would try to reach a localhost dev database.',
        },
      ],
      explanation:
        'Settings go in .env, which git ignores. .env.example lists the names so a teammate knows what to fill. A $env: fix lasts one terminal; a file lasts.',
    },
    {
      id: 'port-taken',
      kind: 'choose',
      situation:
        'Next: EADDRINUSE on port 3000. Priya’s login script starts her old mock server. Her dev database, a separate node process, hasn’t been started today.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          '[nodemon] starting `node server.js`',
          'Error: listen EADDRINUSE: address already in use :::3000',
          '[nodemon] app crashed - waiting for file changes before starting...',
          '^C',
          'PS C:\\Users\\priya\\quillwork-api> (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess',
          '8712',
          '',
          'otto › Quickest fix: Stop-Process -Name node',
        ].join('\n'),
      },
      question: 'Which do you approve?',
      options: [
        {
          id: 'by-name',
          text: 'Stop-Process -Name node',
          correct: false,
          feedback:
            'That stops every node process running now, not just the mock. Make it a habit and one day it takes her dev database down too.',
        },
        {
          id: 'reboot',
          text: 'Restart the laptop.',
          correct: false,
          feedback: 'Her login script starts the mock again, and the clock keeps running.',
        },
        {
          id: 'by-id',
          text: 'Stop-Process -Id 8712',
          correct: true,
          feedback: 'Yes. The port named its owner; stop exactly that one.',
        },
      ],
      explanation:
        'Ask the port for its owner and stop that PID. Stopping by name ends every process with that name running at the time, not just the one in the way. Once her dev database runs, the same habit stops it too.',
    },
    {
      id: 'db-down',
      kind: 'choose',
      situation:
        'The API starts. Otto says “Done: it’s up on 3000.” You curl it from another terminal.',
      artifact: {
        kind: 'response',
        label: 'PS 3',
        text: [
          'PS C:\\Users\\priya> curl.exe -i http://localhost:3000/health',
          'HTTP/1.1 503 Service Unavailable',
          'Content-Type: application/json; charset=utf-8',
          '',
          '{"ok":false,"db":"down"}',
        ].join('\n'),
      },
      question: 'What do you tell Dex?',
      options: [
        {
          id: 'ready',
          text: 'Ready for the demo.',
          correct: false,
          feedback: 'The health check itself says no. Dex would demo a 503.',
        },
        {
          id: 'not-ready',
          text: 'Running, not working yet. The dev database isn’t started; I’m starting it in its own terminal, then I’ll curl again.',
          correct: true,
          feedback: 'Yes. Honest, specific, and with the next step.',
        },
        {
          id: 'broken',
          text: 'The API is broken. We need Marco.',
          correct: false,
          feedback: 'The API answered and told you exactly what’s missing.',
        },
      ],
      explanation:
        'Running is not working. The health URL tells you which part is down. Report what the evidence says, not what Otto claimed.',
    },
    {
      id: 'after-restart',
      kind: 'choose',
      situation:
        'It worked, then Windows Update restarted Priya’s laptop. Today’s fixes: a new terminal, Node first on PATH via $env:, npm ci, .env, the stopped mock.',
      question: 'Which fixes survived the restart?',
      options: [
        {
          id: 'all',
          text: 'All of them. A restart closes windows, but it doesn’t undo work, so everything you fixed today still stands.',
          correct: false,
          feedback: 'Only what was written to disk survives. Terminals and processes start over.',
        },
        {
          id: 'none',
          text: 'None. Start from scratch.',
          correct: false,
          feedback: 'node_modules and .env are files on disk. They’re still there.',
        },
        {
          id: 'files',
          text: 'The files: node_modules and .env. The $env: PATH fix and the running processes are gone.',
          correct: true,
          feedback: 'Yes. Fix PATH again in the new terminal, then start the database and the API.',
        },
        {
          id: 'mock',
          text: 'Only the stopped mock: once stopped, it stays stopped. npm ci and the .env have to be done again.',
          correct: false,
          feedback:
            'Her login script starts it again at every sign-in, so check port 3000 first. node_modules and .env are files, still there.',
        },
      ],
      explanation:
        'Files survive a restart; terminals, $env: changes and processes don’t. That’s why setup belongs in files like .env and package.json, and why you check again after any restart.',
    },
    {
      id: 'the-method',
      kind: 'order',
      situation:
        'Dex’s demo went fine. He asks for your method, so Otto can follow it on the next Quillwork laptop.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'run', text: 'Run it and read the first error' },
        { id: 'cause', text: 'Find the cause behind that error' },
        { id: 'fix', text: 'Make the smallest fix for that cause' },
        { id: 'again', text: 'Run it again and read the next error' },
        { id: 'prove', text: 'Prove it: curl the health URL for a 200' },
      ],
      explanation:
        'One error at a time, its cause, the smallest fix, and run again. The big hammers, reinstalling or deleting or killing everything, skip the reading and usually cost more time than they save.',
    },
  ],
} satisfies LessonInput;
