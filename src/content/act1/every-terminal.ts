import type { Predicate } from '../../game/missions/predicates';
import type { MissionInput } from '../../game/missions/schema';
import { API, DEV_KEY, HOME, laptop } from './shared';

/**
 * Mission 1.4, Every Terminal Is Its Own World (docs/act1-directed.md section 3): a
 * terminal copies the saved variables and PATH when it opens. A $env: change lives only in
 * the terminal it was typed in, until that terminal closes, and saved changes reach only
 * terminals opened after them. "Not recognized" means: not on this terminal's PATH.
 *
 * A real agent's terminals copy the agent's own variables, not the saved ones, so the
 * lessons say what "a new terminal" means there: restart the agent.
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
/** The API's .env as Mission 1.3 left it: the port, a blank DATABASE_URL, and Sage's key. */
const ENV_SETTINGS = `PORT=3000\nDATABASE_URL=\nQUILL_API_KEY=${DEV_KEY}\n`;

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

/**
 * What Otto saw in PS 1, for the drills: no nodejs on its PATH, Node's folder there, npm
 * not found. The evidence is shown, so the prompt needn't give the cause away.
 */
const STALE_TAB_EVIDENCE = [
  { do: 'run', line: 'Write-Output $env:Path' },
  { do: 'run', line: `Get-ChildItem '${NODE_DIR}'` },
  { do: 'run', line: 'npm --version', fails: true },
] as const;

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
};
/** Replacing .env would lose the key too, the bigger loss: Kyle would need Sage again. */
const ENV_KEPT: Predicate = {
  kind: 'all',
  of: [PORT_KEPT, { kind: 'driveFile', path: ENV_FILE, contains: `QUILL_API_KEY=${DEV_KEY}` }],
  label: '.env keeps PORT and the key',
};
/** Anything Otto prints stays in his context (Mission 1.3), so he checks .env by its ends. */
const KEY_UNSEEN: Predicate = {
  kind: 'not',
  predicate: { kind: 'secretShown', secret: DEV_KEY },
  label: 'Otto never saw the key',
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
      '"Not recognized" means: not on this terminal\'s PATH. Saved changes reach only new terminals. A real agent\'s terminals copy the agent, so restart it.',
    ],
    diagram: 'lanterns-and-corkboard',
  },
  initialRepoState: nodeLaptop().toSpec(),
  steps: [
    {
      id: 'npm-not-recognized',
      instruction: 'Get Otto a terminal that can find Node.',
      success: { ...NODE_ON_PATH, label: "Otto's terminal has Node on its PATH" },
      hints: [
        "Node's installer ran this morning. When did Otto's terminal open?",
        'A terminal copies PATH when it opens. Later changes reach only new terminals.',
        'Pick the card that opens a new terminal and shows its PATH.',
      ],
      agent: {
        before: [INSTALL_NODE],
        // The symptom is told, not shown: the laptop can't run programs, so npm is never
        // found in any terminal, and a card that ran it would contradict the lesson.
        note: "Otto's npm says 'not recognized'. Node installed this morning, after his terminal opened. This laptop can't run programs yet, so cards read PATH.",
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
                // Otto's terminal isn't elevated, so Windows refuses: nothing changes, so
                // nothing pauses. Node was fine anyway: only the terminal's copy was old.
                line: `Remove-Item '${NODE_DIR}' -Recurse`,
                fails: true,
                say: 'npm looks broken. Removing Node to start clean.',
              },
            ],
            claim: 'Windows blocked me. Reinstall Node as admin, and npm works.',
            lesson:
              "Node was fine: Otto's terminal opened before the install. Program Files needs an admin, so Windows refused the delete.",
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
            // Otto read his own printout wrong: a claim over the evidence, like print-here.
            slip: 'overclaim',
          },
          {
            id: 'new-terminal',
            text: 'Open a new terminal, then show its PATH.',
            quality: 'strong',
            covers: ['goal', 'place', 'check'],
            intents: ['open a new terminal', 'fresh terminal', 'new tab then path'],
            script: [{ do: 'newTerminal' }, { do: 'run', line: 'Write-Output $env:Path' }],
            claim: "Done: the new terminal's PATH has Node's folder.",
            lesson:
              "A new terminal copies the saved PATH. A real agent's terminals copy the agent's own PATH, so restart the agent.",
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
            lesson:
              'The fix was a fresh terminal, not a reinstall. With a real agent, restart the agent.',
          },
        ],
        hintPlan: 'new-terminal',
        check: {
          // About finding Node, which is what the step asks. Windows refuses the only delete,
          // so Node is always there, and PATH alone tells the two answers apart.
          question: "Can Otto's terminal find Node now?",
          options: [
            {
              id: 'fresh',
              text: 'Yes: its PATH lists nodejs, and Node is there',
              truth: { kind: 'all', of: [NODE_ON_PATH, NODE_INSTALLED] },
              feedback: 'A terminal opened after the install copied the new PATH.',
            },
            {
              id: 'stale',
              text: 'No: its PATH copy is older than the install',
              truth: { kind: 'all', of: [not(NODE_ON_PATH), NODE_INSTALLED] },
              feedback: 'Read the PATH Otto printed: no nodejs. It was copied before the install.',
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
              'Saved variables reach terminals opened after the save; the printed dev proves it. A real agent sees them once restarted.',
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
              feedback: 'It opened after the save, then moved to the API.',
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
            // The terminal-scope trap: a check, in a terminal tonight's restart will close.
            id: 'check-here',
            text: "Print QUILL_DEBUG here, to make sure it's set.",
            quality: 'okay',
            covers: ['goal', 'check'],
            intents: ['print quill_debug here', 'make sure it is set'],
            script: [{ do: 'run', line: 'Write-Output $env:QUILL_DEBUG' }],
            claim: "Done: it prints true, so it's set for the API.",
            lesson:
              "It's true in this terminal only. Tonight's restart closes it, and the $env: change goes with it.",
            // Trusted one terminal's copy as if it were saved, like trust-the-save.
            slip: 'stale-terminal',
          },
          {
            id: 'append-env',
            text: "Append QUILL_DEBUG=true to the API's .env. Show its ends, not the key.",
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['append to .env', 'add one line to the env file'],
            // The key is on line 3, so the first and last lines prove the append without
            // putting it in Otto's context.
            script: [
              { do: 'run', line: `Add-Content ${API_PATH}\\.env 'QUILL_DEBUG=true'` },
              { do: 'run', line: `Get-Content ${API_PATH}\\.env -TotalCount 1` },
              { do: 'run', line: `Get-Content ${API_PATH}\\.env -Tail 1` },
            ],
            claim: 'Done: line 1 is still PORT=3000, and the last is QUILL_DEBUG=true.',
            lesson:
              'The API reads .env at every start, from any terminal. Otto showed both ends of .env, never the key line.',
          },
        ],
        fixes: [
          {
            id: 'save-it',
            text: '$env: dies tonight. Append QUILL_DEBUG=true to .env.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['save it in .env', 'append it to the env file'],
            script: [{ do: 'run', line: `Add-Content ${API_PATH}\\.env 'QUILL_DEBUG=true'` }],
            claim: 'Fixed: .env sets QUILL_DEBUG=true.',
            lesson:
              'A file outlasts any terminal. Next time, also ask Otto to show the line landed.',
          },
        ],
        hintPlan: 'append-env',
        check: {
          question: "After tonight's restart, where will QUILL_DEBUG=true still be?",
          options: [
            {
              id: 'dotenv',
              text: "In the API's .env, beside PORT and the key",
              truth: { kind: 'all', of: [DEBUG_IN_ENV, ENV_KEPT] },
              feedback: 'The API reads .env each time it starts.',
            },
            {
              id: 'nowhere',
              text: 'Nowhere: it lived only in a terminal',
              truth: not(DEBUG_IN_ENV),
              feedback: '$env: lasts until the terminal closes. Nothing saved it.',
            },
          ],
        },
        guards: [ENV_KEPT, KEY_UNSEEN],
        // Neither look prints the key's line: Kyle's looks run in Otto's terminal too.
        looks: [
          {
            id: 'env',
            label: ".env's first two lines",
            line: `Get-Content ${API_PATH}\\.env -TotalCount 2`,
          },
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
      prompt: "Otto's npm failed in PS 1. Why?",
      concept: 'environment',
      setup: nodeLaptop().pathAdd('machine', NODE_DIR, 'end').toSpec(),
      history: [...STALE_TAB_EVIDENCE],
      options: [
        {
          id: 'stale',
          text: "PS 1's PATH copy is older than Node's install",
          truth: {
            kind: 'all',
            of: [{ ...NODE_ON_PATH, scope: 'newTerminal' }, not(NODE_ON_PATH)],
          },
        },
        { id: 'missing', text: "Node isn't installed", truth: not(NODE_INSTALLED) },
        { id: 'admin', text: 'npm needs an administrator terminal' },
      ],
      explain:
        "Node's folder is there, but PS 1's PATH lacks it: PS 1 copied PATH before the install. A new terminal's PATH has it.",
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
      id: 'etw-approve-clear-path',
      prompt: 'Node installed after PS 1 opened. Otto is in PS 1. Allow?',
      concept: 'environment',
      setup: nodeLaptop().pathAdd('machine', NODE_DIR, 'end').toSpec(),
      // A terminal-scope trap: removing PS 1's copy reloads nothing from the saved PATH.
      action: {
        do: 'run',
        line: 'Remove-Item Env:Path',
        say: "Clearing this terminal's old PATH so it reloads.",
      },
      guards: [
        {
          kind: 'envVar',
          name: 'Path',
          contains: 'C:\\Windows\\system32',
          label: 'PS 1 can still find programs',
        },
      ],
      explain:
        'A terminal copies PATH once, as it opens. Removing it reloads nothing: PS 1 would find no programs at all. Open a new terminal instead.',
    },
    {
      kind: 'approve',
      id: 'etw-approve-append-env',
      // Drills hide the effects list, so the prompt says what .env already holds.
      prompt: "Otto stands in the API. The API's .env holds PORT=3000 and the API key. Allow?",
      concept: 'approvals',
      setup: nodeLaptop().cd(API).toSpec(),
      action: {
        do: 'run',
        line: "Add-Content .env 'QUILL_DEBUG=true'",
        say: 'Saving QUILL_DEBUG so it outlasts this terminal.',
      },
      guards: [ENV_KEPT],
      explain:
        'Add-Content adds one line at the end, so PORT=3000 and the key stay. The API reads it at every start, from any terminal.',
    },
    {
      kind: 'fix',
      id: 'etw-fix-stale-path',
      prompt: "Otto's npm failed in PS 1. Which fix works?",
      concept: 'environment',
      setup: nodeLaptop().pathAdd('machine', NODE_DIR, 'end').toSpec(),
      history: [...STALE_TAB_EVIDENCE],
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
        'A new terminal copies the saved PATH, Node included. Program Files refuses deletes without an admin, and standing in a folder adds nothing to PATH.',
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
