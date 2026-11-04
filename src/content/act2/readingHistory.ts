import { repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from '../../game/missions/agentSchema';
import type { Predicate } from '../../game/missions/predicates';
import type { JudgmentDrillInput, MissionInput } from '../../game/missions/schema';

/**
 * Mission 2.2: reading history, directed. Otto answers questions about the history for
 * Kyle (which commit changed TAX_RATE, what is on the dock, which edit is the feature),
 * and sometimes reads it wrong. log, show, diff and diff --staged change nothing, so each
 * step is graded on what Otto's reading led him to do, and each check asks Kyle to test
 * Otto's answer against the real log with the look chips.
 *
 * Nothing here marks an answer right. Gates come from dry runs (reset --hard drops commits,
 * the cart edit and Priya's staged one; restore throws Priya's edit away), checks from git
 * predicates, and each drill's key from running its scene.
 */

const README_V1 = '# Quillwork Cafe\n\nOnline ordering for the office cafe.\n';
const README_V2 = `${README_V1}\nTotals are the subtotal plus sales tax.\n`;
const PRICES =
  'export const PRICES: Record<string, number> = {\n  coffee: 3.5,\n  bagel: 2.25,\n};\n';
const CART_V1 =
  "import { PRICES } from './prices';\n\nexport function subtotal(items: string[]): number {\n  return items.reduce((sum, item) => sum + (PRICES[item] ?? 0), 0);\n}\n";
const CART_V2 =
  "import { PRICES } from './prices';\nimport { TAX_RATE } from './tax';\n\nexport function subtotal(items: string[]): number {\n  return items.reduce((sum, item) => sum + (PRICES[item] ?? 0), 0);\n}\n\nexport function total(items: string[]): number {\n  return subtotal(items) * (1 + TAX_RATE);\n}\n";
// The real feature waiting on the Workbench: free delivery above a threshold.
const CART_V3 = `${CART_V2}\nexport const FREE_DELIVERY_OVER = 20;\n`;
const TAX_GOOD =
  '// Sales tax for the cafe, as a fraction of the subtotal.\nexport const TAX_RATE = 0.08;\n';
// The bug: a "tidy up" commit that also dropped a zero.
const TAX_BAD = '// Sales tax as a fraction.\nexport const TAX_RATE = 0.8;\n';
const CHECKOUT =
  "import { total } from './cart';\n\nexport function checkoutLabel(items: string[]): string {\n  return 'Total: ' + total(items).toFixed(2);\n}\n";
// Priya's debug print: still useful to her, but never meant for a commit.
const CHECKOUT_DEBUG =
  "import { total } from './cart';\n\nexport function checkoutLabel(items: string[]): string {\n  console.log('DEBUG items', items);\n  return 'Total: ' + total(items).toFixed(2);\n}\n";

const CONFIG_3000 = '{\n  "port": 3000\n}\n';
const CONFIG_8080 = '{\n  "port": 8080\n}\n';
const SETUP_DOC = '# Setup\n\n1. npm install\n2. npm run dev\n';
const API_PROD = "export const BASE_URL = 'https://api.quillwork.ai';\n";
const API_LOCAL = "export const BASE_URL = 'http://localhost:9999';\n";
const SEARCH_V1 = 'export function search(query: string): string[] {\n  return [query];\n}\n';
const SEARCH_V2 =
  'export function search(query: string): string[] {\n  return [query.trim().toLowerCase()];\n}\n';
const SEARCH_EXPERIMENT = `${SEARCH_V2}// experiment: fuzzy matching\n`;

const TAX = 'src/tax.ts';
const CART = 'src/cart.ts';
const CHECKOUT_TS = 'src/checkout.ts';
const FIX_MESSAGE = 'fix: restore 8% sales tax';
const FEATURE_MESSAGE = 'feat: add free delivery threshold';

/* What must stay true, and what the checks ask about. */

/** The good rate is on the Workbench. 'TAX_RATE = 0.8' is not inside it, so the two split. */
const taxFixed: Predicate = {
  kind: 'workingFile',
  path: TAX,
  contains: 'TAX_RATE = 0.08',
  label: 'tax.ts has the 0.08 rate',
};
/** The semicolon keeps 'TAX_RATE = 0.08;' from matching: the bad rate, still on the Workbench. */
const taxStillBad: Predicate = { kind: 'workingFile', path: TAX, contains: 'TAX_RATE = 0.8;' };
/**
 * Restoring from a commit older than tax.ts deletes it to match, as real git does. That
 * happens after a rewind, when HEAD~2 is the first commit.
 */
const taxStays: Predicate = {
  kind: 'workingFile',
  path: TAX,
  exists: true,
  label: 'tax.ts stays on the Workbench',
};
const taxGone: Predicate = { kind: 'workingFile', path: TAX, exists: false };
const cartEditSurvives: Predicate = {
  kind: 'workingFile',
  path: CART,
  contains: 'FREE_DELIVERY_OVER',
  label: 'Your cart.ts edit survives',
};
const priyaEditSurvives: Predicate = {
  kind: 'workingFile',
  path: CHECKOUT_TS,
  contains: 'DEBUG',
  label: "Priya's debug edit survives",
};
/** The five commits the mission starts with stay: reading history needs no time travel. */
const historyKept: Predicate = { kind: 'commitCount', min: 5, label: 'Every commit stays' };
/** Step 4 starts after the tax fix, so its history holds six commits. */
const historyKeptWithFix: Predicate = { kind: 'commitCount', min: 6, label: 'Every commit stays' };
const checkoutStaged: Predicate = { kind: 'staged', paths: [CHECKOUT_TS] };
const taxAlone: Predicate = { kind: 'commitChanged', paths: [TAX], only: true };
const taxCommitted: Predicate = { kind: 'commitChanged', paths: [TAX] };
const cartAlone: Predicate = { kind: 'commitChanged', paths: [CART], only: true };
const debugInVault: Predicate = {
  kind: 'fileAtHead',
  path: CHECKOUT_TS,
  contains: 'DEBUG',
  label: 'The debug line is in the Vault',
};
const debugOutOfVault: Predicate = {
  kind: 'not',
  predicate: debugInVault,
  label: 'The debug line stays out of the Vault',
};

/* Read-only lines Kyle can have run while he checks Otto's answer. */
const vaultLook = { id: 'log', label: "What's in the Vault?", line: 'git log --oneline' };
const dockLook = { id: 'status', label: "What's on the dock?", line: 'git status' };
const stagedLook = { id: 'staged', label: 'What will commit?', line: 'git diff --staged' };
const workbenchLook = { id: 'diff', label: "What's unsaved?", line: 'git diff' };

/**
 * Step 1: which commit changed TAX_RATE? The weak card blames the newest commit without
 * reading it, restores from just before that one, and gets the same bad rate back. The
 * okay card rewinds the whole project, which a dry run finds harmful: it drops two commits,
 * throws away the unsaved cart.ts edit, and deletes checkout.ts with Priya's staged edit.
 * After that rewind, HEAD~2 is the first commit, which has no tax.ts, so restoring from it
 * deletes the file: the taxStays guard makes that gate harmful, and the check has an
 * answer for it.
 */
const restoreTaxTask = {
  // 0.8 instead of 0.08 makes the tax ten times too high; the total only about 1.7 times.
  note: 'Marco: "Sales tax is ten times too high since last week!"',
  plans: [
    {
      id: 'blame-newest',
      text: 'Fix the tax rate.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['fix the tax rate', 'fix the tax'],
      script: [
        { do: 'run', line: 'git log --oneline', say: 'The newest commit must have broken it.' },
        { do: 'run', line: `git restore --source=HEAD~1 ${TAX}` },
      ],
      claim: 'Done: tax.ts is back to before the bad commit.',
      lesson:
        'Otto guessed the newest commit broke it. git log -- src/tax.ts shows the tidy commit did, so HEAD~1 still had 0.8.',
      slip: 'overclaim',
    },
    {
      id: 'show-then-restore',
      text: 'Find which commit changed TAX_RATE, restore before it, show the diff.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['find which commit changed tax_rate', 'restore tax.ts from before it'],
      script: [
        // Otto says what he reads for, not what he finds: a fix round can play this card
        // after a rewind, where the log holds one tax.ts commit and HEAD~1 is another.
        {
          do: 'run',
          line: `git log --oneline -- ${TAX}`,
          say: 'Listing the commits that touched tax.ts.',
        },
        { do: 'run', line: 'git show HEAD~1', say: 'Checking what HEAD~1 did to TAX_RATE.' },
        {
          do: 'run',
          line: `git restore --source=HEAD~2 ${TAX}`,
          predict: {
            question: 'Before Otto runs it: what will tax.ts say?',
            // tax.ts holds one rate or the other, or is gone: exactly one holds wherever it runs.
            options: [
              { id: 'good', text: 'TAX_RATE = 0.08', outcome: { state: taxFixed } },
              { id: 'bad', text: 'Still TAX_RATE = 0.8', outcome: { state: taxStillBad } },
              { id: 'gone', text: 'tax.ts is deleted', outcome: { state: taxGone } },
            ],
          },
        },
        { do: 'run', line: `git diff ${TAX}` },
      ],
      claim: 'Done: tax.ts is 0.08 again, from before the tidy commit.',
      lesson:
        'git show named the commit that changed the rate, so Otto restored the version just before it. The diff proves it.',
    },
    {
      id: 'rewind',
      text: 'Go back to before the tax change.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['go back to before the tax change', 'undo the tax change'],
      script: [
        { do: 'run', line: 'git reset --hard HEAD~2', say: 'Rewinding to before the tax change.' },
      ],
      claim: 'Done: the tax rate is fixed.',
      lesson:
        "reset --hard HEAD~2 dropped two commits, your cart.ts edit, and checkout.ts with Priya's staged edit. One file needed one restore.",
      slip: 'big-hammer',
    },
  ],
  fixes: [
    {
      id: 'restore-before-tidy',
      text: 'Restore src/tax.ts from before "chore: tidy tax config".',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['restore tax.ts from before the tidy commit', 'restore from head~2'],
      script: [{ do: 'run', line: `git restore --source=HEAD~2 ${TAX}` }],
      claim: 'Fixed: tax.ts has the rate from before the tidy.',
      lesson: 'The commit before "chore: tidy tax config" is HEAD~2. Its tax.ts has 0.08.',
      // After an allowed rewind HEAD~2 is older than tax.ts, so this restore would delete
      // it: the card only makes sense while every commit is still there.
      when: historyKept,
    },
  ],
  hintPlan: 'show-then-restore',
  check: {
    question: 'What is in src/tax.ts now?',
    // Split by the file (0.08, 0.8, or gone) and, for 0.08, whether all five commits stay.
    options: [
      {
        id: 'fixed',
        text: 'TAX_RATE = 0.08, and every commit is kept',
        truth: { kind: 'all', of: [taxFixed, historyKept] },
        feedback: 'git diff src/tax.ts shows 0.8 turned back into 0.08.',
      },
      {
        id: 'still-bad',
        text: 'Still TAX_RATE = 0.8',
        truth: taxStillBad,
        feedback:
          'git diff shows no change to tax.ts: Otto restored a version that was already bad.',
      },
      {
        id: 'file-gone',
        text: 'Nothing: src/tax.ts is deleted',
        truth: taxGone,
        feedback:
          'git diff src/tax.ts says "deleted file": the commit Otto restored from had no tax.ts.',
      },
      {
        id: 'history-lost',
        text: 'TAX_RATE = 0.08, but newer commits are gone',
        truth: { kind: 'all', of: [taxFixed, { kind: 'not', predicate: historyKept }] },
        feedback: 'Count the lines in git log --oneline: commits went missing.',
      },
    ],
  },
  guards: [cartEditSurvives, priyaEditSurvives, taxStays, historyKept],
  looks: [
    vaultLook,
    { id: 'tax-log', label: 'Which commits changed tax.ts?', line: `git log --oneline -- ${TAX}` },
    { id: 'tax-diff', label: 'How does tax.ts differ?', line: `git diff ${TAX}` },
  ],
} satisfies AgentTaskInput;

/**
 * Step 2: what is on the Loading Dock? The weak card reads git diff, which only shows
 * edits not yet staged, and reports a clean dock. The okay card throws Priya's edit away,
 * which a dry run finds harmful.
 */
const clearDockTask = {
  note: 'Priya is still debugging checkout.ts. Keep her edit.',
  plans: [
    {
      id: 'wrong-diff',
      text: 'Make sure only real work is staged.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['make sure only real work is staged', 'check the staged work'],
      script: [
        { do: 'run', line: 'git diff', say: 'Only cart.ts and tax.ts changed. All real work.' },
      ],
      claim: 'Done: nothing odd is waiting to commit.',
      lesson:
        'git diff shows edits not yet staged. The debug line was already on the dock, which only git diff --staged shows.',
      slip: 'overclaim',
    },
    {
      id: 'read-dock',
      text: 'Read git diff --staged, then unstage only checkout.ts.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['read git diff --staged', 'unstage only checkout.ts'],
      script: [
        {
          do: 'run',
          line: 'git diff --staged',
          say: 'The dock holds a DEBUG print in checkout.ts.',
        },
        {
          do: 'run',
          line: `git restore --staged ${CHECKOUT_TS}`,
          predict: {
            question: 'Before Otto runs it: what happens to the debug line?',
            options: [
              {
                id: 'kept',
                text: 'It stays in the file, off the dock',
                outcome: { state: priyaEditSurvives },
              },
              {
                id: 'deleted',
                text: 'It is deleted from the file',
                outcome: { state: { kind: 'not', predicate: priyaEditSurvives } },
              },
            ],
          },
        },
        { do: 'run', line: 'git status' },
      ],
      claim: "Done: the dock is empty, Priya's edit kept.",
      lesson:
        'diff --staged showed what the next commit would hold. restore --staged took the crate off the dock and left the file alone.',
    },
    {
      id: 'discard',
      text: "Get rid of checkout.ts's changes.",
      quality: 'okay',
      covers: ['goal'],
      intents: ["get rid of checkout.ts's changes", 'discard checkout changes'],
      script: [
        { do: 'run', line: `git restore --staged ${CHECKOUT_TS}` },
        { do: 'run', line: `git restore ${CHECKOUT_TS}`, say: 'Throwing away the checkout edit.' },
      ],
      claim: 'Done: checkout.ts is off the dock.',
      lesson:
        "git restore threw Priya's edit away for good. restore --staged alone takes it off the dock and keeps it.",
      slip: 'big-hammer',
    },
  ],
  fixes: [
    {
      id: 'unstage-checkout',
      text: 'Take only src/checkout.ts off the Loading Dock.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['take checkout.ts off the dock', 'unstage checkout.ts'],
      script: [{ do: 'run', line: `git restore --staged ${CHECKOUT_TS}` }],
      claim: 'Fixed: checkout.ts is off the dock.',
      lesson: 'restore --staged moves a crate back to the Workbench, edit and all.',
    },
  ],
  hintPlan: 'read-dock',
  check: {
    question: 'What is on the Loading Dock now?',
    // Split by two questions: is checkout.ts staged, and does Priya's edit survive?
    options: [
      {
        id: 'empty-kept',
        text: "Nothing; Priya's edit waits on the Workbench",
        truth: { kind: 'all', of: [{ kind: 'not', predicate: checkoutStaged }, priyaEditSurvives] },
        feedback: 'git status lists checkout.ts as not staged, and git diff still shows DEBUG.',
      },
      {
        id: 'debug-staged',
        text: "checkout.ts's debug line, ready to commit",
        truth: checkoutStaged,
        feedback: 'git diff --staged still shows the DEBUG print waiting to commit.',
      },
      {
        id: 'edit-gone',
        text: "Nothing, and Priya's edit is gone",
        truth: {
          kind: 'all',
          of: [
            { kind: 'not', predicate: checkoutStaged },
            { kind: 'not', predicate: priyaEditSurvives },
          ],
        },
        feedback: 'git diff shows no DEBUG line anywhere: the edit was thrown away.',
      },
    ],
  },
  guards: [priyaEditSurvives, taxFixed, cartEditSurvives],
  looks: [dockLook, stagedLook, workbenchLook],
} satisfies AgentTaskInput;

/**
 * Step 3: commit the tax fix alone. The weak card stages everything and stops there, so
 * nothing reaches the Vault, yet claims a commit. From the start no card commits more than
 * the tax fix. After that weak card the dock holds all three files, so only the fix that
 * unstages first passes; stage-tax and commit-tax seal all three, and the check says so.
 * Otto's lines say what he reads for, not what he finds, so they stay true there too.
 */
const commitFixTask = {
  plans: [
    {
      id: 'stage-all',
      text: 'Get the tax fix ready.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['get the tax fix ready', 'stage the fix'],
      script: [
        { do: 'run', line: 'git add .', say: 'Staging the fix.' },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: the tax fix is committed.',
      lesson:
        'git add . loaded every edit, the debug line too, and nothing was committed. The log still ends at the old commit.',
      // The miss the check catches is the claimed commit that never happened.
      slip: 'overclaim',
    },
    {
      id: 'stage-tax',
      text: 'Stage only src/tax.ts, check the dock, commit as a fix.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['stage only src/tax.ts', 'commit the tax fix alone'],
      script: [
        { do: 'run', line: `git add ${TAX}` },
        {
          do: 'run',
          line: 'git diff --staged',
          say: 'Reading the dock before the commit seals it.',
        },
        {
          do: 'run',
          line: `git commit -m "${FIX_MESSAGE}"`,
          predict: {
            question: 'Before Otto runs it: what will the commit hold?',
            options: [
              { id: 'tax-only', text: 'Only src/tax.ts', outcome: { state: taxAlone } },
              {
                id: 'more',
                text: 'Something besides src/tax.ts',
                outcome: { state: { kind: 'not', predicate: taxAlone } },
              },
            ],
          },
        },
      ],
      claim: 'Done: committed only the tax fix.',
      lesson:
        'A commit seals the whole dock. git diff --staged shows that dock first, so read it before committing.',
    },
    {
      id: 'commit-tax',
      text: `Commit src/tax.ts as ${FIX_MESSAGE}.`,
      quality: 'okay',
      covers: ['goal', 'limits'],
      intents: ['commit src/tax.ts', 'commit tax.ts as a fix'],
      script: [
        { do: 'run', line: `git add ${TAX}` },
        { do: 'run', line: `git commit -m "${FIX_MESSAGE}"` },
      ],
      claim: 'Done: committed src/tax.ts.',
      lesson: 'It worked, but nothing checked the dock first. git diff --staged costs one line.',
    },
  ],
  fixes: [
    {
      id: 'unstage-rest',
      text: 'Unstage everything, stage only src/tax.ts, then commit it.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['unstage everything', 'stage only tax.ts and commit'],
      script: [
        { do: 'run', line: 'git restore --staged .' },
        { do: 'run', line: `git add ${TAX}` },
        { do: 'run', line: `git commit -m "${FIX_MESSAGE}"` },
      ],
      claim: 'Fixed: committed only src/tax.ts.',
      lesson:
        'restore --staged . emptied the dock without touching a file. Then only the fix went in.',
    },
  ],
  hintPlan: 'stage-tax',
  check: {
    question: 'What does the newest commit hold?',
    // Split by two questions: is tax.ts in the newest commit, and is it alone there?
    options: [
      {
        id: 'tax-only',
        text: 'Only the tax fix',
        truth: taxAlone,
        feedback: 'git log --oneline ends at the fix, and git status still lists the other edits.',
      },
      {
        id: 'extra',
        text: 'The tax fix, plus other edits',
        truth: { kind: 'all', of: [taxCommitted, { kind: 'not', predicate: taxAlone }] },
        feedback: 'Other files rode along: they were on the dock when Otto committed.',
      },
      {
        id: 'none',
        text: 'No commit holds the tax fix',
        truth: { kind: 'not', predicate: taxCommitted },
        feedback: 'git log --oneline ends at an old commit. Staging is not committing.',
      },
    ],
  },
  guards: [priyaEditSurvives, cartEditSurvives],
  looks: [vaultLook, dockLook, stagedLook],
} satisfies AgentTaskInput;

/**
 * Step 4: which unsaved edit is the feature? The weak card reads only the file names and
 * commits Priya's debug print as the feature. Its fix takes that commit back with a mixed
 * reset, which pauses (it takes a commit off main) but keeps every edit and the fix commit.
 */
const commitFeatureTask = {
  plans: [
    {
      id: 'misread-diff',
      text: 'Commit the new feature.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['commit the new feature', 'commit the feature'],
      script: [
        { do: 'run', line: 'git diff --stat', say: 'checkout.ts has new code. That must be it.' },
        { do: 'run', line: `git add ${CHECKOUT_TS}` },
        { do: 'run', line: 'git commit -m "feat: log checkout items"' },
      ],
      claim: 'Done: the new feature is committed.',
      lesson:
        'File names alone told Otto nothing. git diff shows checkout.ts only adds a debug print; the feature is in cart.ts.',
      // He committed the wrong file: the debug print, not the feature.
      slip: 'wrong-place',
    },
    {
      id: 'read-diff',
      text: 'Read git diff, then commit only the real feature.',
      quality: 'strong',
      covers: ['goal', 'limits', 'check'],
      intents: ['read git diff', 'commit only the real feature'],
      script: [
        {
          do: 'run',
          line: 'git diff',
          // True in a fix round too, where the debug print is already committed.
          say: 'cart.ts adds free delivery: that is the feature.',
        },
        { do: 'run', line: `git add ${CART}` },
        { do: 'run', line: `git commit -m "${FEATURE_MESSAGE}"` },
        { do: 'run', line: 'git show --stat HEAD' },
      ],
      claim: 'Done: committed only the free delivery change.',
      lesson:
        "git diff shows the lines, not just the names, so a debug print can't pass for a feature.",
    },
    {
      id: 'stage-cart',
      text: 'Stage src/cart.ts for the feature commit.',
      quality: 'okay',
      covers: ['goal', 'limits'],
      intents: ['stage src/cart.ts', 'stage cart.ts for the feature'],
      script: [
        { do: 'run', line: `git add ${CART}` },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: the feature is committed.',
      lesson:
        'Right file, but staging is not committing. git log --oneline still ends at the tax fix.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'undo-debug-commit',
      text: 'Undo that commit, keep the edits, then commit only src/cart.ts.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['undo that commit and keep the edits', 'commit only cart.ts'],
      script: [
        { do: 'run', line: 'git reset HEAD~1', say: 'Taking the commit back. Edits stay.' },
        { do: 'run', line: `git add ${CART}` },
        { do: 'run', line: `git commit -m "${FEATURE_MESSAGE}"` },
      ],
      claim: 'Fixed: the feature is committed, the debug line is not.',
      lesson: 'reset HEAD~1 took the debug commit back and kept every edit on the Workbench.',
      // "That commit" is the debug one. When the newest commit is the tax fix (Otto only
      // staged cart.ts), reset HEAD~1 would take the fix off main instead.
      when: { kind: 'commitChanged', paths: [CHECKOUT_TS] },
    },
  ],
  hintPlan: 'read-diff',
  check: {
    question: 'What does the newest commit hold?',
    // Is the debug print in the Vault? If not, is the newest commit cart.ts alone?
    options: [
      {
        id: 'feature',
        text: 'Only the free delivery change in cart.ts',
        truth: { kind: 'all', of: [cartAlone, debugOutOfVault] },
        feedback: 'git show --stat HEAD lists src/cart.ts alone.',
      },
      {
        id: 'debug',
        text: "Priya's debug print is in the Vault",
        truth: debugInVault,
        feedback:
          'git log --oneline shows "feat: log checkout items": the debug print was committed.',
      },
      {
        id: 'nothing-new',
        text: 'No new commit: the feature still waits',
        truth: {
          kind: 'all',
          of: [{ kind: 'not', predicate: cartAlone }, debugOutOfVault],
        },
        feedback: 'git log --oneline still ends at the tax fix.',
      },
    ],
  },
  guards: [debugOutOfVault, priyaEditSurvives, historyKeptWithFix],
  looks: [
    vaultLook,
    workbenchLook,
    { id: 'head', label: 'What did the last commit change?', line: 'git show --stat HEAD' },
  ],
} satisfies AgentTaskInput;

/* Judgment drills on small git scenes. The engine works out each key by running it. */

const portHistory = () =>
  repo()
    .commit('feat: add server config', { 'config.json': CONFIG_3000 })
    .commit('chore: try port 8080', { 'config.json': CONFIG_8080 })
    .commit('docs: add readme', { 'README.md': README_V1 });

const loginHistory = () =>
  repo()
    .commit('feat: add login page', { 'src/login.ts': SEARCH_V1 })
    .commit('fix: trim search input', { 'src/search.ts': SEARCH_V2 })
    .commit('docs: add readme', { 'README.md': README_V1 });

const drills = [
  {
    kind: 'fix',
    id: 'history-old-port',
    prompt: 'config.json needs its port from before "chore: try port 8080". Which fix is right?',
    concept: 'restore from history',
    setup: portHistory().toSpec(),
    goal: { kind: 'workingFile', path: 'config.json', contains: '"port": 3000' },
    failIf: [{ kind: 'commitCount', max: 2, label: 'Commits went missing' }],
    options: [
      {
        id: 'before-change',
        text: 'git restore --source=HEAD~2 config.json',
        script: [{ do: 'run', line: 'git restore --source=HEAD~2 config.json' }],
      },
      {
        id: 'newest-parent',
        text: 'git restore --source=HEAD~1 config.json',
        script: [{ do: 'run', line: 'git restore --source=HEAD~1 config.json' }],
      },
      {
        id: 'reset-hard',
        text: 'git reset --hard HEAD~2',
        script: [{ do: 'run', line: 'git reset --hard HEAD~2' }],
      },
    ],
    explain:
      'The port change is HEAD~1, so HEAD~2 is the version before it. reset --hard gets the port too, but drops two commits.',
  },
  {
    kind: 'predict',
    id: 'history-deleted-doc',
    prompt: 'The last commit deleted docs/setup.md. Otto is about to run this. What happens?',
    concept: 'restore from history',
    setup: repo()
      .commit('docs: add setup guide', { 'README.md': README_V1, 'docs/setup.md': SETUP_DOC })
      .commit('feat: add api client', { 'src/api.ts': API_PROD })
      .delete('docs/setup.md')
      .stage('docs/setup.md')
      .commit('chore: remove old docs')
      .toSpec(),
    action: { do: 'run', line: 'git restore --source=HEAD~1 docs/setup.md' },
    options: [
      {
        id: 'back',
        text: 'setup.md is back on the Workbench',
        outcome: { state: { kind: 'workingFile', path: 'docs/setup.md', equals: SETUP_DOC } },
      },
      { id: 'error', text: 'It fails: a deleted file is gone', outcome: { result: 'error' } },
      {
        id: 'in-vault',
        text: 'setup.md is back in the last commit',
        outcome: { state: { kind: 'fileAtHead', path: 'docs/setup.md' } },
      },
    ],
    explain:
      'The commit before the deletion still holds setup.md, so restore copies it back to the Workbench. Nothing is committed until you commit.',
  },
  {
    kind: 'approve',
    id: 'history-staged-surprise',
    prompt: 'api.ts and search.ts are staged; api.ts now points at localhost. Allow?',
    concept: 'diff --staged',
    setup: repo()
      .commit('feat: add search', { 'src/api.ts': API_PROD, 'src/search.ts': SEARCH_V1 })
      .write('src/api.ts', API_LOCAL)
      .write('src/search.ts', SEARCH_V2)
      .stage('src/api.ts', 'src/search.ts')
      .toSpec(),
    action: {
      do: 'run',
      line: 'git commit -m "fix: normalize search queries"',
      say: 'Committing the staged search fix.',
    },
    guards: [
      {
        kind: 'not',
        predicate: { kind: 'fileAtHead', path: 'src/api.ts', contains: 'localhost' },
        label: 'localhost stays out of the Vault',
      },
    ],
    explain:
      'A commit seals everything on the dock. git diff --staged would show the localhost line riding along with the search fix.',
  },
  {
    kind: 'diagnose',
    id: 'history-debug-print',
    prompt: 'Otto committed the free delivery change. Is he right?',
    concept: 'diff',
    setup: repo()
      .commit('feat: add checkout', { 'src/cart.ts': CART_V2, 'src/checkout.ts': CHECKOUT })
      .modify('src/cart.ts', CART_V3)
      .modify('src/checkout.ts', CHECKOUT_DEBUG)
      .toSpec(),
    history: [{ do: 'run', line: `git commit -am "${FEATURE_MESSAGE}"` }],
    claim: 'Done: committed only the free delivery change.',
    options: [
      {
        id: 'debug-rode',
        text: 'No: the debug print went in too',
        truth: { kind: 'fileAtHead', path: 'src/checkout.ts', contains: 'DEBUG' },
      },
      {
        id: 'only-cart',
        text: 'Yes: only cart.ts is in it',
        truth: { kind: 'commitChanged', paths: ['src/cart.ts'], only: true },
      },
      {
        id: 'nothing',
        text: 'No: nothing was committed',
        truth: { kind: 'not', predicate: { kind: 'commitChanged', paths: ['src/cart.ts'] } },
      },
    ],
    explain:
      'commit -am seals every tracked edit. git show --stat HEAD lists checkout.ts beside cart.ts.',
  },
  {
    kind: 'diagnose',
    // The id of the typed log drill this replaces, on the same history: saved review
    // items name drills by id, and an unknown id is dropped from the queue for good.
    id: 'history-save-log',
    prompt: 'You asked Otto which commit added src/login.ts. Is he right?',
    concept: 'log',
    setup: loginHistory().toSpec(),
    history: [{ do: 'run', line: 'git log --oneline' }],
    claim: '"fix: trim search input" added login.ts.',
    options: [
      {
        id: 'first-commit',
        text: 'No: "feat: add login page" added it',
        truth: { kind: 'commitChanged', ref: 'HEAD~2', paths: ['src/login.ts'] },
      },
      {
        id: 'right',
        text: 'Yes: the trim commit added it',
        truth: { kind: 'commitChanged', ref: 'HEAD~1', paths: ['src/login.ts'] },
      },
      {
        id: 'never',
        text: 'No: no commit holds login.ts',
        truth: { kind: 'notTracked', paths: ['src/login.ts'] },
      },
    ],
    explain:
      'git log names commits, not what they changed. git show HEAD~1 shows the trim commit touched only search.ts.',
  },
  {
    kind: 'approve',
    id: 'history-staged-vs-unstaged',
    prompt: 'search.ts has a staged fix and a newer unstaged experiment. Allow?',
    concept: 'diff --staged',
    setup: repo()
      .commit('feat: add search', { 'src/search.ts': SEARCH_V1 })
      .write('src/search.ts', SEARCH_V2)
      .stage('src/search.ts')
      .write('src/search.ts', SEARCH_EXPERIMENT)
      .toSpec(),
    action: {
      do: 'run',
      line: 'git commit -m "fix: normalize search queries"',
      say: 'Committing the staged search fix.',
    },
    guards: [
      {
        kind: 'workingFile',
        path: 'src/search.ts',
        contains: 'experiment',
        label: 'The experiment stays on the Workbench',
      },
      {
        kind: 'not',
        predicate: { kind: 'fileAtHead', path: 'src/search.ts', contains: 'experiment' },
        label: 'The experiment stays out of the Vault',
      },
    ],
    explain:
      'A commit seals the staged version only. The experiment stays unsaved on the Workbench, as git diff would show.',
  },
  {
    kind: 'approve',
    id: 'history-reset-to-read',
    prompt: 'You asked Otto what config.json looked like two commits ago. Allow?',
    concept: 'show',
    setup: portHistory().toSpec(),
    action: {
      do: 'run',
      line: 'git reset --hard HEAD~2',
      say: 'Going back two commits to read it.',
    },
    guards: [{ kind: 'commitCount', min: 3, label: 'Every commit stays' }],
    explain:
      'Reading needs no time travel. git show HEAD~2:config.json prints the old file; reset --hard drops two commits.',
  },
] satisfies JudgmentDrillInput[];

export const readingHistory: MissionInput = {
  id: 'reading-history',
  act: 2,
  title: 'Reading History',
  xp: 120,
  briefing: {
    sceneId: 'reading-history',
    captions: [
      'Every platform in the Vault is a commit. Otto reads them for you; check him against the real log.',
      'git log walks the bridges back. git show opens one platform: its message and what it changed.',
      'git diff compares rooms: Workbench against Dock, or with --staged, Dock against Vault.',
    ],
    diagram: 'diff-between-rooms',
  },
  initialRepoState: repo()
    .commit('feat: add cart and prices', {
      'README.md': README_V1,
      'src/prices.ts': PRICES,
      'src/cart.ts': CART_V1,
    })
    .commit('feat: add sales tax', { 'src/tax.ts': TAX_GOOD, 'src/cart.ts': CART_V2 })
    .commit('docs: explain checkout totals', { 'README.md': README_V2 })
    .commit('chore: tidy tax config', { 'src/tax.ts': TAX_BAD })
    .commit('feat: show order total at checkout', { 'src/checkout.ts': CHECKOUT })
    .write('src/checkout.ts', CHECKOUT_DEBUG)
    .stage('src/checkout.ts')
    .write('src/cart.ts', CART_V3)
    .toSpec(),
  approvals: 'destructive',
  steps: [
    {
      id: 'restore-tax',
      instruction:
        'Find the commit that changed TAX_RATE. Put src/tax.ts back the way it was before it.',
      success: taxFixed,
      hints: [
        'Which commit really changed TAX_RATE: the newest one, or another?',
        'git log -- src/tax.ts lists only commits that touched the file. git show opens one.',
        'Pick the card that finds the commit first, then restores from before it.',
      ],
      xp: 20,
      agent: restoreTaxTask,
    },
    {
      id: 'clear-dock',
      instruction: "Take checkout.ts's debug line off the Loading Dock. Keep the edit itself.",
      success: {
        kind: 'all',
        of: [
          { kind: 'notStaged', paths: [CHECKOUT_TS] },
          { kind: 'workingFile', path: CHECKOUT_TS, exists: true },
        ],
      },
      hints: [
        'Which diff shows what is already on the dock?',
        'git diff shows unstaged edits. git diff --staged shows what the next commit holds.',
        'Pick the card that reads git diff --staged, then unstages one file.',
      ],
      agent: clearDockTask,
    },
    {
      id: 'commit-fix',
      instruction: 'Commit the tax fix on its own: only src/tax.ts goes in.',
      success: {
        kind: 'all',
        of: [
          taxAlone,
          {
            kind: 'fileAtHead',
            path: TAX,
            contains: 'TAX_RATE = 0.08',
            label: 'The committed tax.ts has 0.08',
          },
        ],
      },
      hints: [
        'Which crates should be on the dock when Otto commits?',
        'A commit seals the whole dock. git diff --staged shows it first.',
        'Pick the card that stages only src/tax.ts and checks the dock.',
      ],
      agent: commitFixTask,
    },
    {
      id: 'commit-real-change',
      instruction:
        'Two files have unsaved edits. Commit only the real feature, not the debug line.',
      success: cartAlone,
      hints: [
        'What does git diff show that a list of file names does not?',
        'git diff shows the exact lines: + added, - removed. A DEBUG print is not a feature.',
        'Pick the card that reads git diff before committing.',
      ],
      xp: 20,
      agent: commitFeatureTask,
    },
  ],
  drills,
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Checkout totals look off',
      body: 'A few customers say checkout totals look weird since sometime last week. Can you figure out what changed and fix it? Thanks!',
    },
    candidates: [
      {
        id: 'example-order',
        text: 'Can you share one order where the total was wrong: what it showed, and what it should have been?',
        quality: 'strong',
        rationale:
          'Turns "weird" into a case you can reproduce, and a check that proves your fix works.',
      },
      {
        id: 'last-good',
        text: 'When did totals last look right? Even a rough day helps.',
        quality: 'strong',
        rationale: 'A date lets you narrow git log to the few commits that could be guilty.',
      },
      {
        id: 'which-orders',
        text: 'Is it every order, or only some, like certain items or amounts?',
        quality: 'okay',
        rationale: 'Helps narrow the search, though one real example order answers this and more.',
      },
      {
        id: 'what-shipped',
        text: 'Did anything else ship that week, like price or config changes?',
        quality: 'okay',
        rationale: 'Worth knowing, but git log can tell you this without asking Marco.',
      },
      {
        id: 'urgency',
        text: 'Is this blocking sales, or can it wait until the redesign ships?',
        quality: 'okay',
        rationale: 'Sets priority, but does not help you find the bug.',
      },
      {
        id: 'who-broke-it',
        text: 'Who made the change that broke it?',
        quality: 'weak',
        rationale: 'Blame slows a team down; find what changed, not who to point at.',
      },
      {
        id: 'rewrite',
        text: 'Can I rewrite the checkout code from scratch?',
        quality: 'weak',
        rationale:
          'A rewrite hides the cause and brings new bugs, when one bad change is the likely culprit.',
      },
      {
        id: 'which-command',
        text: 'Should I use git log or git show for this?',
        quality: 'weak',
        rationale: 'A tooling question Marco cannot answer, so try both or ask Sage.',
      },
    ],
    rubric:
      'A strong question asks for one concrete wrong total with the expected value, or when totals last looked right, so the suspect commits can be narrowed down with git log.',
  },
};
