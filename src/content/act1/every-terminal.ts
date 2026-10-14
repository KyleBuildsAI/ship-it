import type { Predicate } from '../../game/missions/predicates';
import type { MissionInput } from '../../game/missions/schema';
import { API, HOME, laptop } from './shared';

/**
 * Mission 1.4, Every Terminal Is Its Own World (docs/act1-directed.md section 3): a
 * terminal copies the saved variables and PATH when it opens. A $env: change lives only in
 * the terminal it was typed in, until that terminal closes, and saved changes reach only
 * terminals opened after them. "Not recognized" means: not on this terminal's PATH.
 *
 * The laptop runs no programs and no setx yet, so Otto can't save a variable or run npm.
 * The installer's PATH change, Sage's saved variable and Kyle's $env: test arrive through
 * each step's `before`, and the checks read each terminal's copy of the variables, which
 * is exactly what the lesson is about. every-terminal.test.ts plays every card.
 */

/** The full paths Otto types, as Windows spells them. */
const API_PATH = 'C:\\Users\\kyle\\quillwork\\api';
const NODE_DIR = 'C:\\Program Files\\nodejs';

const NODE_FOLDER = 'Program Files/nodejs';
const ENV_FILE = `${API}/.env`;
/** The API's .env as Mission 1.3 left it, minus the key: one setting the API needs. */
const ENV_SETTINGS = 'PORT=3000\n';

const not = (predicate: Predicate): Predicate => ({ kind: 'not', predicate });

/** The laptop for this mission: Mission 1.1's, with Node installed and the API's .env. */
function nodeLaptop() {
  return laptop().files({
    [`${NODE_FOLDER}/node.exe`]: 'node 24.15.0\n',
    [`${NODE_FOLDER}/npm.cmd`]: '@node "%~dp0\\node_modules\\npm\\bin\\npm-cli.js" %*\n',
    [ENV_FILE]: ENV_SETTINGS,
  });
}

const NODE_INSTALLED: Predicate = {
  kind: 'driveFile',
  path: `${NODE_FOLDER}/node.exe`,
  label: 'Node stays installed',
};
/** The active terminal's own copy of PATH names Node's folder. */
const NODE_ON_PATH: Predicate = { kind: 'envVar', name: 'Path', contains: NODE_DIR };
/** The installer saved Node's folder on the Machine PATH, once PS 1 was already open. */
const INSTALL_NODE = { op: 'pathAdd', scope: 'machine', dir: NODE_DIR, at: 'end' } as const;

const SEES_QUILL_ENV: Predicate = { kind: 'envVar', name: 'QUILL_ENV', equals: 'dev' };
const IN_API: Predicate = { kind: 'currentDirectory', path: API };

/** The whole line, so a QUILL_DEBUG=truex or a commented-out line doesn't count. */
const DEBUG_IN_ENV: Predicate = {
  kind: 'driveFile',
  path: ENV_FILE,
  pattern: '^QUILL_DEBUG=true\\r?$',
  flags: 'm',
};
const PORT_KEPT: Predicate = {
  kind: 'driveFile',
  path: ENV_FILE,
  pattern: '^PORT=3000\\r?$',
  flags: 'm',
  label: '.env keeps PORT=3000',
};

