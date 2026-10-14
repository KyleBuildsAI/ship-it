import type { Predicate } from '../../game/missions/predicates';
import type { MissionInput } from '../../game/missions/schema';
import { API, laptop, WEB } from './shared';

/**
 * Mission 1.2, Deletes Are Forever (docs/act1-directed.md section 3): a delete in the
 * terminal skips the Recycle Bin, so read its scope before you allow it, and make undo
 * possible before a risky edit. Otto clears junk, deletes old logs past PowerShell's own
 * Confirm question, and edits a config file. Nothing here says which line is harmful: a
 * dry run against the guards works that out, and deletes-are-forever.test.ts plays every
 * card to prove it.
 */

/** The full path Otto types, as Windows spells it. */
const API_PATH = 'C:\\Users\\kyle\\quillwork\\api';

const TMP = `${API}/tmp`;
const LOGS = `${API}/logs`;
const CONFIG = `${API}/config.json`;
const BACKUP = `${API}/config.backup.json`;
const INCIDENT = `${LOGS}/incident-2026-09.md`;
const JUNK = [`${TMP}/cache-01.tmp`, `${TMP}/cache-02.tmp`, `${TMP}/build/bundle.js`] as const;
const OLD_LOGS = [
  `${LOGS}/app-2026-07.log`,
  `${LOGS}/app-2026-08.log`,
  `${LOGS}/app-2026-09.log`,
] as const;

/** config.json as it is. */
const CONFIG_8080 = '{\n  "port": 8080,\n  "timeout": 30,\n  "retries": 3\n}\n';
/** Otto's lossy rewrite: the whole file replaced, two settings gone. The `wrong-verb` slip. */
const PORT_ONLY = '{\n  "port": 3000\n}\n';

const file = (path: string) => ({ kind: 'driveFile', path }) as const;
const missing = (path: string) => ({ kind: 'driveFile', path, exists: false }) as const;
const has = (path: string, text: string) => ({ kind: 'driveFile', path, contains: text }) as const;
const not = (predicate: Predicate): Predicate => ({ kind: 'not', predicate });

const API_INTACT = { ...file(`${API}/package.json`), label: 'The API is intact' };
const CODE_INTACT = { ...file(`${API}/src/routes/notes.js`), label: "The API's code survives" };
const REPORT_SURVIVES = { ...file(INCIDENT), label: "Marco's incident report survived" };
const KEEPS_SETTINGS = '"retries": 3';
const PORT_3000 = '"port": 3000';
/**
 * The small edit: Otto's edit tool changes the port in config.json as it is now. It never
 * carries the whole file, so it can't put back settings a lossy write already dropped.
 */
const PORT_EDIT = {
  do: 'edit',
  path: CONFIG,
  find: '"port": 8080',
  replace: PORT_3000,
  say: 'Changing only the port.',
} as const;
/** config.json on port 3000 with nothing lost. */
const SETTINGS_KEPT = [
  has(CONFIG, PORT_3000),
  has(CONFIG, '"timeout": 30'),
  has(CONFIG, KEEPS_SETTINGS),
] as const;
/** A write that drops settings is harmful, backup or not: stop it and ask for a small edit. */
const CONFIG_KEEPS: Predicate = {
  ...has(CONFIG, KEEPS_SETTINGS),
  label: 'config.json keeps its settings',
};
/**
 * The old settings live somewhere: in config.json, or in a backup. Guarded beside
 * CONFIG_KEEPS so that, once config.json has lost them, copying over the only good backup
 * is harmful too.
 */
const UNDO_POSSIBLE: Predicate = {
  kind: 'any',
  of: [has(CONFIG, KEEPS_SETTINGS), has(BACKUP, KEEPS_SETTINGS)],
  label: 'Your old settings can be restored',
};

/** Kyle's laptop for this mission: the API now has junk, old logs and a config file. */
const daf = () =>
  laptop()
    .write(JUNK[0], 'cache\n')
    .write(JUNK[1], 'cache\n')
    .write(JUNK[2], '// build output\n')
    .write(OLD_LOGS[0], 'July log\n')
    .write(OLD_LOGS[1], 'August log\n')
    .write(OLD_LOGS[2], 'September log\n')
    .write(INCIDENT, '# Incident, September 2026\n\nThe API went down for an hour.\n')
    .write(CONFIG, CONFIG_8080);

const IN_API = [{ op: 'cd', path: API }] as const;

