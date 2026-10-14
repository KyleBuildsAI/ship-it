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
      id: 'old-node-first',
      kind: 'prompt',
      situation:
        'In the new terminal, npm runs. The dev script fails differently, and Otto has a fix.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          'PS C:\\Users\\priya\\quillwork-api> npm run dev',
          '> node --watch server.js',
          'node: bad option: --watch',
          'PS C:\\Users\\priya\\quillwork-api> (Get-Command node).Source',
          'C:\\tools\\node16\\node.exe',
          '',
          'otto › Old Node comes first on PATH. I’ll fix it for good:',
          'otto › setx PATH "C:\\Program Files\\nodejs"',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'setx',
          text: 'Approve the setx.',
          correct: false,
          feedback:
            'setx replaces Priya’s saved PATH with that one folder. Every new terminal loses git and everything else.',
        },
        {
          id: 'this-terminal',
          text: 'No setx. Put C:\\Program Files\\nodejs first on this terminal’s PATH with $env:Path, check node --version, and note the old Node 16 for Priya.',
          correct: true,
          feedback: 'Yes. A fix you can see and undo, and Priya decides about her old Node.',
        },
        {
          id: 'drop-watch',
          text: 'Remove --watch from the dev script.',
          correct: false,
          feedback: 'That changes the project for everyone to dodge one laptop’s problem.',
        },
        {
          id: 'uninstall',
          text: 'Uninstall Node 16 from her laptop.',
          correct: false,
          feedback: 'Another of her projects may need it. That’s Priya’s call, not yours mid-demo.',
        },
      ],
      explanation:
        'The first matching folder on PATH wins. Fix the order in this terminal to get moving, and leave saved, laptop-wide changes to their owner. setx with one folder wipes the rest.',
    },
    {
      id: 'no-modules',
      kind: 'prompt',
      situation: 'Node 24 now. The server starts, then stops. Otto suggests a clean slate.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          "Error: Cannot find module 'express'",
          'Require stack:',
          '- C:\\Users\\priya\\quillwork-api\\server.js',
          "  code: 'MODULE_NOT_FOUND'",
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
          text: 'Do it. A clean slate is safest.',
          correct: false,
          feedback:
            'Deleting the lockfile throws away the versions Marco’s laptop runs, the exact thing that works.',
        },
        {
          id: 'global',
          text: 'Install express globally with -g.',
          correct: false,
          feedback:
            'A project never reads global packages with require. And it needs more than express.',
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
        '“Cannot find module” means it isn’t installed where the project looks. Install from the project’s own list. The lockfile is how Priya gets exactly what works for Marco.',
    },
    {
      id: 'no-env',
      kind: 'prompt',
      situation:
        'Next error. Priya has no .env yet. docs\\setup.md lists the local dev DATABASE_URL. Otto has a suggestion.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          'Error: DATABASE_URL is not set',
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
          text: 'Copy .env.example to .env and fill DATABASE_URL from docs\\setup.md in .env only. .env.example keeps names only.',
          correct: true,
          feedback:
            'Yes. Values live in the ignored .env; the committed template stays names only.',
        },
        {
          id: 'template',
          text: 'Good idea. Put it in .env.example and commit.',
          correct: false,
          feedback:
            '.env.example is committed. A value there is shared with everyone, and keys follow.',
        },
        {
          id: 'env-var',
          text: 'Set it with $env:DATABASE_URL in this terminal.',
          correct: false,
          feedback:
            'It works until this terminal closes. Tomorrow, or after a restart, the error is back.',
        },
        {
          id: 'hardcode',
          text: 'Write the URL straight into server.js.',
          correct: false,
          feedback: 'Now every laptop and the server use Priya’s local database address.',
        },
      ],
      explanation:
        'Settings go in .env, which git ignores. .env.example lists the names so a teammate knows what to fill. A $env: fix lasts one terminal; a file lasts.',
    },
    {
      id: 'port-taken',
      kind: 'choose',
      situation:
        'Next: EADDRINUSE on port 3000. Priya’s login script starts her old mock server. Her dev database is also a node process.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          'PS> (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess',
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
          feedback: 'That also stops her dev database, and you’ll meet that next.',
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
        'Ask the port for its owner and stop that PID. Stopping by name takes down every process with the name, here the database the API needs.',
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
          text: 'Running, not working yet. The dev database is stopped; I’m starting it in its own terminal, then I’ll curl again.',
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
          text: 'All of them. Fixes are fixes.',
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
          text: 'Only the stopped mock: stopping is permanent.',
          correct: false,
          feedback: 'Her login script starts it again at every sign-in. Check port 3000 first.',
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
