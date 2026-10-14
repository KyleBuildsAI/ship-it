import type { Predicate } from '../../game/missions/predicates';
import type { MissionInput } from '../../game/missions/schema';
import { API, HOME, laptop } from './shared';

/**
 * Mission 1.3, Secrets Stay Home (docs/act1-directed.md section 3): code and templates are
 * shared, secrets are not. Values live in .env, which git ignores; .env.example lists names
 * only. Anything Otto reads or prints stays in his context, so the key is the one thing
 * Kyle handles himself. Every change pauses (`changes`), so each edit shows what it does.
 *
 * Git works in the API here (decision D16), so `ignored` and `untracked` read its
 * repository. Nothing says which line is harmful: a dry run against the guards works that
 * out, and secrets-stay-home.test.ts plays every card to prove it.
 */

/** The full paths Otto types, as Windows spells them. */
const API_PATH = 'C:\\Users\\kyle\\quillwork\\api';
const KEYS_PATH = 'C:\\Users\\kyle\\Documents\\keys';

const ENV = `${API}/.env`;
const EXAMPLE = `${API}/.env.example`;
const GITIGNORE = `${API}/.gitignore`;
const README = `${API}/README.md`;
const KEY_FILE = `${HOME}/Documents/keys/quill-dev.txt`;

/**
 * Sage's dev key. Plainly fake on purpose: a real-looking key in the source would trip
 * gitleaks, which scans every commit, and the game teaches that keys never land in git.
 */
const KEY = 'dev-key-for-the-game-1234';

/** The template as committed: names, never values. QUILL_API_KEY comes in step 3. */
const TEMPLATE = 'PORT=\nDATABASE_URL=\n';
/** Lists .env.local, which is not .env: the near miss Otto skims past in step 2. */
const IGNORE_RULES = 'node_modules/\n.env.local\n';

const has = (path: string, text: string) => ({ kind: 'driveFile', path, contains: text }) as const;
const missing = (path: string) => ({ kind: 'driveFile', path, exists: false }) as const;
const not = (predicate: Predicate): Predicate => ({ kind: 'not', predicate });

const TEMPLATE_NAMES_ONLY: Predicate = {
  kind: 'driveFile',
  path: EXAMPLE,
  equals: TEMPLATE,
  label: '.env.example holds names only',
};
/**
 * .env, once made, keeps every name from the template. Before .env exists this holds, so
 * the guard only bites a line that replaces a copied .env with less.
 */
const ENV_KEEPS_NAMES: Predicate = {
  kind: 'any',
  of: [missing(ENV), has(ENV, 'DATABASE_URL=')],
  label: '.env keeps every name from the template',
};
/**
 * The whole PORT line reads 3000, not just some line containing it: an edit that lands on
 * a line already set would leave PORT=30003000, which a contains check would pass.
 */
const PORT_SET: Predicate = {
  kind: 'driveFile',
  path: ENV,
  pattern: '^PORT=3000\\r?$',
  flags: 'm',
};
const NAMES_KEPT = has(ENV, 'DATABASE_URL=');

const ENV_IGNORED: Predicate = { kind: 'ignored', paths: ['.env'] };
const RULES_KEPT: Predicate = {
  kind: 'all',
  of: [has(GITIGNORE, 'node_modules/'), has(GITIGNORE, '.env.local')],
  label: '.gitignore keeps its other rules',
};

/** The key went through Otto's hands: typed, written, or printed back to him. */
const KEY_SEEN: Predicate = { kind: 'secretShown', secret: KEY };
const KEY_UNSEEN: Predicate = { ...not(KEY_SEEN), label: 'Otto never saw the key' };
/** A copy of the key file in the API, with no rule hiding it, is one `git add` from shared. */
const KEY_COPY_SHAREABLE: Predicate = { kind: 'untracked', paths: ['quill-dev.txt'] };
const KEY_OFF_GIT: Predicate = {
  ...not(KEY_COPY_SHAREABLE),
  label: 'No key copy that git could share',
};
const KEY_IN_NO_SHARED_FILE: Predicate = {
  ...not({ kind: 'any', of: [has(EXAMPLE, KEY), has(README, KEY)] }),
  label: 'The key is in no shared file',
};
const KEY_NAMED = [has(EXAMPLE, 'QUILL_API_KEY='), has(ENV, 'QUILL_API_KEY=')] as const;