export const deletesAreForever: MissionInput = {
  id: 'deletes-are-forever',
  act: 1,
  title: 'Deletes Are Forever',
  xp: 100,
  approvals: 'destructive',
  briefing: {
    sceneId: 'machine-island',
    captions: [
      "The API's folder needs tidying before Friday. Otto deletes fast, so you read before you allow.",
      'A delete in the terminal skips the Recycle Bin. Nothing comes back.',
      "Read a delete's scope first: the folder, the wildcard, -Recurse, and what PowerShell asks.",
    ],
    diagram: 'blast-radius',
  },
  initialRepoState: daf().toSpec(),
  steps: [
    {
      id: 'clear-tmp',
      instruction: "The API's tmp folder is full of junk. Have Otto clear it out.",
      success: {
        kind: 'all',
        of: [{ kind: 'driveFolder', path: TMP }, ...JUNK.map(missing)],
        label: 'tmp is there, and empty',
      },
      hints: [
        'Where does Otto stand? What does * match in that folder?',
        'A wildcard matches everything in its folder. Name tmp in the path, so only tmp goes.',
        'Pick the card that deletes the full path to tmp, then makes it again.',
      ],
      agent: {
        before: IN_API,
        note: 'Otto stands in the API folder. Terminal deletes skip the Recycle Bin.',
        focus: [API, TMP],
        plans: [
          {
            id: 'clean-up',
            text: 'Clean up the junk.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['clean up the junk', 'clean up', 'delete the junk'],
            script: [
              {
                do: 'run',
                line: 'Remove-Item * -Recurse -Force',
                say: 'Clearing out the junk.',
                denyLine: 'Good stop. That was the whole project.',
              },
            ],
            claim: 'Done: the junk is gone.',
            lesson: '* matched everything where Otto stood: the whole API, not just tmp.',
            slip: 'too-broad',
          },
          {
            id: 'inside-tmp',
            text: 'Delete everything inside tmp.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['everything inside tmp', 'empty tmp', 'delete inside tmp'],
            script: [
              {
                do: 'run',
                line: 'Remove-Item .\\* -Recurse',
                // Otto dropped tmp\ from the path. Denying it gets the line he meant.
                onDeny: [{ do: 'run', line: 'Remove-Item .\\tmp\\* -Recurse' }],
                denyLine: 'Good stop. That was the whole project.',
              },
            ],
            claim: 'Done: tmp is empty.',
            lesson:
              'Otto dropped tmp\\ from the path, so .\\* meant the whole API. Read the scope.',
            slip: 'too-broad',
          },
          {
            id: 'whole-tmp',
            text: `Delete ${API_PATH}\\tmp and everything in it, then make it again.`,
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['full path to tmp', 'delete tmp then make it again', 'recreate tmp'],
            script: [
              { do: 'run', line: `Remove-Item ${API_PATH}\\tmp -Recurse` },
              { do: 'run', line: `mkdir ${API_PATH}\\tmp` },
              { do: 'run', line: `Get-ChildItem ${API_PATH}` },
            ],
            claim: 'Done: tmp is empty, and nothing else changed.',
            lesson: 'A full path kept the delete small: the gate listed only tmp and its items.',
          },
        ],
        fixes: [
          {
            id: 'just-tmp',
            text: 'Make sure tmp exists, then delete only .\\tmp\\*.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['only inside tmp', 'dot tmp star', 'make tmp again'],
            // -Force makes tmp if a Stop left it deleted, and is fine when tmp is there.
            script: [
              { do: 'run', line: 'mkdir .\\tmp -Force' },
              { do: 'run', line: 'Remove-Item .\\tmp\\* -Recurse' },
            ],
            claim: 'Fixed: tmp is there, and empty.',
            lesson: 'Naming tmp in the path limits the wildcard to tmp.',
          },
        ],
        hintPlan: 'whole-tmp',
        check: {
          question: 'What is left in the API?',
          options: [
            {
              id: 'just-tmp',
              text: "Everything but tmp's junk",
              truth: { kind: 'all', of: [file(`${API}/package.json`), missing(JUNK[0])] },
              feedback: 'List the API: package.json, server.js and src are all still there.',
            },
            {
              id: 'wiped',
              text: 'Almost nothing: the whole project went',
              truth: missing(`${API}/package.json`),
              feedback: 'List the API. The wildcard took every file, and the Recycle Bin is empty.',
            },
          ],
        },
        guards: [API_INTACT, CODE_INTACT],
        looks: [
          { id: 'api', label: 'List the API', line: `Get-ChildItem ${API_PATH}` },
          { id: 'tmp', label: 'List tmp', line: `Get-ChildItem ${API_PATH}\\tmp` },
        ],
      },
    },
    {
      id: 'the-confirm-question',
      instruction: 'Have Otto delete the old logs.',
      success: {
        kind: 'all',
        of: OLD_LOGS.map(missing),
        label: 'The old .log files are gone',
      },
      hints: [
        'What else lives in logs besides the .log files?',
        'Deleting the folder takes everything inside. A wildcard like *.log names only the logs.',
        'Pick the card that deletes logs\\*.log, then lists logs.',
      ],
      agent: {
        before: IN_API,
        focus: [API, LOGS],
        plans: [
          {
            id: 'no-questions',
            text: "Delete logs, and don't stop to ask me.",
            quality: 'weak',
            covers: ['goal'],
            intents: ['delete logs', "don't ask", 'no questions'],
            script: [
              {
                do: 'run',
                line: 'Remove-Item logs -Recurse -Force',
                say: 'Deleting logs. No questions, as asked.',
                denyLine: 'Good stop. The incident report was in there.',
              },
            ],
            claim: 'Done: the old logs are gone.',
            lesson: '-Recurse skipped the question and took the whole folder, report and all.',
            slip: 'too-broad',
          },
          {
            id: 'logs-folder',
            text: 'Delete the logs folder.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['delete the logs folder', 'remove logs'],
            script: [
              {
                do: 'run',
                line: 'Remove-Item logs',
                // PowerShell asks before taking a folder with things in it. Otto answers
                // for Kyle, and his A for Yes to All is what pauses.
                answer: 'A',
                predict: {
                  question: 'Before Otto runs it: what will PowerShell do?',
                  options: [
                    {
                      id: 'asks',
                      text: 'Ask first: logs has files in it',
                      outcome: { result: 'ok', printed: 'Confirm' },
                    },
                    {
                      id: 'deletes',
                      text: 'Delete logs straight away',
                      outcome: {
                        result: 'ok',
                        state: { kind: 'driveFolder', path: LOGS, exists: false },
                      },
                    },
                    { id: 'fails', text: 'Fail with an error', outcome: { result: 'error' } },
                  ],
                },
                onDeny: [{ do: 'run', line: 'Remove-Item logs\\*.log' }],
                denyLine: 'Good stop. Only the .log files, then.',
              },
            ],
            claim: 'Done: the old logs are gone.',
            lesson: "PowerShell's question said all children go too. Otto answered A for you.",
            slip: 'too-broad',
          },
          {
            id: 'only-logs',
            text: 'Delete only logs\\*.log, then list logs.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['only the log files', 'star dot log', 'then list logs'],
            script: [
              { do: 'run', line: `Remove-Item ${API_PATH}\\logs\\*.log` },
              { do: 'run', line: `Get-ChildItem ${API_PATH}\\logs` },
            ],
            claim: "Done: the .log files are gone, and Marco's report stayed.",
            lesson:
              'A wildcard that names the files you mean leaves the rest, and the list proves it.',
          },
        ],
        fixes: [
          {
            id: 'just-log-files',
            text: 'Delete only the .log files in logs.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['only the .log files', 'log files only'],
            script: [{ do: 'run', line: 'Remove-Item logs\\*.log' }],
            claim: 'Fixed: only the .log files are gone.',
            lesson: '*.log matches only the logs. The report is not a .log file.',
          },
        ],
        hintPlan: 'only-logs',
        check: {
          question: 'What is in logs now?',
          options: [
            {
              id: 'report-only',
              text: "Only Marco's incident report",
              truth: { kind: 'all', of: [file(INCIDENT), missing(OLD_LOGS[0])] },
              feedback: 'List logs: the incident report is still there.',
            },
            {
              id: 'nothing',
              text: 'Nothing: logs is gone, report and all',
              truth: missing(INCIDENT),
              feedback: 'List the API: logs is gone. Answering A said yes to every child.',
            },
          ],
        },
        guards: [REPORT_SURVIVES, API_INTACT],
        looks: [
          { id: 'logs', label: 'List logs', line: `Get-ChildItem ${API_PATH}\\logs` },
          { id: 'api', label: 'List the API', line: `Get-ChildItem ${API_PATH}` },
        ],
      },
    },
    {
      id: 'backup-first',
      instruction: "Otto will set config.json's port to 3000. Make sure you can undo it.",
      // The goal is an edit you can undo: the new config, and a backup of the old one. Every
      // card that changes only the port uses Otto's edit tool, so a backup made after a lossy
      // write holds the lossy file, and no card can write the lost settings back from memory.
      success: {
        kind: 'all',
        of: [...SETTINGS_KEPT, has(BACKUP, KEEPS_SETTINGS)],
        label: 'Port 3000, with a backup to undo',
      },
      hints: [
        "If Otto's edit goes wrong, what would you restore it from?",
        'Copy the file first. A backup makes an edit undoable, even a bad one.',
        'Pick the card that backs up config.json and changes only the port.',
      ],
      agent: {
        before: IN_API,
        focus: [API],
        plans: [
          {
            id: 'just-edit',
            text: 'Change config.json to port 3000.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['change the port', 'port 3000', 'edit config'],
            script: [
              {
                do: 'write',
                path: CONFIG,
                content: PORT_ONLY,
                say: 'Writing the new config.json.',
                denyLine: 'Good stop. I would have dropped two settings.',
              },
            ],
            claim: 'Done: config.json uses port 3000.',
            lesson:
              'Otto rewrote the whole file and dropped two settings. With no copy, they are gone.',
            slip: 'wrong-verb',
          },
          {
            id: 'backup-then-edit',
            text: 'Copy config.json to config.backup.json, then change it to port 3000.',
            quality: 'okay',
            covers: ['goal', 'limits'],
            intents: ['back it up first', 'copy then change'],
            script: [
              { do: 'run', line: 'Copy-Item config.json config.backup.json' },
              {
                do: 'write',
                path: CONFIG,
                content: PORT_ONLY,
                say: 'Writing the new config.json.',
                // Denied, Otto makes the small edit he should have made.
                onDeny: [PORT_EDIT],
                denyLine: 'Good stop. Only the port, then.',
              },
            ],
            claim: 'Done: port 3000, and there is a backup.',
            lesson:
              'Otto still rewrote the whole file. Deny stops the loss; allowed, the backup can undo it.',
            slip: 'wrong-verb',
          },
          {
            id: 'backup-keep-rest',
            text: 'Back up config.json, then change only the port. Keep every other setting.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['back up then change only the port', 'keep every other setting'],
            script: [
              {
                do: 'run',
                line: `Copy-Item ${API_PATH}\\config.json ${API_PATH}\\config.backup.json`,
              },
              PORT_EDIT,
              { do: 'run', line: `Get-Content ${API_PATH}\\config.json` },
            ],
            claim: 'Done: port 3000, settings kept, backup beside it.',
            lesson: 'The backup made the edit undoable, and naming what stays kept it small.',
          },
        ],
        fixes: [
          {
            id: 'restore-and-edit',
            text: 'Copy the backup over config.json, then change only the port.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['restore the backup then change the port', 'copy the backup back'],
            script: [
              // With no backup this line fails, and Otto stops there (failedUnplanned).
              { do: 'run', line: 'Copy-Item config.backup.json config.json' },
              PORT_EDIT,
            ],
            claim: 'Fixed: port 3000, and every setting is back.',
            lesson: 'The backup was your undo. Restore first, then make the small edit.',
          },
          {
            id: 'restore-only',
            text: 'Copy the backup back over config.json.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['restore the backup', 'undo the edit'],
            script: [{ do: 'run', line: 'Copy-Item config.backup.json config.json' }],
            claim: 'Fixed: config.json is restored.',
            lesson: 'Your settings are back, but so is port 8080.',
          },
        ],
        hintPlan: 'backup-keep-rest',
        check: {
          question: 'What does config.json hold, and can you undo it?',
          options: [
            {
              id: 'kept',
              text: 'Port 3000, every setting kept, and a backup',
              truth: { kind: 'all', of: [...SETTINGS_KEPT, has(BACKUP, KEEPS_SETTINGS)] },
              feedback: 'Show config.json: timeout and retries are still in it.',
            },
            {
              id: 'backed-up',
              text: 'Only the port; the backup holds the rest',
              truth: {
                kind: 'all',
                of: [
                  has(CONFIG, PORT_3000),
                  not(has(CONFIG, KEEPS_SETTINGS)),
                  has(BACKUP, KEEPS_SETTINGS),
                ],
              },
              feedback: 'Show config.json: only the port is left. The backup still has the rest.',
            },
            {
              id: 'no-backup',
              text: 'No backup holds the old settings',
              truth: not(has(BACKUP, KEEPS_SETTINGS)),
              feedback: 'List the API: no config.backup.json holds timeout and retries.',
            },
            {
              id: 'unchanged',
              text: 'Still port 8080, with a backup beside it',
              truth: {
                kind: 'all',
                of: [has(CONFIG, '"port": 8080'), has(BACKUP, KEEPS_SETTINGS)],
              },
              feedback: 'Show config.json: the port is still 8080.',
            },
          ],
        },
        guards: [CONFIG_KEEPS, UNDO_POSSIBLE, API_INTACT],
        looks: [
          { id: 'config', label: 'Show config.json', line: `Get-Content ${API_PATH}\\config.json` },
          { id: 'api', label: 'List the API', line: `Get-ChildItem ${API_PATH}` },
        ],
      },
    },
  ],
  drills: [
    {
      kind: 'approve',
      id: 'daf-approve-wildcard',
      prompt: 'Otto stands in the API. Allow?',
      concept: 'scope',
      setup: daf().cd(API).toSpec(),
      action: { do: 'run', line: 'Remove-Item * -Recurse', say: 'Clearing out the junk.' },
      guards: [API_INTACT],
      explain:
        '* matches everything in the folder Otto stands in. In the API, that is the project.',
    },
    {
      kind: 'approve',
      id: 'daf-approve-dist',
      prompt: 'Otto stands in the web app. dist holds only build output. Allow?',
      concept: 'scope',
      setup: laptop()
        .write(`${WEB}/dist/app.js`, '// built\n')
        .write(`${WEB}/dist/app.css`, '/* built */\n')
        .cd(WEB)
        .toSpec(),
      action: {
        do: 'run',
        line: 'Remove-Item dist -Recurse',
        say: 'Removing the old build output.',
      },
      guards: [
        { ...file(`${WEB}/index.html`), label: "The web app's page survives" },
        { ...file(`${WEB}/package.json`), label: 'The web app is intact' },
      ],
      explain:
        'dist holds only build output. -Recurse takes dist alone, and a build makes it again.',
    },
    {
      kind: 'predict',
      id: 'daf-predict-confirm',
      prompt: 'Otto stands in the API. What happens?',
      concept: 'confirm',
      setup: daf().cd(API).toSpec(),
      action: { do: 'run', line: 'Remove-Item logs' },
      options: [
        {
          id: 'asks',
          text: 'PowerShell asks first',
          outcome: { result: 'ok', printed: 'Confirm' },
        },
        {
          id: 'deletes',
          text: 'logs is deleted at once',
          outcome: { result: 'ok', state: { kind: 'driveFolder', path: LOGS, exists: false } },
        },
        { id: 'error', text: 'An error: it is a folder', outcome: { result: 'error' } },
      ],
      explain:
        'logs has files in it and there is no -Recurse, so PowerShell asks before taking them.',
    },
    {
      kind: 'predict',
      id: 'daf-predict-wildcard',
      prompt: 'Otto stands in the API, not in logs. What does this delete?',
      concept: 'scope',
      setup: daf().cd(API).toSpec(),
      action: { do: 'run', line: 'Remove-Item *.log' },
      options: [
        {
          id: 'nothing',
          text: 'Nothing: no .log files sit in the API itself',
          outcome: { result: 'ok', state: file(OLD_LOGS[0]) },
        },
        { id: 'logs', text: 'The .log files in logs', outcome: { state: missing(OLD_LOGS[0]) } },
        { id: 'error', text: 'An error', outcome: { result: 'error' } },
      ],
      explain: 'A wildcard matches only in its own folder. The .log files are one folder down.',
    },
    {
      kind: 'diagnose',
      id: 'daf-diagnose-moved',
      prompt: 'Otto moved README.md into docs. Is he right?',
      concept: 'backups',
      setup: daf().write(`${API}/docs/setup.md`, '# Setup\n').cd(API).toSpec(),
      history: [{ do: 'run', line: 'Move-Item README.md docs' }],
      claim: 'Done: README.md is backed up in docs.',
      options: [
        {
          id: 'moved',
          text: 'No: it moved, so the API has no README.md now',
          truth: { kind: 'all', of: [file(`${API}/docs/README.md`), missing(`${API}/README.md`)] },
        },
        {
          id: 'copied',
          text: 'Yes: there are two copies now',
          truth: { kind: 'all', of: [file(`${API}/docs/README.md`), file(`${API}/README.md`)] },
        },
        {
          id: 'deleted',
          text: 'No: Move-Item deleted it',
          truth: {
            kind: 'all',
            of: [missing(`${API}/docs/README.md`), missing(`${API}/README.md`)],
          },
        },
      ],
      explain: 'Move-Item leaves no copy behind. A backup needs Copy-Item.',
    },
    {
      kind: 'fix',
      id: 'daf-fix-restore',
      prompt: "Otto's edit dropped two settings. Which fix gets them back and keeps the backup?",
      concept: 'backups',
      setup: daf().write(BACKUP, CONFIG_8080).write(CONFIG, PORT_ONLY).cd(API).toSpec(),
      goal: has(CONFIG, KEEPS_SETTINGS),
      failIf: [missing(BACKUP)],
      options: [
        {
          id: 'copy-back',
          text: 'Copy config.backup.json over config.json.',
          script: [{ do: 'run', line: 'Copy-Item config.backup.json config.json' }],
        },
        {
          id: 'move-back',
          text: 'Move config.backup.json onto config.json.',
          script: [{ do: 'run', line: 'Move-Item config.backup.json config.json -Force' }],
        },
        {
          id: 'delete-it',
          text: 'Delete config.json and start again.',
          script: [{ do: 'run', line: 'Remove-Item config.json' }],
        },
      ],
      explain:
        'Copying back restores the settings and keeps the backup. A move uses the backup up.',
    },
    {
      kind: 'approve',
      id: 'daf-approve-diff',
      prompt: 'Otto wants to rewrite config.json. There is no backup. Allow?',
      concept: 'backups',
      setup: daf().cd(API).toSpec(),
      action: { do: 'write', path: CONFIG, content: PORT_ONLY, say: 'Setting the port to 3000.' },
      guards: [{ ...has(CONFIG, KEEPS_SETTINGS), label: 'config.json keeps its settings' }],
      explain: 'The new file has only the port. timeout and retries would be gone, with no copy.',
    },
    {
      kind: 'approve',
      id: 'daf-approve-port-edit',
      prompt: 'config.backup.json holds every setting. Otto edits only the port line. Allow?',
      concept: 'backups',
      setup: daf().write(BACKUP, CONFIG_8080).cd(API).toSpec(),
      action: PORT_EDIT,
      guards: [CONFIG_KEEPS, UNDO_POSSIBLE],
      explain:
        'The edit changes one line, and timeout and retries stay. A backup is beside it, so allow.',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Clean up the shared folder',
      body: 'Have Otto delete the old stuff before the audit, you know what I mean.',
    },
    candidates: [
      {
        id: 'define-old',
        text: 'What counts as old: older than which date, and which folders?',
        quality: 'strong',
        rationale: '"Old stuff" is the scope of the delete. Pin it before Otto runs anything.',
      },
      {
        id: 'backup',
        text: 'Is there a backup, or should we archive it instead of deleting?',
        quality: 'strong',
        rationale: 'A terminal delete is forever. Asking for an undo first is the safe move.',
      },
      {
        id: 'exact-path',
        text: 'What is the exact path of the shared folder?',
        quality: 'okay',
        rationale: 'Needed, but it still leaves which files count as old.',
      },
      {
        id: 'audit-date',
        text: 'When is the audit?',
        quality: 'okay',
        rationale: 'Sets the deadline, not what may be deleted.',
      },
      {
        id: 'who-uses',
        text: 'Who else keeps files in that folder?',
        quality: 'okay',
        rationale: 'Tells you whose work is at risk, but not what to delete.',
      },
      {
        id: 'explorer',
        text: 'Can I just do it in File Explorer?',
        quality: 'weak',
        rationale: 'A question about tools, not about what Marco wants gone.',
      },
      {
        id: 'who-made',
        text: 'Who made the mess in the first place?',
        quality: 'weak',
        rationale: 'Sounds like blame, and it does not help you delete the right things.',
      },
      {
        id: 'delete-all',
        text: 'Should Otto just delete everything in it?',
        quality: 'weak',
        rationale: 'The broadest scope there is, and nothing in the ticket asks for it.',
      },
    ],
    rubric:
      'A strong question pins what counts as old (date, folders) or asks for a backup or archive first.',
  },
};
