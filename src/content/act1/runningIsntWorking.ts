import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 1.6 Running Isn't Working, taught as a lesson: the laptop engine doesn't simulate
 * processes or ports, so Kyle reads real PowerShell and curl output instead. The
 * principle: a running program is a process with a PID, a server holds one port, you
 * stop exactly the one you mean, and "it started" is proved only by asking the port.
 */
export const runningIsntWorking = {
  id: 'running-isnt-working',
  act: 1,
  title: "Running Isn't Working",
  // The same as each directed mission in Act 1, so the lessons aren't worth less.
  xp: 100,
  briefing: [
    'The Quillwork API is installed. Now it has to run on port 3000, where Marco’s web app expects it.',
    'Every running program is a process with an ID. Stop only the one you mean, and never take “it started” as “it works”.',
  ],
  cards: [
    {
      id: 'address-in-use',
      kind: 'choose',
      situation: 'Otto runs npm start in the Quillwork API folder. It stops at once.',
      artifact: {
        kind: 'terminal',
        label: 'PS 1',
        text: [
          'PS C:\\Users\\kyle\\quillwork\\api> npm start',
          '',
          '> quillwork-api@1.0.0 start',
          '> node server.js',
          '',
          'node:events:497',
          "      throw er; // Unhandled 'error' event",
          '      ^',
          '',
          'Error: listen EADDRINUSE: address already in use :::3000',
          '    at Server.setupListenHandle [as _listen2] (node:net:1904:16)',
          "  code: 'EADDRINUSE',",
          "  syscall: 'listen',",
          '  port: 3000',
        ].join('\n'),
      },
      question: 'What does this mean?',
      options: [
        {
          id: 'code-broken',
          text: 'The API’s code is broken.',
          correct: false,
          feedback: 'The code got as far as asking for a port. The port is what said no.',
        },
        {
          id: 'firewall',
          text: 'The Windows firewall is blocking port 3000, so the API can’t open it until you allow Node through.',
          correct: false,
          feedback:
            'A firewall drops connections. It never stops a program from listening, and EADDRINUSE is about who already listens.',
        },
        {
          id: 'taken',
          text: 'Another process is already listening on port 3000, and only one can hold a port.',
          correct: true,
          feedback: 'Yes. Something else got there first. Next: find out what.',
        },
      ],
      explanation:
        'A server listens on a port, like a phone line with one number. EADDRINUSE means the number is taken. The fix is finding who holds it, not changing your code.',
    },
    {
      id: 'who-holds-it',
      kind: 'choose',
      situation: 'You ask Otto to find out who holds port 3000, and to list every node process.',
      artifact: {
        kind: 'terminal',
        label: 'PS 1',
        text: [
          'PS> Get-NetTCPConnection -LocalPort 3000 -State Listen |',
          '>>   Select-Object LocalPort, OwningProcess',
          '',
          'LocalPort OwningProcess',
          '--------- -------------',
          '     3000          8712',
          '',
          'PS> Get-Process node',
          '',
          ' NPM(K)    PM(M)      WS(M)     CPU(s)      Id  SI ProcessName',
          ' ------    -----      -----     ------      --  -- -----------',
          '     41    72.10      90.44      12.50    7004   1 node',
          '     52   110.32     140.18      30.02    7020   1 node',
          '     34    48.21      61.30       2.14    8712   1 node',
        ].join('\n'),
      },
      question: 'Which process holds port 3000?',
      options: [
        {
          id: 'first',
          text: '7004, the first node in the list.',
          correct: false,
          feedback: 'The list is sorted by ID, not by port. Read the port’s own answer.',
        },
        {
          id: 'owner',
          text: '8712, the OwningProcess the port reported.',
          correct: true,
          feedback: 'Yes. The port told you its owner by ID.',
        },
        {
          id: 'busiest',
          text: '7020, the one using the most CPU.',
          correct: false,
          feedback: 'Busy isn’t the same as holding a port. That one is Otto himself.',
        },
        {
          id: 'all',
          text: 'All three. They’re all node.',
          correct: false,
          feedback: 'Only one process can hold a port. Three programs share the name node.',
        },
      ],
      explanation:
        'A name like node can belong to many programs at once. The process ID, or PID, is unique while it runs. Ask the port for its owning PID, then act on that one number.',
    },
    {
      id: 'moved-goalposts',
      kind: 'choose',
      situation:
        'Meanwhile, Otto tries another way in a second terminal. Marco’s web app on port 5173 still calls http://localhost:3000.',
      artifact: {
        kind: 'terminal',
        label: 'PS 2',
        text: [
          "PS C:\\Users\\kyle\\quillwork\\api> $env:PORT = '3001'; npm start",
          '',
          '> quillwork-api@1.0.0 start',
          '> node server.js',
          '',
          'API listening on :3001',
          '',
          'otto › Done: the API is up.',
        ].join('\n'),
      },
      question: 'Is the job done?',
      options: [
        {
          id: 'moved',
          text: 'No. He moved the goal: the web app still calls 3000 and will fail. Stop the 3001 copy and free port 3000.',
          correct: true,
          feedback: 'Yes. The task was the API on 3000, not the API somewhere.',
        },
        {
          id: 'yes',
          text: 'Yes. It’s listening, so it’s up.',
          correct: false,
          feedback: 'Up on a port nobody calls. Marco’s app still gets no answer.',
        },
        {
          id: 'tell-marco',
          text: 'Yes. Just ask Marco to change his app to 3001.',
          correct: false,
          feedback:
            'That spreads your laptop’s problem into his code, and to everyone else’s laptop.',
        },
      ],
      explanation:
        'Agents sometimes “succeed” by quietly changing the goal: another port, a skipped test, a smaller task. Check the claim against what you actually asked for.',
    },
    {
      id: 'big-hammer',
      kind: 'prompt',
      situation:
        'PID 7004 is Marco’s web preview, 7020 is Otto’s own agent process, and 8712 is an old mock server Otto started yesterday. Otto proposes a quick fix.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: [
          'otto › Something is squatting on port 3000. Fastest fix:',
          'otto › Stop-Process -Name node',
          '       Approve? [y/N]',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'approve',
          text: 'Approve. It’s only dev stuff.',
          correct: false,
          feedback:
            'That stops every node process: Marco’s preview, the old mock, and Otto himself, mid-task.',
        },
        {
          id: 'other-port',
          text: 'Deny. Leave that process alone and start the API on port 3001 instead, then update every URL that points at 3000.',
          correct: false,
          feedback: 'Marco’s web app calls port 3000. Changing the goal isn’t fixing the problem.',
        },
        {
          id: 'reboot',
          text: 'Deny. Restart the laptop to clear every process at once, then start the API first so it gets port 3000 back.',
          correct: false,
          feedback:
            'It ends everything you have open, and a login script may start the culprit again.',
        },
        {
          id: 'by-id',
          text: 'Deny. Stop only PID 8712, the process that owns port 3000. Then show me port 3000 is free.',
          correct: true,
          feedback: 'Yes. One process, named by ID, then proof it worked.',
        },
      ],
      explanation:
        'Stopping by name hits every process with that name, including ones you need, and possibly your agent. Stop by PID, the one you checked, and confirm the result.',
    },
    {
      id: 'prove-it',
      kind: 'choose',
      situation:
        'The old mock and the 3001 copy are stopped, and the API starts on 3000. Otto says “Done: the API works.” You ask him to prove it from a third terminal.',
      artifact: {
        kind: 'response',
        label: 'PS 3',
        text: [
          'PS C:\\Users\\kyle> curl.exe -i http://localhost:3000/health',
          'HTTP/1.1 503 Service Unavailable',
          'X-Powered-By: Express',
          'Content-Type: application/json; charset=utf-8',
          'Content-Length: 24',
          '',
          '{"ok":false,"db":"down"}',
        ].join('\n'),
      },
      question: 'Is the API working?',
      options: [
        {
          id: 'yes',
          text: 'Yes. It answered on port 3000 with JSON, so the server is up and handling requests.',
          correct: false,
          feedback: 'It answered 503, and its own health check says the database is down.',
        },
        {
          id: 'not-running',
          text: 'No. 503 Service Unavailable means the API isn’t running. Start it again and wait for it to say listening.',
          correct: false,
          feedback: 'A 503 is an answer: something on 3000 is running. Running is the easy half.',
        },
        {
          id: 'running-not-working',
          text: 'It’s running, but not working: the health check says the database is down.',
          correct: true,
          feedback: 'Yes. That’s the honest report, and it tells you what to fix next.',
        },
      ],
      explanation:
        'A process can run, hold its port, and still fail every request. “Working” means a request gets the right answer. Ask the port, and read the status code and the body.',
    },
    {
      id: 'brief-for-proof',
      kind: 'prompt',
      situation:
        'Next time you want proof from Otto, not a claim. Sage suggests writing the check into your instruction.',
      question: 'Which instruction makes Otto prove the Quillwork API works?',
      options: [
        {
          id: 'make-sure',
          text: 'Start the API and make sure it works.',
          correct: false,
          feedback: 'Otto will see “listening” and call it done. “Make sure” never says how.',
        },
        {
          id: 'curl-it',
          text: 'Start the API in its own terminal. From a second terminal, run curl.exe -i http://localhost:3000/health and paste the status line and body. Done means 200 with db up.',
          correct: true,
          feedback: 'Yes. A command, the evidence to paste, and what “done” means.',
        },
        {
          id: 'get-process',
          text: 'Start the API in its own terminal. From a second terminal, run Get-Process node and paste the line with its ID. Done means it’s still running after a minute.',
          correct: false,
          feedback: 'That proves it’s running. It could still be failing every request.',
        },
        {
          id: 'wait',
          text: 'Start it and wait 30 seconds. If nothing crashes, it works.',
          correct: false,
          feedback: 'Not crashing isn’t working. The 503 above never crashed.',
        },
      ],
      explanation:
        'Tell an agent what evidence counts before it starts. Name the request, what to paste back, and the result that means done. Then its claim and the proof arrive together.',
    },
    {
      id: 'ctrl-c',
      kind: 'choose',
      situation:
        'Later, Otto runs npm start in PS 1, presses Ctrl+C to get his prompt back, then tries curl in the same terminal.',
      artifact: {
        kind: 'terminal',
        label: 'PS 1',
        text: [
          'API listening on :3000',
          '^C',
          'PS C:\\Users\\kyle\\quillwork\\api> curl.exe http://localhost:3000/health',
          'curl: (7) Failed to connect to localhost port 3000 after 2231 ms: Could not connect to server',
        ].join('\n'),
      },
      question: 'Why does nothing answer?',
      options: [
        {
          id: 'firewall',
          text: 'The firewall blocks localhost.',
          correct: false,
          feedback: 'It answered a minute ago. Something changed in between: the Ctrl+C.',
        },
        {
          id: 'no-curl',
          text: 'curl isn’t installed.',
          correct: false,
          feedback: 'curl printed its own error, so it’s installed and ran.',
        },
        {
          id: 'warm-up',
          text: 'The API is still starting and connecting to its database. Wait a minute, then run the same curl again in this terminal.',
          correct: false,
          feedback: 'It isn’t starting up. It isn’t there at all.',
        },
        {
          id: 'stopped',
          text: 'Ctrl+C stopped the server. A server keeps its terminal busy while it runs; check from a second one.',
          correct: true,
          feedback: 'Yes. Leave the server its terminal, and ask from another.',
        },
      ],
      explanation:
        'A server runs in the foreground and holds its terminal for as long as it serves. Ctrl+C ends it. Run the server in one terminal and send requests from a second.',
    },
    {
      id: 'reads-at-start',
      kind: 'choose',
      situation:
        'The API is running. You fix DATABASE_URL in its .env and save. Otto curls again: still {"ok":false,"db":"down"}.',
      question: 'Why didn’t the fix take?',
      options: [
        {
          id: 'wrong-fix',
          text: 'The new DATABASE_URL must be wrong too: check the user, password, host and database name in it once more.',
          correct: false,
          feedback: 'Maybe, but you can’t tell yet. The API hasn’t read it.',
        },
        {
          id: 'at-start',
          text: 'The API read .env once, when it started. Restart it, then curl again.',
          correct: true,
          feedback: 'Yes. A running program keeps the settings it started with.',
        },
        {
          id: 'cache',
          text: 'curl is showing a cached answer from before the fix. Clear its cache, or add a header so it asks the API again.',
          correct: false,
          feedback: 'curl asks fresh every time. The server gave the same answer.',
        },
      ],
      explanation:
        'Most programs read their settings once, at start, like a terminal copying its variables when it opens. After changing .env, restart the process, and only then check again.',
    },
    {
      id: 'free-start-check',
      kind: 'order',
      situation: 'Sage asks for your routine when a server won’t start because its port is taken.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'ask-port', text: 'Ask the port who holds it, by PID' },
        { id: 'stop-one', text: 'Stop exactly that PID' },
        { id: 'start', text: 'Start the server in its own terminal' },
        { id: 'curl', text: 'From a second terminal, curl its health URL' },
        { id: 'report', text: 'Report the status code and body you saw' },
      ],
      explanation:
        'Find the owner, stop only it, start yours, then prove it with a real request. The report is the evidence, so “done” means something anyone can check.',
    },
  ],
} satisfies LessonInput;
