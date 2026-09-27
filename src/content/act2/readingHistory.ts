import { repo } from '../../engine/git/fixtures';
import type { MissionInput } from '../../game/missions/schema';

/**
 * Mission 2.2: reading history before touching code. log, show, diff, and
 * diff --staged change nothing, so every step here is graded on the action the reading
 * leads to: restoring the right version, unstaging the wrong file, committing the real
 * change and not the debug line.
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

export const readingHistory: MissionInput = {
  id: 'reading-history',
  act: 2,
  title: 'Reading History',
  xp: 120,
  briefing: {
    sceneId: 'reading-history',
    captions: [
      'Every platform in the Vault is a commit. git log walks the bridges back through time.',
      'git show opens one platform: its message and exactly what it changed.',
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
  steps: [
    {
      id: 'restore-tax',
      instruction:
        'Marco: "Totals are ten times too high since last week!" Use git log and git show to find the commit that changed TAX_RATE. Put src/tax.ts back the way it was before that commit.',
      success: {
        kind: 'workingFile',
        path: 'src/tax.ts',
        contains: 'TAX_RATE = 0.08',
        label: 'src/tax.ts has the rate from before the bad commit',
      },
      hints: [
        'Which command lists past commits, and which one shows what a single commit changed?',
        'git log --oneline lists commits, newest first. git show <commit> shows one commit. git show HEAD~2:src/tax.ts prints the file as it was two commits ago.',
        'Run: git show HEAD~2:src/tax.ts to check it, then git restore --source=HEAD~2 src/tax.ts',
      ],
      xp: 20,
    },
    {
      id: 'clear-dock',
      instruction:
        'Before you commit the fix, read the Loading Dock with git diff --staged. Something that is not the tax fix is already there. Unstage it, but keep the file.',
      success: {
        kind: 'all',
        of: [
          { kind: 'notStaged', paths: ['src/checkout.ts'] },
          { kind: 'workingFile', path: 'src/checkout.ts', exists: true },
        ],
      },
      hints: [
        'git diff on its own shows unstaged edits. Which flag shows what is already staged?',
        'git diff --staged compares the Vault with the Loading Dock: exactly what the next commit would contain. git restore --staged takes a crate off the dock.',
        'Run: git diff --staged, then git restore --staged src/checkout.ts',
      ],
    },
    {
      id: 'commit-fix',
      instruction: 'Now commit the tax fix on its own: only src/tax.ts goes in.',
      success: {
        kind: 'all',
        of: [
          { kind: 'commitChanged', paths: ['src/tax.ts'], only: true },
          {
            kind: 'fileAtHead',
            path: 'src/tax.ts',
            contains: 'TAX_RATE = 0.08',
            label: 'The committed src/tax.ts has the fixed rate',
          },
        ],
      },
      hints: [
        'Which two commands move one file from the Workbench into the Vault?',
        'Stage just that file, then commit. Checking git diff --staged first shows exactly what you are about to seal.',
        'Run: git add src/tax.ts, then git commit -m "fix: restore 8% sales tax"',
      ],
    },
    {
      id: 'commit-real-change',
      instruction:
        'Two files still have unstaged edits. Read them with git diff. One is a real feature, the other a leftover debug line. Commit only the feature.',
      success: { kind: 'commitChanged', paths: ['src/cart.ts'], only: true },
      hints: [
        'What does git diff show you that git status does not?',
        'git status names the changed files. git diff shows the exact lines: + added, - removed. A console.log that prints DEBUG is not a feature.',
        'Run: git diff, then git add src/cart.ts and git commit -m "feat: add free delivery threshold"',
      ],
      xp: 20,
    },
  ],
  drills: [
    {
      id: 'history-old-port',
      prompt:
        'A commit changed the port in config.json. Put config.json on disk back to how it was before that commit.',
      setup: repo()
        .commit('feat: add server config', { 'config.json': CONFIG_3000 })
        .commit('chore: try port 8080', { 'config.json': CONFIG_8080 })
        .commit('docs: add readme', { 'README.md': README_V1 })
        .toSpec(),
      success: {
        kind: 'workingFile',
        path: 'config.json',
        contains: '"port": 3000',
        label: 'config.json has the port from before the change',
      },
      timeLimitSeconds: 90,
      concept: 'show',
    },
    {
      id: 'history-deleted-doc',
      prompt: 'Someone deleted docs/setup.md in a commit. Bring the file back onto the Workbench.',
      setup: repo()
        .commit('docs: add setup guide', { 'README.md': README_V1, 'docs/setup.md': SETUP_DOC })
        .commit('feat: add api client', { 'src/api.ts': API_PROD })
        .delete('docs/setup.md')
        .stage('docs/setup.md')
        .commit('chore: remove old docs')
        .toSpec(),
      success: { kind: 'workingFile', path: 'docs/setup.md', equals: SETUP_DOC },
      timeLimitSeconds: 90,
      concept: 'log',
    },
    {
      id: 'history-staged-surprise',
      prompt:
        'Two files are staged. One staged edit points the app at localhost for testing. Unstage that one and keep the other staged.',
      setup: repo()
        .commit('feat: add search', { 'src/api.ts': API_PROD, 'src/search.ts': SEARCH_V1 })
        .write('src/api.ts', API_LOCAL)
        .write('src/search.ts', SEARCH_V2)
        .stage('src/api.ts', 'src/search.ts')
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'staged', paths: ['src/search.ts'] },
          { kind: 'notStaged', paths: ['src/api.ts'] },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'diff-staged',
    },
    {
      id: 'history-debug-print',
      prompt:
        'Two files have unstaged edits. One only adds a debug print. Commit just the real change.',
      setup: repo()
        .commit('feat: add checkout', { 'src/cart.ts': CART_V2, 'src/checkout.ts': CHECKOUT })
        .modify('src/cart.ts', CART_V3)
        .modify('src/checkout.ts', CHECKOUT_DEBUG)
        .toSpec(),
      success: { kind: 'commitChanged', paths: ['src/cart.ts'], only: true },
      timeLimitSeconds: 90,
      concept: 'diff',
    },
    {
      id: 'history-save-log',
      prompt: 'Save the one-line history of this repo to history.txt, to paste into a ticket.',
      setup: repo()
        .commit('feat: add login page', { 'src/login.ts': SEARCH_V1 })
        .commit('fix: trim search input', { 'src/search.ts': SEARCH_V2 })
        .commit('docs: add readme', { 'README.md': README_V1 })
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'workingFile', path: 'history.txt', contains: 'feat: add login page' },
          { kind: 'workingFile', path: 'history.txt', contains: 'docs: add readme' },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'log',
    },
    {
      id: 'history-staged-vs-unstaged',
      prompt:
        'src/search.ts has a staged edit and a newer unstaged edit on top. Commit only the staged version.',
      setup: repo()
        .commit('feat: add search', { 'src/search.ts': SEARCH_V1 })
        .write('src/search.ts', SEARCH_V2)
        .stage('src/search.ts')
        .write('src/search.ts', `${SEARCH_V2}// experiment: fuzzy matching\n`)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'fileAtHead', path: 'src/search.ts', equals: SEARCH_V2 },
          { kind: 'modified', paths: ['src/search.ts'] },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'diff-staged',
    },
  ],
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