/**
 * Kyle's laptop for this mission: the API is a git repository with its template and
 * .gitignore committed, and Sage's dev key sits in Documents, outside every project.
 */
const ssh = () =>
  laptop({ mount: API })
    .write(EXAMPLE, TEMPLATE)
    .write(GITIGNORE, IGNORE_RULES)
    .write(KEY_FILE, `${KEY}\n`)
    .init()
    .stage('package.json', 'server.js', 'src/routes/notes.js', 'README.md', '.env.example')
    .stage('.gitignore')
    .commit('feat: start the quillwork api');

/** The laptop once Kyle has pasted the key into .env himself. */
const withKey = () => ssh().write(ENV, `PORT=3000\nDATABASE_URL=\nQUILL_API_KEY=${KEY}\n`);

const IN_API = [{ op: 'cd', path: API }] as const;

/**
 * The small edit: only the PORT line of .env changes, so every other name stays. It finds
 * the blank line with its line end, so it can only fill an empty PORT: on a .env copied
 * from a filled template it fails instead of making PORT=30003000.
 */
const PORT_EDIT = {
  do: 'edit',
  path: ENV,
  find: 'PORT=\n',
  replace: 'PORT=3000\n',
  say: 'Setting only the PORT line.',
} as const;

export const secretsStayHome: MissionInput = {
  id: 'secrets-stay-home',
  act: 1,
  title: 'Secrets Stay Home',
  xp: 100,
  approvals: 'changes',
  briefing: {
    sceneId: 'machine-island',
    captions: [
      'The API needs its settings and a key. Code is shared; secrets are not.',
      'Values live in .env, which git ignores. .env.example lists the names only.',
      'Anything Otto reads stays in his context. Secrets you handle yourself.',
    ],
    diagram: 'the-fence',
  },
  initialRepoState: ssh().toSpec(),
  steps: [
    {
      id: 'make-the-env',
      instruction: 'The API needs a .env with PORT=3000. Have Otto set it up from the template.',
      success: {
        kind: 'all',
        of: [TEMPLATE_NAMES_ONLY, PORT_SET, NAMES_KEPT],
        label: '.env has PORT=3000 and every name',
      },
      hints: [
        'Which file does git share with the team, and which stays on your laptop?',
        'Copy the template to .env, then change one line of the copy.',
        'Pick the card that copies .env.example, then sets only PORT.',
      ],
      agent: {
        before: IN_API,
        note: 'Every change Otto makes pauses for you here, like an agent asking for edits.',
        focus: [API],
        plans: [
          {
            id: 'fill-the-template',
            text: 'Put PORT=3000 in the env file.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['put port 3000 in the env file', 'set the port', 'env file port'],
            script: [
              {
                do: 'run',
                line: "Set-Content .env.example 'PORT=3000'",
                say: 'Setting the port in the env file.',
                denyLine: 'Good stop. The template is shared, so names only.',
              },
            ],
            claim: 'Done: PORT=3000 is in the env file.',
            lesson:
              'Otto filled .env.example, the template git shares. It holds names only; values go in .env.',
            slip: 'wrong-place',
          },
          {
            id: 'copy-then-set',
            text: 'Copy .env.example to .env, then set PORT=3000.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['copy the template then set the port', 'copy example to env'],
            script: [
              { do: 'run', line: 'Copy-Item .env.example .env' },
              {
                do: 'run',
                line: "Set-Content .env 'PORT=3000'",
                // Denied, Otto makes the one-line edit he should have made.
                onDeny: [PORT_EDIT],
                denyLine: 'Good stop. Only the PORT line, then.',
              },
            ],
            claim: 'Done: .env has PORT=3000.',
            lesson:
              'Set-Content replaced all of .env, so DATABASE_URL went. An edit changes one line.',
            slip: 'wrong-verb',
          },
          {
            id: 'copy-then-edit',
            text: 'Copy .env.example to .env, set only PORT=3000, then show the template.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['copy then set only the port', 'set only port then show the template'],
            script: [
              { do: 'run', line: `Copy-Item ${API_PATH}\\.env.example ${API_PATH}\\.env` },
              PORT_EDIT,
              // Otto checks the names, never .env: it holds no secret yet, but the drills
              // grade printing .env to Otto as a leak, so the strong card builds that habit.
              // Kyle can look at .env himself with the look chip.
              { do: 'run', line: `Get-Content ${API_PATH}\\.env.example` },
            ],
            claim: 'Done: .env has PORT=3000, and the template holds names only.',
            lesson: 'The template stayed names only, and a one-line edit kept every name in .env.',
          },
        ],
        fixes: [
          {
            id: 'start-over',
            text: 'Reset the template to names, copy it to .env, set only PORT.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['reset the template', 'start over from the template'],
            script: [
              // The names are no secret, and git has them: Otto can write them back.
              { do: 'write', path: EXAMPLE, content: TEMPLATE, say: 'Putting the names back.' },
              { do: 'run', line: 'Copy-Item .env.example .env' },
              PORT_EDIT,
            ],
            claim: 'Fixed: .env has PORT=3000, and the template is names only.',
            lesson:
              'A clean template, copied, then one line changed: every name kept, no value shared.',
          },
        ],
        hintPlan: 'copy-then-edit',
        check: {
          question: 'What do the env files hold now?',
          options: [
            {
              id: 'filled',
              text: '.env has PORT=3000 and every name; the template, names only',
              truth: { kind: 'all', of: [TEMPLATE_NAMES_ONLY, PORT_SET, NAMES_KEPT] },
              feedback: 'Show .env: PORT=3000 and DATABASE_URL= are both there.',
            },
            {
              id: 'names-lost',
              text: '.env has PORT=3000, but DATABASE_URL is gone',
              truth: { kind: 'all', of: [TEMPLATE_NAMES_ONLY, PORT_SET, not(NAMES_KEPT)] },
              feedback: 'Show .env: only PORT=3000 is left. Set-Content replaced the whole file.',
            },
            {
              id: 'template-filled',
              text: 'The shared template now holds a value',
              truth: not(TEMPLATE_NAMES_ONLY),
              feedback: 'Show .env.example: PORT=3000 sits in the file git shares with everyone.',
            },
          ],
        },
        guards: [TEMPLATE_NAMES_ONLY, ENV_KEEPS_NAMES],
        looks: [
          { id: 'env', label: 'Show .env', line: `Get-Content ${API_PATH}\\.env` },
          {
            id: 'example',
            label: 'Show .env.example',
            line: `Get-Content ${API_PATH}\\.env.example`,
          },
        ],
      },
    },
    {
      id: 'keep-it-out-of-git',
      instruction: 'Make sure git never shares .env.',
      success: { ...ENV_IGNORED, label: 'git ignores .env' },
      hints: [
        'Read .gitignore line by line. Does any rule name .env itself?',
        '.env.local is a different file. Add a rule for .env, and keep the rest.',
        'Pick the card that appends .env to .gitignore, then shows it.',
      ],
      agent: {
        before: IN_API,
        focus: [API],
        plans: [
          {
            id: 'trust-it',
            text: 'Check that .gitignore already covers .env.',
            quality: 'weak',
            covers: ['goal'],
            intents: ['check gitignore covers env', 'is env already ignored'],
            script: [{ do: 'run', line: 'Get-Content .gitignore', say: 'Reading .gitignore.' }],
            claim: 'Done: .gitignore already covers .env.',
            lesson:
              '.env.local is not .env. Otto skimmed and overclaimed: a rule must name the file.',
            slip: 'overclaim',
          },
          {
            id: 'replace-it',
            text: 'Add .env to .gitignore.',
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['add env to gitignore', 'ignore env'],
            script: [
              {
                do: 'run',
                line: 'Set-Content .gitignore .env',
                say: 'Adding .env to .gitignore.',
                onDeny: [{ do: 'run', line: 'Add-Content .gitignore .env' }],
                denyLine: 'Good stop. Adding it to the end instead.',
              },
            ],
            claim: 'Done: git ignores .env now.',
            lesson:
              'Set-Content replaced the file and dropped node_modules/. Add-Content keeps every rule.',
            slip: 'wrong-verb',
          },
          {
            id: 'append-and-show',
            text: 'Append .env to .gitignore, keep every rule, then show it.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['append env to gitignore', 'keep every rule then show it'],
            script: [
              { do: 'run', line: `Add-Content ${API_PATH}\\.gitignore .env` },
              { do: 'run', line: `Get-Content ${API_PATH}\\.gitignore` },
            ],
            claim: 'Done: .env has its own rule, and every rule stayed.',
            lesson: 'Appending added one rule and kept the rest, and showing the file proved it.',
          },
        ],
        fixes: [
          {
            id: 'add-the-rule',
            text: 'Add .env to the end of .gitignore.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['add env to the end', 'append the env rule'],
            script: [{ do: 'run', line: 'Add-Content .gitignore .env' }],
            claim: 'Fixed: .gitignore names .env.',
            lesson: 'A rule that names .env itself is what makes git ignore it.',
          },
          {
            id: 'put-rules-back',
            text: 'Add node_modules/ and .env.local back to .gitignore.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['put the rules back', 'add node_modules back'],
            script: [
              { do: 'run', line: 'Add-Content .gitignore node_modules/' },
              { do: 'run', line: 'Add-Content .gitignore .env.local' },
            ],
            claim: 'Fixed: every rule is back.',
            lesson: 'The lost rules are back, beside the new one for .env.',
          },
        ],
        hintPlan: 'append-and-show',
        check: {
          question: 'Will git share .env?',
          options: [
            {
              id: 'ignored',
              text: 'No: a rule names .env, and the other rules stayed',
              truth: { kind: 'all', of: [ENV_IGNORED, RULES_KEPT] },
              feedback: 'Show .gitignore: .env has its own line, beside the old rules.',
            },
            {
              id: 'rules-lost',
              text: 'No, but node_modules/ is no longer ignored',
              truth: { kind: 'all', of: [ENV_IGNORED, not(RULES_KEPT)] },
              feedback: 'Show .gitignore: only .env is left. The other rules are gone.',
            },
            {
              id: 'shared',
              text: 'Yes: no rule names .env',
              truth: not(ENV_IGNORED),
              feedback: 'Show .gitignore: .env.local is a different file. Nothing names .env.',
            },
          ],
        },
        guards: [RULES_KEPT],
        looks: [
          {
            id: 'gitignore',
            label: 'Show .gitignore',
            line: `Get-Content ${API_PATH}\\.gitignore`,
          },
          { id: 'api', label: 'List the API', line: `Get-ChildItem ${API_PATH} -Force` },
        ],
      },
    },
    {
      id: 'the-api-key',
      instruction:
        "The API now needs QUILL_API_KEY. Sage's dev key is in Documents\\keys. Wire it in.",
      success: {
        kind: 'all',
        of: [...KEY_NAMED],
        label: 'QUILL_API_KEY is named in both env files',
      },
      hints: [
        'Once Otto reads a secret, it is in his context. Who should handle the key?',
        'Otto can add the name; the value is yours to paste in.',
        'Pick the card that adds a blank QUILL_API_KEY to both files.',
      ],
      agent: {
        before: IN_API,
        note: 'Anything Otto reads or prints stays in his context for good.',
        focus: [API],
        plans: [
          {
            id: 'otto-reads-it',
            text: "Read Sage's key file and wire the key in for everyone.",
            quality: 'weak',
            covers: ['goal'],
            intents: ['read the key file', 'wire the key in for everyone'],
            script: [
              {
                do: 'run',
                line: `Get-Content ${KEYS_PATH}\\quill-dev.txt`,
                // A read changes nothing, so only `ask` can pause it: the risk is what Otto sees.
                ask: true,
                say: 'Reading the key so I can wire it in.',
                denyLine: 'Good stop. Once I read it, I hold it.',
              },
              {
                do: 'run',
                line: `Add-Content .env.example 'QUILL_API_KEY=${KEY}'`,
                say: 'Adding it to the template so the team has it.',
              },
              { do: 'run', line: `Add-Content .env 'QUILL_API_KEY=${KEY}'` },
            ],
            claim: 'Done: the key is wired in, and the team has it.',
            lesson:
              'Otto read the key, so it sits in his context, and put it in the shared template. Revoke it.',
            slip: 'leak',
          },
          {
            id: 'copy-key-file',
            text: "Name QUILL_API_KEY, and copy Sage's key file into the API.",
            quality: 'okay',
            covers: ['goal', 'place'],
            intents: ['copy the key file into the api', 'name the key and copy the file'],
            script: [
              { do: 'run', line: "Add-Content .env.example 'QUILL_API_KEY='" },
              { do: 'run', line: "Add-Content .env 'QUILL_API_KEY='" },
              {
                do: 'run',
                line: `Copy-Item ${KEYS_PATH}\\quill-dev.txt .`,
                say: 'Copying the key file in, so the API finds it.',
                onDeny: [{ do: 'run', line: 'Get-Content .env.example' }],
                denyLine: 'Good stop. The key stays home. Here are the names.',
              },
            ],
            claim: 'Done: QUILL_API_KEY is named, and the key file is in the API.',
            lesson:
              'A key file in the repo, with no rule hiding it, is one git add from shared. Keys stay home.',
            slip: 'leak',
          },
          {
            id: 'names-only',
            text: "Add QUILL_API_KEY to both env files, blank. I'll paste the key.",
            quality: 'strong',
            covers: ['goal', 'place', 'limits', 'check'],
            intents: ['blank key in both env files', "i'll paste the key myself"],
            script: [
              { do: 'run', line: `Add-Content ${API_PATH}\\.env.example 'QUILL_API_KEY='` },
              { do: 'run', line: `Add-Content ${API_PATH}\\.env 'QUILL_API_KEY='` },
              { do: 'run', line: `Get-Content ${API_PATH}\\.env.example` },
            ],
            claim: 'Done: QUILL_API_KEY is named in both. Paste its value in yourself.',
            lesson:
              "Otto wired the name, and the value is yours. A secret he never sees, he can't leak.",
          },
        ],
        fixes: [
          {
            id: 'name-it',
            text: 'Add a blank QUILL_API_KEY line to both env files.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['add a blank key line', 'name the key in both files'],
            script: [
              { do: 'run', line: "Add-Content .env.example 'QUILL_API_KEY='" },
              { do: 'run', line: "Add-Content .env 'QUILL_API_KEY='" },
            ],
            claim: 'Fixed: QUILL_API_KEY is named. Paste the key in yourself.',
            lesson: 'The name is wired in, and the key never passed through Otto.',
          },
          {
            id: 'remove-copy',
            text: 'Delete the copy of the key file from the API.',
            quality: 'strong',
            covers: ['goal', 'place', 'limits'],
            intents: ['delete the key copy', 'remove quill-dev from the api'],
            script: [{ do: 'run', line: 'Remove-Item .\\quill-dev.txt' }],
            claim: 'Fixed: the key file is only in Documents again.',
            lesson: 'The copy was never committed, so deleting it kept the key home.',
          },
        ],
        hintPlan: 'names-only',
        check: {
          question: 'Where is the dev key now?',
          options: [
            {
              id: 'home-only',
              text: 'Only in Documents\\keys, and Otto never saw it',
              truth: { kind: 'all', of: [KEY_UNSEEN, KEY_OFF_GIT] },
              feedback: 'List the API: no key file there, and Otto only read the names.',
            },
            {
              id: 'in-repo',
              text: 'A copy sits in the API, where git can share it',
              truth: { kind: 'all', of: [KEY_UNSEEN, KEY_COPY_SHAREABLE] },
              feedback: 'List the API: quill-dev.txt is in it, and no rule hides it from git.',
            },
            {
              id: 'seen',
              text: "In Otto's context: he read it",
              truth: KEY_SEEN,
              feedback:
                'Otto printed the key, so it is in his context. On a real machine, revoke it.',
            },
          ],
        },
        guards: [KEY_UNSEEN, KEY_OFF_GIT, KEY_IN_NO_SHARED_FILE],
        looks: [
          {
            id: 'example',
            label: 'Show .env.example',
            line: `Get-Content ${API_PATH}\\.env.example`,
          },
          { id: 'api', label: 'List the API', line: `Get-ChildItem ${API_PATH} -Force` },
        ],
      },
    },
  ],
  drills: [
    {
      kind: 'approve',
      id: 'ssh-approve-cat-env',
      prompt: 'You pasted the key into .env. Otto wants to check the file. Allow?',
      concept: 'secrets',
      setup: withKey().cd(API).toSpec(),
      action: { do: 'run', line: 'Get-Content .env', say: 'Checking .env looks right.' },
      guards: [KEY_UNSEEN],
      explain:
        'Get-Content prints the key back to Otto, into his context. Check the names in .env.example instead.',
    },
    {
      kind: 'approve',
      id: 'ssh-approve-cat-example',
      prompt: 'You pasted the key into .env. Otto wants to read .env.example. Allow?',
      concept: 'secrets',
      setup: withKey().cd(API).toSpec(),
      action: { do: 'run', line: 'Get-Content .env.example', say: 'Checking the names.' },
      guards: [KEY_UNSEEN],
      explain: 'The template holds names only, never values. Otto can read it all he likes.',
    },
    {
      kind: 'approve',
      id: 'ssh-approve-copy-key',
      prompt: 'Otto stands in the API, a git repository. Allow?',
      concept: 'secrets',
      setup: ssh().cd(API).toSpec(),
      action: {
        do: 'run',
        line: `Copy-Item ${KEYS_PATH}\\quill-dev.txt .`,
        say: 'Copying the key in, so the API finds it.',
      },
      guards: [KEY_OFF_GIT],
      explain:
        'The copy lands in the repository with no rule hiding it. One git add, and it is shared.',
    },
    {
      kind: 'predict',
      id: 'ssh-predict-ignore-after-commit',
      prompt: '.env was committed last week. Otto adds it to .gitignore. Then what?',
      concept: 'gitignore',
      setup: ssh()
        .write(ENV, 'PORT=3000\nDATABASE_URL=\n')
        .stage('.env')
        .commit('chore: add env')
        .cd(API)
        .toSpec(),
      action: { do: 'run', line: 'Add-Content .gitignore .env' },
      options: [
        {
          id: 'still-tracked',
          text: 'git still tracks .env: ignoring skips only untracked files',
          outcome: { result: 'ok', state: { kind: 'tracked', paths: ['.env'] } },
        },
        {
          id: 'untracked',
          text: 'git stops tracking .env',
          outcome: { result: 'ok', state: { kind: 'notTracked', paths: ['.env'] } },
        },
        { id: 'error', text: 'An error: .env is committed', outcome: { result: 'error' } },
      ],
      explain:
        '.gitignore only hides files git does not track yet. A committed .env stays tracked until removed.',
    },
    {
      kind: 'diagnose',
      id: 'ssh-diagnose-claim-readme',
      prompt: 'Is Otto right?',
      concept: 'secrets',
      setup: ssh().cd(API).toSpec(),
      history: [{ do: 'run', line: `Add-Content README.md 'Dev key: ${KEY}'` }],
      claim: 'Done: README tells the team how to get the key.',
      options: [
        {
          id: 'leaked',
          text: 'No: README holds the key itself, for anyone with the repo',
          truth: has(README, KEY),
        },
        {
          id: 'names',
          text: 'Yes: README names the variable only',
          truth: not(has(README, KEY)),
        },
        {
          id: 'unchanged',
          text: 'No: README did not change',
          truth: not(has(README, 'Dev key')),
        },
      ],
      explain:
        'README is shared with everyone who has the repo. It can say where keys live, never what they are.',
    },
    {
      kind: 'diagnose',
      id: 'ssh-diagnose-env-shared',
      prompt: 'Is Otto right?',
      concept: 'gitignore',
      setup: withKey().cd(API).toSpec(),
      history: [{ do: 'run', line: 'Get-Content .gitignore' }],
      claim: 'Done: .env.local is ignored, so .env is safe.',
      options: [
        {
          id: 'shared',
          text: 'No: no rule names .env, so git would share it',
          truth: { kind: 'untracked', paths: ['.env'] },
        },
        { id: 'safe', text: 'Yes: .env.local covers .env', truth: ENV_IGNORED },
        {
          id: 'committed',
          text: 'No: .env is already committed',
          truth: { kind: 'tracked', paths: ['.env'] },
        },
      ],
      explain: 'A rule matches a name, not a family. .env.local hides only .env.local.',
    },
    {
      kind: 'fix',
      id: 'ssh-fix-key-in-template',
      prompt:
        'Someone put the real key in .env.example. Which fix makes it names only, without Otto seeing the key?',
      concept: 'secrets',
      setup: ssh().write(EXAMPLE, `${TEMPLATE}QUILL_API_KEY=${KEY}\n`).cd(API).toSpec(),
      goal: { kind: 'all', of: [has(EXAMPLE, 'QUILL_API_KEY='), not(has(EXAMPLE, KEY))] },
      failIf: [KEY_SEEN],
      options: [
        {
          id: 'rewrite',
          text: 'Write the template again from the names alone.',
          script: [{ do: 'write', path: EXAMPLE, content: `${TEMPLATE}QUILL_API_KEY=\n` }],
        },
        {
          id: 'edit-out',
          text: 'Find the key in the file and delete it.',
          script: [{ do: 'edit', path: EXAMPLE, find: KEY, replace: '' }],
        },
        {
          id: 'delete',
          text: 'Delete .env.example.',
          script: [{ do: 'run', line: 'Remove-Item .env.example' }],
        },
      ],
      explain:
        'Writing names needs no key. Finding the key means Otto handles it. Either way, revoke that key.',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Add the AI key to the demo server',
      body: 'Have Otto put the new AI key in so the demo works for everyone. Sage has it.',
    },
    candidates: [
      {
        id: 'where-live',
        text: 'Where should the key live, so it never lands in git?',
        quality: 'strong',
        rationale: 'A secret needs a home outside the repo, like .env on the server.',
      },
      {
        id: 'server-or-laptops',
        text: 'Does it go on the demo server only, or on every laptop?',
        quality: 'strong',
        rationale: '"For everyone" can mean one server or many copies. Fewer copies, fewer leaks.',
      },
      {
        id: 'var-name',
        text: 'What should the variable be called?',
        quality: 'okay',
        rationale: 'Needed for .env.example, but it leaves where the value lives.',
      },
      {
        id: 'restart',
        text: 'Is it OK to restart the demo server?',
        quality: 'okay',
        rationale: 'Fair, since a new key often needs a restart, but not about the secret.',
      },
      {
        id: 'rotate',
        text: 'Should we revoke the old key once this works?',
        quality: 'okay',
        rationale: 'Good habit, but it comes after deciding where the new key goes.',
      },
      {
        id: 'paste-chat',
        text: 'Can Sage just paste the key here in chat?',
        quality: 'weak',
        rationale: 'Chat is another copy of the secret, and anyone in it can read it.',
      },
      {
        id: 'commit-it',
        text: 'Should Otto commit it so everyone has it?',
        quality: 'weak',
        rationale: 'A committed key is in the history for good, for everyone with the repo.',
      },
      {
        id: 'which-model',
        text: 'Which AI model does the key use?',
        quality: 'weak',
        rationale: 'Interesting, but nothing to do with keeping the key safe.',
      },
    ],
    rubric:
      'A strong question pins where the key lives outside git, and how many places need a copy.',
  },
};