export const everyTerminal: MissionInput = {
  id: 'every-terminal',
  act: 1,
  title: 'Every Terminal Is Its Own World',
  xp: 100,
  approvals: 'destructive',
  briefing: {
    sceneId: 'machine-island',
    captions: [
      'A terminal copies the saved variables and PATH when it opens. After that, its copy is its own.',
      '$env:NAME changes only the terminal you typed it in, and only until that terminal closes.',
      '"Not recognized" means: not on this terminal\'s PATH. Saved changes reach only new terminals, Otto\'s too.',
    ],
    diagram: 'lanterns-and-corkboard',
  },
  initialRepoState: nodeLaptop().toSpec(),
  steps: [
    {
      id: 'npm-not-recognized',
      instruction: "npm is not recognized in Otto's terminal. Get him one that finds Node.",
      success: { ...NODE_ON_PATH, label: "Otto's terminal has Node on its PATH" },
      hints: [
        "Node's installer ran this morning. When did Otto's terminal open?",
        'A terminal copies PATH when it opens. Later changes reach only new terminals.',
        'Pick the card that opens a new terminal and shows its PATH.',
      ],
      agent: {
        before: [INSTALL_NODE],
        note: "Node's installer ran this morning, after Otto's terminal opened.",
        focus: [NODE_FOLDER, HOME],
        plans: [
          {
            id: 'reinstall',
            text: 'npm is broken. Remove Node so we can reinstall.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['reinstall node', 'remove node', 'node is broken'],
            script: [
              {
                do: 'run',
                // A delete, so it pauses. Node was fine: only the terminal's copy was old.
                line: `Remove-Item '${NODE_DIR}' -Recurse`,
                say: 'npm looks broken. Removing Node to start clean.',
                denyLine: 'Okay, Node stays. What should I do instead?',
              },
            ],
            claim: 'Done: Node is gone. Reinstall it and npm works.',
            lesson:
              "Node was fine. Otto's terminal opened before the install, so its PATH copy was old.",
            slip: 'big-hammer',
          },
          {
            id: 'look-here',
            text: "Show this terminal's PATH; check Node's folder is on it.",
            quality: 'okay',
            covers: ['goal', 'check'],
            intents: ['show the path', 'check path for node', 'print path'],
            script: [{ do: 'run', line: 'Write-Output $env:Path' }],
            claim: "Done: Node's folder is on PATH now.",
            lesson: 'The printed PATH has no nodejs: this terminal copied PATH before the install.',
            slip: 'stale-terminal',
          },
          {
            id: 'new-terminal',
            text: 'Open a new terminal, then show its PATH.',
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['open a new terminal', 'fresh terminal', 'new tab then path'],
            script: [{ do: 'newTerminal' }, { do: 'run', line: 'Write-Output $env:Path' }],
            claim: "Done: the new terminal's PATH has Node's folder.",
            lesson: 'A new terminal copies the saved PATH as it opens, installer changes included.',
          },
        ],
        fixes: [
          {
            id: 'fresh-tab',
            text: "That's the old terminal. Open a new one and show PATH.",
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['that is the old terminal', 'open a new one'],
            script: [{ do: 'newTerminal' }, { do: 'run', line: 'Write-Output $env:Path' }],
            claim: "Fixed: the new terminal's PATH has nodejs.",
            lesson: 'The fix was a fresh terminal, not a reinstall.',
          },
        ],
        hintPlan: 'new-terminal',
        check: {
          question: "Does Otto's terminal have Node's folder on its PATH?",
          options: [
            {
              id: 'fresh',
              text: `Yes: it lists ${NODE_DIR}`,
              truth: { kind: 'all', of: [NODE_ON_PATH, NODE_INSTALLED] },
              feedback: 'Right: a terminal opened after the install copied the new PATH.',
            },
            {
              id: 'stale',
              text: 'No: this terminal opened before the install',
              truth: { kind: 'all', of: [not(NODE_ON_PATH), NODE_INSTALLED] },
              feedback: 'Read the PATH Otto printed: no nodejs. It was copied before the install.',
            },
            {
              id: 'gone',
              text: 'Node is gone: Otto deleted it',
              truth: not(NODE_INSTALLED),
              feedback: 'Otto removed Node. On a real laptop, that means reinstalling it.',
            },
          ],
        },
        guards: [NODE_INSTALLED],
        looks: [
          { id: 'path', label: "Show Otto's PATH", line: 'Write-Output $env:Path' },
          { id: 'node', label: "List Node's folder", line: `Get-ChildItem '${NODE_DIR}'` },
        ],
      },
    },
    {
      id: 'saved-for-new-terminals',
      instruction:
        'The API reads QUILL_ENV when it starts. Get Otto a terminal in the API that sees it.',
      success: {
        kind: 'all',
        of: [SEES_QUILL_ENV, IN_API],
        label: 'A terminal in the API sees QUILL_ENV',
      },
      hints: [
        "Did Otto's terminal open before or after Sage saved QUILL_ENV?",
        'A saved variable reaches only terminals opened after the save.',
        'Pick the card that opens a new terminal, goes to the API, and prints it.',
      ],
      agent: {
        // Every tab starts fresh at home, whatever the last step left, then Sage saves.
        before: [
          { op: 'restartTerminals' },
          { op: 'env', scope: 'user', name: 'QUILL_ENV', value: 'dev' },
        ],
        note: 'Terminals restarted overnight. Then Sage saved QUILL_ENV=dev for your user.',
        focus: [API, HOME],
        plans: [
          {
            id: 'trust-the-save',
            text: 'Sage saved it. Go to the API.',
            quality: 'weak',
            covers: ['goal', 'place'],
            intents: ['sage saved it', 'go to the api'],
            script: [{ do: 'run', line: `cd ${API_PATH}` }],
            claim: 'Done: in the API, and QUILL_ENV is dev.',
            lesson: 'Sage saved it after this terminal opened, so its copy has no QUILL_ENV.',
            slip: 'stale-terminal',
          },
          {
            id: 'print-here',
            text: 'Go to the API and print QUILL_ENV.',
            quality: 'okay',
            covers: ['goal', 'place', 'check'],
            intents: ['print quill_env', 'go to the api and print'],
            script: [
              { do: 'run', line: `cd ${API_PATH}` },
              {
                do: 'run',
                line: 'Write-Output $env:QUILL_ENV',
                // Each option is about this line in the terminal it runs in, so a fix
                // round that offers this card after a new terminal still has one answer.
                predict: {
                  question: 'Before Otto runs it: what will this terminal print?',
                  options: [
                    { id: 'dev', text: 'dev', outcome: { printed: 'dev' } },
                    {
                      id: 'empty',
                      text: 'An empty line',
                      outcome: {
                        result: 'ok',
                        state: { kind: 'envVar', name: 'QUILL_ENV', exists: false },
                      },
                    },
                  ],
                },
              },
            ],
            claim: 'Done: printed QUILL_ENV. Ready to start the API.',
            lesson: 'The empty line was the answer: this terminal has no QUILL_ENV.',
            slip: 'overclaim',
          },
          {
            id: 'fresh-in-api',
            text: 'Open a new terminal, go to the API, print QUILL_ENV.',
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['open a new terminal in the api', 'new terminal then print'],
            script: [
              { do: 'newTerminal' },
              { do: 'run', line: `cd ${API_PATH}` },
              { do: 'run', line: 'Write-Output $env:QUILL_ENV' },
            ],
            claim: 'Done: the new terminal in the API prints dev.',
            lesson:
              'Saved variables reach terminals opened after the save. The printed dev proves it.',
          },
        ],
        fixes: [
          {
            id: 'open-one',
            text: 'Open a new terminal.',
            quality: 'okay',
            covers: ['goal'],
            intents: ['open a new terminal', 'new tab'],
            script: [{ do: 'newTerminal' }],
            claim: 'Done: the new terminal sees QUILL_ENV.',
            lesson: 'It sees QUILL_ENV, but a new terminal opens at home, not in the API.',
          },
        ],
        hintPlan: 'fresh-in-api',
        check: {
          question: "Can Otto's terminal in the API see QUILL_ENV?",
          options: [
            {
              id: 'ready',
              text: 'Yes: it prints dev, in the API',
              truth: { kind: 'all', of: [SEES_QUILL_ENV, IN_API] },
              feedback: 'Right: it opened after the save, then moved to the API.',
            },
            {
              id: 'missing',
              text: 'No: it opened before Sage saved it',
              truth: not(SEES_QUILL_ENV),
              feedback: 'Print QUILL_ENV: an empty line means this terminal never got it.',
            },
            {
              id: 'home',
              text: 'It sees it, but stands at home',
              truth: { kind: 'all', of: [SEES_QUILL_ENV, not(IN_API)] },
              feedback: 'A new terminal opens at home. Ask Otto where he is.',
            },
          ],
        },
        looks: [
          { id: 'print', label: 'Print QUILL_ENV', line: 'Write-Output $env:QUILL_ENV' },
          { id: 'where', label: 'Where is Otto?', line: 'Get-Location' },
        ],
      },
    },
    {
      id: 'make-it-last',
      instruction: "QUILL_DEBUG must still be true for the API after tonight's terminal restart.",
      success: { ...DEBUG_IN_ENV, label: "The API's .env sets QUILL_DEBUG=true" },
      hints: [
        'What happens to a $env: change when its terminal closes?',
        '$env: lives in one terminal. The API reads .env every time it starts.',
        "Pick the card that appends one line to the API's .env.",
      ],
      agent: {
        before: [
          { op: 'cd', path: API },
          { op: 'env', scope: 'session', name: 'QUILL_DEBUG', value: 'true' },
        ],
        note: "You typed $env:QUILL_DEBUG = 'true' in Otto's terminal to test.",
        focus: [API],
        plans: [
          {
            id: 'prove-it',
            text: 'Open a new terminal and show QUILL_DEBUG is set.',
            quality: 'weak',
            covers: ['goal', 'check'],
            intents: ['show quill_debug is set', 'prove it in a new terminal'],
            script: [
              { do: 'newTerminal' },
              {
                do: 'run',
                line: 'Write-Output $env:QUILL_DEBUG',
                predict: {
                  question: 'Before Otto runs it: what will this terminal print?',
                  options: [
                    { id: 'true', text: 'true', outcome: { printed: 'true' } },
                    {
                      id: 'empty',
                      text: 'An empty line',
                      outcome: {
                        result: 'ok',
                        state: { kind: 'envVar', name: 'QUILL_DEBUG', exists: false },
                      },
                    },
                  ],
                },
              },
            ],
            claim: 'Done: QUILL_DEBUG is set everywhere.',
            lesson: '$env: changed only the terminal it ran in. The new one printed an empty line.',
            slip: 'overclaim',
          },
          {
            id: 'replace-env',
            text: "Put QUILL_DEBUG=true in the API's .env.",
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['put it in .env', 'save it in the env file'],
            script: [
              {
                do: 'run',
                // Set-Content replaces the whole file, so it pauses, and PORT would go.
                line: `Set-Content ${API_PATH}\\.env 'QUILL_DEBUG=true'`,
                onDeny: [{ do: 'run', line: `Add-Content ${API_PATH}\\.env 'QUILL_DEBUG=true'` }],
                denyLine: 'Right, that replaced .env. Adding one line instead.',
              },
            ],
            claim: 'Done: .env sets QUILL_DEBUG=true.',
            lesson: 'Set-Content replaces the whole file, so PORT went. Say add a line.',
            slip: 'wrong-verb',
          },
          {
            id: 'append-env',
            text: "Append one line, QUILL_DEBUG=true, to the API's .env.",
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['append to .env', 'add one line to the env file'],
            script: [{ do: 'run', line: `Add-Content ${API_PATH}\\.env 'QUILL_DEBUG=true'` }],
            claim: '.env ends with QUILL_DEBUG=true. PORT is untouched.',
            lesson: 'The API reads .env each time it starts, from any terminal, after any restart.',
          },
        ],
        fixes: [
          {
            id: 'put-port-back',
            text: 'Add PORT=3000 back to .env.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['put port back', 'add port 3000'],
            script: [{ do: 'run', line: `Add-Content ${API_PATH}\\.env 'PORT=3000'` }],
            claim: 'Fixed: .env has PORT=3000 again.',
            lesson: 'An append put PORT back. Next time, say add a line, not set the file.',
          },
        ],
        hintPlan: 'append-env',
        check: {
          question: "After tonight's restart, where will QUILL_DEBUG=true still be?",
          options: [
            {
              id: 'dotenv',
              text: "In the API's .env, with PORT kept",
              truth: { kind: 'all', of: [DEBUG_IN_ENV, PORT_KEPT] },
              feedback: 'Right: the API reads .env each time it starts.',
            },
            {
              id: 'port-lost',
              text: 'In .env, but PORT=3000 is gone',
              truth: { kind: 'all', of: [DEBUG_IN_ENV, not(PORT_KEPT)] },
              feedback: 'Show .env: Set-Content replaced it, so PORT=3000 went.',
            },
            {
              id: 'nowhere',
              text: 'Nowhere: it lived only in a terminal',
              truth: not(DEBUG_IN_ENV),
              feedback: '$env: lasts until the terminal closes. Nothing saved it.',
            },
          ],
        },
        guards: [PORT_KEPT],
        looks: [
          { id: 'env', label: 'Show .env', line: `Get-Content ${API_PATH}\\.env` },
          { id: 'debug', label: 'Print QUILL_DEBUG', line: 'Write-Output $env:QUILL_DEBUG' },
        ],
      },
    },
  ],
  drills: [
    {
      kind: 'predict',
      id: 'etw-predict-new-tab',
      prompt: 'Sage saved QUILL_ENV=dev, then Otto opened a terminal. What prints?',
      concept: 'environment',
      setup: nodeLaptop().env('user', 'QUILL_ENV', 'dev').toSpec(),
      history: [{ do: 'newTerminal' }],
      action: { do: 'run', line: 'Write-Output $env:QUILL_ENV' },
      options: [
        { id: 'dev', text: 'dev', outcome: { printed: 'dev' } },
        {
          id: 'empty',
          text: 'An empty line',
          outcome: {
            result: 'ok',
            state: { kind: 'envVar', name: 'QUILL_ENV', exists: false },
          },
        },
        { id: 'error', text: 'An error', outcome: { result: 'error' } },
      ],
      explain: 'The terminal opened after the save, so its copy has QUILL_ENV.',
    },
    {
      kind: 'predict',
      id: 'etw-predict-old-tab',
      prompt: 'Sage saved QUILL_ENV=dev after PS 1 opened. What does PS 1 print?',
      concept: 'environment',
      setup: nodeLaptop().env('user', 'QUILL_ENV', 'dev').toSpec(),
      action: { do: 'run', line: 'Write-Output $env:QUILL_ENV' },
      options: [
        { id: 'dev', text: 'dev', outcome: { printed: 'dev' } },
        {
          id: 'empty',
          text: 'An empty line',
          outcome: {
            result: 'ok',
            state: { kind: 'envVar', name: 'QUILL_ENV', exists: false },
          },
        },
        { id: 'error', text: 'An error', outcome: { result: 'error' } },
      ],
      explain: 'PS 1 copied the variables before the save. An unset variable prints empty.',
    },
    {
      kind: 'diagnose',
      id: 'etw-diagnose-stale-tab',
      prompt: 'Node installed after PS 1 opened. Otto ran npm there. Why did it fail?',
      concept: 'environment',
      setup: nodeLaptop().pathAdd('machine', NODE_DIR, 'end').toSpec(),
      history: [{ do: 'run', line: 'npm --version', fails: true }],
      options: [
        {
          id: 'stale',
          text: "PS 1's PATH copy is older than the install",
          truth: {
            kind: 'all',
            of: [{ ...NODE_ON_PATH, scope: 'newTerminal' }, not(NODE_ON_PATH)],
          },
        },
        { id: 'missing', text: "Node isn't installed", truth: not(NODE_INSTALLED) },
        { id: 'admin', text: 'npm needs an administrator terminal' },
      ],
      explain: 'The saved PATH has Node now, but PS 1 copied it earlier. A new terminal finds npm.',
    },
    {
      kind: 'diagnose',
      id: 'etw-diagnose-claim-tab',
      prompt: 'Otto set QUILL_ENV with $env: in PS 1, then opened PS 2. Is he right?',
      concept: 'environment',
      setup: nodeLaptop().env('session', 'QUILL_ENV', 'dev').toSpec(),
      history: [{ do: 'newTerminal' }, { do: 'run', line: 'Write-Output $env:QUILL_ENV' }],
      claim: 'Done: QUILL_ENV is dev in both terminals.',
      options: [
        { id: 'right', text: 'Yes: both terminals have it', truth: SEES_QUILL_ENV },
        {
          id: 'only-ps1',
          text: 'No: $env: changed PS 1 only',
          truth: {
            kind: 'all',
            of: [
              not(SEES_QUILL_ENV),
              { kind: 'envVar', name: 'QUILL_ENV', scope: 'user', exists: false },
            ],
          },
        },
        {
          id: 'saved',
          text: 'No: it is saved, but PS 2 needs a restart',
          truth: { kind: 'envVar', name: 'QUILL_ENV', scope: 'user', equals: 'dev' },
        },
      ],
      explain: '$env: changes one terminal only. PS 2 copied the saved variables, which lack it.',
    },
    {
      kind: 'diagnose',
      id: 'etw-diagnose-export',
      prompt: 'Otto set QUILL_ENV, then printed it. Why is the line empty?',
      concept: 'environment',
      setup: nodeLaptop().toSpec(),
      history: [
        { do: 'run', line: 'export QUILL_ENV=dev', fails: true },
        { do: 'run', line: 'Write-Output $env:QUILL_ENV' },
      ],
      options: [
        {
          id: 'bash',
          text: 'export is bash: PowerShell never ran it',
          truth: {
            kind: 'all',
            of: [
              not(SEES_QUILL_ENV),
              { kind: 'envVar', name: 'QUILL_ENV', scope: 'newTerminal', exists: false },
            ],
          },
        },
        {
          id: 'new-only',
          text: 'It was saved for new terminals only',
          truth: { kind: 'envVar', name: 'QUILL_ENV', scope: 'newTerminal', exists: true },
        },
        { id: 'case', text: 'Variable names are case-sensitive' },
      ],
      explain: "export is bash. PowerShell said it's not recognized, so nothing was set anywhere.",
    },
    {
      kind: 'approve',
      id: 'etw-approve-replace-env',
      prompt: 'Otto stands in the API. Allow?',
      concept: 'approvals',
      setup: nodeLaptop().cd(API).toSpec(),
      action: {
        do: 'run',
        line: "Set-Content .env 'QUILL_DEBUG=true'",
        say: 'Saving QUILL_DEBUG so it outlasts this terminal.',
      },
      guards: [PORT_KEPT],
      explain: 'Set-Content replaces the whole file, so PORT=3000 goes. Add-Content keeps it.',
    },
    {
      kind: 'approve',
      id: 'etw-approve-append-env',
      prompt: 'Otto stands in the API. Allow?',
      concept: 'approvals',
      setup: nodeLaptop().cd(API).toSpec(),
      action: {
        do: 'run',
        line: "Add-Content .env 'QUILL_DEBUG=true'",
        say: 'Saving QUILL_DEBUG so it outlasts this terminal.',
      },
      guards: [PORT_KEPT],
      explain: 'Add-Content adds one line at the end. PORT=3000 stays.',
    },
    {
      kind: 'fix',
      id: 'etw-fix-stale-path',
      prompt: 'Node installed after PS 1 opened, and npm is not recognized. Which fix works?',
      concept: 'environment',
      setup: nodeLaptop().pathAdd('machine', NODE_DIR, 'end').toSpec(),
      goal: { ...NODE_ON_PATH, label: "Otto's terminal has Node on its PATH" },
      failIf: [not(NODE_INSTALLED)],
      options: [
        { id: 'new-tab', text: 'Open a new terminal.', script: [{ do: 'newTerminal' }] },
        {
          id: 'reinstall',
          text: 'Remove Node so it can be reinstalled.',
          script: [{ do: 'run', line: `Remove-Item '${NODE_DIR}' -Recurse` }],
        },
        {
          id: 'cd-node',
          text: "Go into Node's folder.",
          script: [{ do: 'run', line: `cd '${NODE_DIR}'` }],
        },
        {
          id: 'print',
          text: 'Print PATH again.',
          script: [{ do: 'run', line: 'Write-Output $env:Path' }],
        },
      ],
      explain:
        'A new terminal copies the saved PATH, Node included. Standing in a folder adds nothing to PATH.',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Node is broken on the build box',
      body: "'node is not recognized' since yesterday. Don't reinstall anything.",
    },
    candidates: [
      {
        id: 'what-changed',
        text: 'What changed on the build box yesterday: an install, or a PATH edit?',
        quality: 'strong',
        rationale: 'Something changed when it broke. A PATH edit or an install is the usual cause.',
      },
      {
        id: 'new-terminals',
        text: 'Does a newly opened terminal fail too, or only one that was already open?',
        quality: 'strong',
        rationale: 'A fresh terminal tells a stale copy of PATH apart from a missing program.',
      },
      {
        id: 'which-version',
        text: 'Which Node version should the build use?',
        quality: 'okay',
        rationale: 'Useful later, but "not recognized" is about finding Node at all.',
      },
      {
        id: 'admin',
        text: 'Do I have admin rights on the build box?',
        quality: 'okay',
        rationale: 'You may need them to change the system PATH, once you know that is it.',
      },
      {
        id: 'full-log',
        text: 'Can you send the full build log?',
        quality: 'okay',
        rationale: 'More evidence helps, but the error line already says what failed.',
      },
      {
        id: 'reinstall',
        text: 'Can I just reinstall Node to be sure?',
        quality: 'weak',
        rationale: 'Marco said not to. A reinstall hides the cause instead of finding it.',
      },
      {
        id: 'mac',
        text: 'Would this happen on a Mac?',
        quality: 'weak',
        rationale: 'The build box runs Windows. It does not help fix this one.',
      },
      {
        id: 'who-touched',
        text: 'Who touched the build box?',
        quality: 'weak',
        rationale: 'Sounds like blame. Ask what changed, not who changed it.',
      },
    ],
    rubric:
      'A strong question asks what changed yesterday, or whether a freshly opened terminal fails too.',
  },
};
