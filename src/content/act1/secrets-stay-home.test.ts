import { describeDirectedMission, describeJudgmentDrills } from './directed.test-helpers';
import { missionById } from './play.test-helpers';

/*
 * Mission 1.3, Secrets Stay Home, played card by card and drill by drill
 * (directed.test-helpers.ts). The tables are what the spec says each card and drill does.
 *
 * The mission pauses on every change (`changes`), so most gates here are safe: Kyle reads
 * them and allows. The harmful ones fill the shared template, drop .env's names or the
 * other .gitignore rules, show Otto the key, or put a copy of it where git can share it.
 * 'direct' means Otto stopped for new directions after a deny with no plan B.
 */

const API = 'C:\\Users\\kyle\\quillwork\\api';
const KEYS = 'C:\\Users\\kyle\\Documents\\keys';
const KEY = 'dev-key-for-the-game-1234';
const EDIT_ENV = 'edit Users/kyle/quillwork/api/.env';
const WRITE_EXAMPLE = 'write Users/kyle/quillwork/api/.env.example';
const COPY_TEMPLATE = `Copy-Item ${API}\\.env.example ${API}\\.env`;
const APPEND_ENV_RULE = `Add-Content ${API}\\.gitignore .env`;
const READ_KEY = `Get-Content ${KEYS}\\quill-dev.txt`;
const COPY_KEY = `Copy-Item ${KEYS}\\quill-dev.txt .`;
const KEY_TO_TEMPLATE = `Add-Content .env.example 'QUILL_API_KEY=${KEY}'`;
const KEY_TO_ENV = `Add-Content .env 'QUILL_API_KEY=${KEY}'`;
const NAME_IN_TEMPLATE = "Add-Content .env.example 'QUILL_API_KEY='";
const NAME_IN_ENV = "Add-Content .env 'QUILL_API_KEY='";
const FULL_NAME_IN_TEMPLATE = `Add-Content ${API}\\.env.example 'QUILL_API_KEY='`;
const FULL_NAME_IN_ENV = `Add-Content ${API}\\.env 'QUILL_API_KEY='`;

describeDirectedMission(missionById('secrets-stay-home'), {
  start: {
    'make-the-env': {
      'fill-the-template': {
        'allow-all': { passed: false, check: 'template-filled' },
        'deny-harmful': 'direct',
      },
      'copy-then-set': {
        'allow-all': { passed: false, check: 'names-lost' },
        // Denied, Otto edits only the PORT line of the copy.
        'deny-harmful': { passed: true, check: 'filled' },
      },
      'copy-then-edit': { passed: true, check: 'filled' },
    },
    'keep-it-out-of-git': {
      'trust-it': { passed: false, check: 'shared' },
      'replace-it': {
        'allow-all': { passed: false, check: 'rules-lost' },
        // Denied, Otto appends the rule instead.
        'deny-harmful': { passed: true, check: 'ignored' },
      },
      'append-and-show': { passed: true, check: 'ignored' },
    },
    'the-api-key': {
      'otto-reads-it': { 'allow-all': { passed: false, check: 'seen' }, 'deny-harmful': 'direct' },
      'copy-key-file': {
        'allow-all': { passed: false, check: 'in-repo' },
        // Denied, the key stays home: Otto shows the names he added instead.
        'deny-harmful': { passed: true, check: 'home-only' },
      },
      'names-only': { passed: true, check: 'home-only' },
    },
  },
  fixes: {
    'make-the-env': {
      'fill-the-template > start-over': { passed: true, check: 'filled' },
      'copy-then-set > start-over': { passed: true, check: 'filled' },
      'copy-then-set > copy-then-edit': { passed: true, check: 'filled' },
    },
    'keep-it-out-of-git': {
      'trust-it > add-the-rule': { passed: true, check: 'ignored' },
      'replace-it > put-rules-back': { passed: true, check: 'ignored' },
      'trust-it > put-rules-back': { passed: false, check: 'shared' },
    },
    'the-api-key': {
      'copy-key-file > remove-copy': { passed: true, check: 'home-only' },
      // Otto has seen the key: no card can make him forget it.
      'otto-reads-it > name-it': { passed: false, check: 'seen' },
    },
  },
  // Allowed, Otto has read the key: only Rewind can help, and on a real machine, revoking it.
  rewindOnly: ['the-api-key > otto-reads-it'],
  gates: {
    // Step 1: filling the template, or replacing .env's names, is harmful; copies and
    // one-line edits are safe. Copying a template that already holds a value is harmful
    // too: the new .env would lack the names.
    "make-the-env > fill-the-template > Set-Content .env.example 'PORT=3000'": true,
    'make-the-env > copy-then-set > Copy-Item .env.example .env': false,
    "make-the-env > copy-then-set > Set-Content .env 'PORT=3000'": true,
    [`make-the-env > copy-then-set > ${EDIT_ENV}`]: false,
    [`make-the-env > copy-then-edit > ${COPY_TEMPLATE}`]: false,
    [`make-the-env > copy-then-edit > ${EDIT_ENV}`]: false,
    [`make-the-env > copy-then-set > copy-then-edit > ${COPY_TEMPLATE}`]: false,
    [`make-the-env > copy-then-set > copy-then-edit > ${EDIT_ENV}`]: false,
    "make-the-env > copy-then-set > fill-the-template > Set-Content .env.example 'PORT=3000'": true,
    'make-the-env > copy-then-set > start-over > Copy-Item .env.example .env': false,
    [`make-the-env > copy-then-set > start-over > ${EDIT_ENV}`]: false,
    [`make-the-env > fill-the-template > copy-then-edit > ${COPY_TEMPLATE}`]: true,
    [`make-the-env > fill-the-template > copy-then-edit > ${EDIT_ENV}`]: false,
    'make-the-env > fill-the-template > copy-then-set > Copy-Item .env.example .env': true,
    [`make-the-env > fill-the-template > start-over > ${WRITE_EXAMPLE}`]: false,
    'make-the-env > fill-the-template > start-over > Copy-Item .env.example .env': false,
    [`make-the-env > fill-the-template > start-over > ${EDIT_ENV}`]: false,
    // Step 2: only replacing .gitignore loses rules. Every append is safe.
    [`keep-it-out-of-git > append-and-show > ${APPEND_ENV_RULE}`]: false,
    'keep-it-out-of-git > replace-it > Set-Content .gitignore .env': true,
    'keep-it-out-of-git > replace-it > Add-Content .gitignore .env': false,
    'keep-it-out-of-git > replace-it > add-the-rule > Add-Content .gitignore .env': false,
    [`keep-it-out-of-git > replace-it > append-and-show > ${APPEND_ENV_RULE}`]: false,
    'keep-it-out-of-git > replace-it > put-rules-back > Add-Content .gitignore node_modules/': false,
    'keep-it-out-of-git > replace-it > put-rules-back > Add-Content .gitignore .env.local': false,
    'keep-it-out-of-git > trust-it > add-the-rule > Add-Content .gitignore .env': false,
    [`keep-it-out-of-git > trust-it > append-and-show > ${APPEND_ENV_RULE}`]: false,
    'keep-it-out-of-git > trust-it > put-rules-back > Add-Content .gitignore node_modules/': false,
    'keep-it-out-of-git > trust-it > put-rules-back > Add-Content .gitignore .env.local': false,
    'keep-it-out-of-git > trust-it > replace-it > Set-Content .gitignore .env': true,
    'keep-it-out-of-git > trust-it > replace-it > Add-Content .gitignore .env': false,
    // Step 3: reading the key pauses only because it asks, and is harmful: Otto would hold
    // it. So are a key in the shared template and a copy of the key file in the repo. A
    // key in .env, which git ignores, breaks nothing new once Otto has seen it.
    [`the-api-key > otto-reads-it > ${READ_KEY}`]: true,
    [`the-api-key > otto-reads-it > ${KEY_TO_TEMPLATE}`]: true,
    [`the-api-key > otto-reads-it > ${KEY_TO_ENV}`]: false,
    [`the-api-key > otto-reads-it > copy-key-file > ${NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > otto-reads-it > copy-key-file > ${NAME_IN_ENV}`]: false,
    [`the-api-key > otto-reads-it > copy-key-file > ${COPY_KEY}`]: true,
    [`the-api-key > otto-reads-it > name-it > ${NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > otto-reads-it > name-it > ${NAME_IN_ENV}`]: false,
    [`the-api-key > otto-reads-it > names-only > ${FULL_NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > otto-reads-it > names-only > ${FULL_NAME_IN_ENV}`]: false,
    [`the-api-key > copy-key-file > ${NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > copy-key-file > ${NAME_IN_ENV}`]: false,
    [`the-api-key > copy-key-file > ${COPY_KEY}`]: true,
    [`the-api-key > copy-key-file > name-it > ${NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > copy-key-file > name-it > ${NAME_IN_ENV}`]: false,
    [`the-api-key > copy-key-file > names-only > ${FULL_NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > copy-key-file > names-only > ${FULL_NAME_IN_ENV}`]: false,
    [`the-api-key > copy-key-file > otto-reads-it > ${READ_KEY}`]: true,
    [`the-api-key > copy-key-file > otto-reads-it > ${KEY_TO_TEMPLATE}`]: true,
    [`the-api-key > copy-key-file > otto-reads-it > ${KEY_TO_ENV}`]: false,
    'the-api-key > copy-key-file > remove-copy > Remove-Item .\\quill-dev.txt': false,
    [`the-api-key > names-only > ${FULL_NAME_IN_TEMPLATE}`]: false,
    [`the-api-key > names-only > ${FULL_NAME_IN_ENV}`]: false,
  },
});

describeJudgmentDrills(missionById('secrets-stay-home'), {
  'ssh-approve-cat-env': { key: ['deny'], wrong: 'allow' },
  'ssh-approve-cat-example': { key: ['allow'], wrong: 'deny' },
  'ssh-approve-copy-key': { key: ['deny'], wrong: 'allow' },
  'ssh-predict-ignore-after-commit': { key: ['still-tracked'], wrong: 'untracked' },
  'ssh-diagnose-claim-readme': { key: ['leaked'], wrong: 'names' },
  'ssh-diagnose-env-shared': { key: ['shared'], wrong: 'safe' },
  'ssh-fix-key-in-template': { key: ['rewrite'], wrong: 'edit-out' },
});
