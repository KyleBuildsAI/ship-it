import { repo } from '../../engine/git/fixtures';
import type { MissionInput } from '../../game/missions/schema';
import { headIsConventional } from './shared';

/**
 * Mission 2.5: every undo in Act 2, from smallest to scariest. restore for the
 * Workbench, restore --staged for the Loading Dock, reset --soft for an unpushed commit,
 * revert for shared history, then a deliberate reset --hard and a reflog rescue.
 */

const INDEX_V1 = '<h1>Quillwork</h1>\n<script type="module" src="src/app.js"></script>\n';
const INDEX_V2 = `${INDEX_V1}<form id="signup"></form>\n`;
const STYLE = 'body {\n  background: #0b1020;\n  color: #f5f7ff;\n}\n';
const STYLE_EXPERIMENT = 'body {\n  background: hotpink;\n  color: lime;\n}\n';
const APP_V1 = "export function start() {\n  document.title = 'Quillwork';\n}\n";
const APP_CONFETTI =
  "import { launchConfetti } from './confetti.js';\n\nexport function start() {\n  document.title = 'Quillwork';\n  launchConfetti();\n}\n";
const CONFETTI =
  "export function launchConfetti() {\n  // Ten thousand particles. What could go wrong?\n  for (let i = 0; i < 10000; i++) document.body.append('*');\n}\n";
const SIGNUP =
  "export function signUp(email) {\n  return fetch('/api/signup', { method: 'POST', body: email });\n}\n";
const README = '# Quillwork\n\nThe landing page for Quillwork AI.\n';
const PRICING = 'export function monthlyPrice(seats) {\n  return seats * 12;\n}\n';
const NOTES = 'Ask Sage about the reflog before Friday.\n';

const CONFIG_V1 = '{\n  "theme": "dark"\n}\n';
const CONFIG_V2 = '{\n  "theme": "light"\n}\n';
const PLAYER_V1 = 'export function play(video) {\n  video.play();\n}\n';
const PLAYER_AUTOPLAY =
  "import { autoplay } from './autoplay.js';\n\nexport function play(video) {\n  autoplay(video);\n}\n";
const AUTOPLAY = 'export function autoplay(video) {\n  video.muted = false;\n  video.play();\n}\n';

export const undoEverything: MissionInput = {
  id: 'undo-everything',
  act: 2,
  title: 'Undo Everything',
  xp: 160,
  briefing: {
    sceneId: 'undo-everything',
    captions: [
      'Every room has its own undo. restore rewinds the Workbench and the Loading Dock.',
      'revert adds a new platform that cancels an old one. reset moves your banner back.',
      'And the footprints of the reflog remember everywhere HEAD has been, even after a reset --hard.',
    ],
    diagram: 'undo-map',
  },
  initialRepoState: repo()
    .commit('feat: add landing page', {
      'index.html': INDEX_V1,
      'style.css': STYLE,
      'src/app.js': APP_V1,
    })
    .commit('feat: add signup form', { 'index.html': INDEX_V2, 'src/signup.js': SIGNUP })
    .commit('feat: add confetti on signup', {
      'src/confetti.js': CONFETTI,
      'src/app.js': APP_CONFETTI,
    })
    .commit('docs: add readme', { 'README.md': README })
    .commit('wip', { 'src/pricing.js': PRICING })
    .modify('style.css', STYLE_EXPERIMENT)
    .untracked('notes.txt', NOTES)
    .stage('notes.txt')
    .toSpec(),
  steps: [
    {
      id: 'discard-edit',
      instruction:
        'Friday afternoon. Your style.css experiment went badly. Throw away the unstaged edit and get the committed version back.',
      success: {
        kind: 'all',
        of: [
          {
            kind: 'workingFile',
            path: 'style.css',
            equals: STYLE,
            label: 'style.css matches the last commit',
          },
          { kind: 'notStaged', paths: ['style.css'] },
        ],
      },
      hints: [
        'Which command undoes changes on the Workbench? git status even suggests it.',
        'git restore <file> copies the file back from the Loading Dock, discarding unstaged edits. This undo has no undo, so be sure.',
        'Run: git restore style.css',
      ],
    },
    {
      id: 'unstage-notes',
      instruction: 'notes.txt is on the Loading Dock by mistake. Unstage it, but keep the file.',
      success: {
        kind: 'all',
        of: [
          { kind: 'notStaged', paths: ['notes.txt'] },
          { kind: 'workingFile', path: 'notes.txt', exists: true },
        ],
      },
      hints: [
        'Which flag makes restore work on the Loading Dock instead of the Workbench?',
        'git restore --staged <file> carries a crate from the dock back to the Workbench. The file on disk is untouched.',
        'Run: git restore --staged notes.txt',
      ],
    },
    {
      id: 'redo-wip',
      instruction:
        'Your last commit, "wip", was never pushed, and its message says nothing. Undo the commit but keep its changes, then commit again with a proper Conventional Commit message.',
      success: {
        kind: 'all',
        of: [
          { kind: 'commitCount', equals: 5, label: 'Still 5 commits: "wip" was replaced' },
          { kind: 'commitChanged', paths: ['src/pricing.js'], only: true },
          headIsConventional(),
        ],
      },
      hints: [
        'Which reset mode moves the branch back but leaves the changes staged?',
        'git reset --soft HEAD~1 moves the branch back one commit and keeps its changes on the Loading Dock, ready to recommit. Only rewrite commits nobody else has.',
        'Run: git reset --soft HEAD~1, then git commit -m "feat: add pricing calculator"',
      ],
      xp: 20,
    },
    {
      id: 'revert-confetti',
      instruction:
        'The confetti commit crashed signups, and the whole team already has it. Undo it without rewriting shared history.',
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['src/confetti.js'] },
          {
            kind: 'fileAtHead',
            path: 'src/app.js',
            equals: APP_V1,
            label: 'src/app.js is back to its pre-confetti version',
          },
          { kind: 'commitCount', min: 6, label: 'History kept: nothing was erased' },
        ],
      },
      hints: [
        'Is it safe to rewrite history that your teammates already pulled?',
        "git revert <commit> adds a new commit with the opposite changes. The bad commit stays in history, so nobody's copy breaks. Find its id with git log --oneline.",
        'Run: git revert HEAD~2',
      ],
      xp: 20,
    },
    {
      id: 'hard-reset',
      instruction:
        'Fire drill. Run git reset --hard HEAD~2 on purpose, and watch two commits vanish along with src/pricing.js.',
      success: {
        kind: 'all',
        of: [
          { kind: 'headMessageIs', message: 'docs: add readme' },
          { kind: 'workingFile', path: 'src/pricing.js', exists: false },
        ],
      },
      hints: [
        'What does --hard reset that --soft and --mixed leave alone?',
        '--hard moves the branch and resets both the Loading Dock and the Workbench. Commits look gone, but the reflog still remembers them.',
        'Run: git reset --hard HEAD~2',
      ],
    },
    {
      id: 'reflog-recover',
      instruction:
        'Now get it all back. git reflog lists every place HEAD has been. Follow the footprints back to your revert commit.',
      success: {
        kind: 'all',
        of: [
          { kind: 'tracked', paths: ['src/pricing.js'] },
          { kind: 'notTracked', paths: ['src/confetti.js'] },
          { kind: 'commitCount', min: 6, label: 'Your lost commits are back' },
        ],
      },
      hints: [
        'Where does git record every move HEAD makes, even the ones that erased commits?',
        "git reflog lists HEAD's past positions, newest first. HEAD@{1} is where HEAD was one move ago. PowerShell treats braces specially, so quote it: 'HEAD@{1}'.",
        "Run: git reflog, then git reset --hard 'HEAD@{1}'",
      ],
      xp: 30,
    },
  ],
  drills: [
    {
      id: 'undo-discard-edit',
      prompt: 'Throw away the unstaged edit to src/app.js.',
      setup: repo()
        .commit('feat: add landing page', { 'src/app.js': APP_V1 })
        .modify('src/app.js', APP_CONFETTI)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'clean' },
          {
            kind: 'workingFile',
            path: 'src/app.js',
            equals: APP_V1,
            label: 'src/app.js matches the last commit',
          },
        ],
      },
      timeLimitSeconds: 45,
      concept: 'restore',
    },
    {
      id: 'undo-restore-deleted',
      prompt: 'You deleted README.md by accident, and have not committed. Get it back.',
      setup: repo()
        .commit('docs: add readme', { 'README.md': README, 'index.html': INDEX_V1 })
        .delete('README.md')
        .toSpec(),
      success: { kind: 'workingFile', path: 'README.md', equals: README },
      timeLimitSeconds: 45,
      concept: 'restore',
    },
    {
      id: 'undo-unstage',
      prompt: 'Unstage config.json, but keep your edit to it on disk.',
      setup: repo()
        .commit('feat: add config', { 'config.json': CONFIG_V1 })
        .write('config.json', CONFIG_V2)
        .stage('config.json')
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'notStaged', paths: ['config.json'] },
          {
            kind: 'workingFile',
            path: 'config.json',
            equals: CONFIG_V2,
            label: 'Your edit to config.json is still on disk',
          },
        ],
      },
      timeLimitSeconds: 45,
      concept: 'restore-staged',
    },
    {
      id: 'undo-revert-shared',
      prompt:
        'The pushed commit "feat: add autoplay" broke the video page. Undo it without rewriting shared history.',
      setup: repo()
        .commit('feat: add video page', { 'index.html': INDEX_V1, 'src/player.js': PLAYER_V1 })
        .commit('feat: add autoplay', {
          'src/autoplay.js': AUTOPLAY,
          'src/player.js': PLAYER_AUTOPLAY,
        })
        .commit('docs: add readme', { 'README.md': README })
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['src/autoplay.js'] },
          { kind: 'fileAtHead', path: 'src/player.js', equals: PLAYER_V1 },
          { kind: 'tracked', paths: ['README.md'] },
          { kind: 'commitCount', equals: 4, label: 'One new commit, nothing erased' },
        ],
      },
      timeLimitSeconds: 90,
      concept: 'revert',
    },
    {
      id: 'undo-soft-reset',
      prompt: 'Your last commit is not pushed yet. Undo it, keeping its changes staged.',
      setup: repo()
        .commit('feat: add home page', { 'index.html': INDEX_V1 })
        .commit('feat: add search', { 'src/search.js': PRICING })
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'headMessageIs', message: 'feat: add home page' },
          { kind: 'staged', paths: ['src/search.js'] },
        ],
      },
      timeLimitSeconds: 45,
      concept: 'reset-soft',
    },
    {
      id: 'undo-mixed-reset',
      prompt: 'Undo your last commit and leave its changes unstaged on the Workbench.',
      setup: repo()
        .commit('feat: add landing page', { 'src/app.js': APP_V1 })
        .commit('feat: add confetti', { 'src/app.js': APP_CONFETTI })
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'headMessageIs', message: 'feat: add landing page' },
          { kind: 'modified', paths: ['src/app.js'] },
          { kind: 'notStaged', paths: ['src/app.js'] },
        ],
      },
      timeLimitSeconds: 45,
      concept: 'reset-mixed',
    },
    {
      id: 'undo-hard-reset',
      prompt:
        'Throw away the last commit and every uncommitted edit. Go back to "feat: add header".',
      setup: repo()
        .commit('feat: add header', {
          'index.html': INDEX_V1,
          'header.html': '<header></header>\n',
        })
        .commit('feat: add broken footer', { 'footer.html': '<footer>\n' })
        .modify('header.html', '<header>WIP\n')
        .toSpec(),
      success: {
        kind: 'all',
        of: [{ kind: 'headMessageIs', message: 'feat: add header' }, { kind: 'clean' }],
      },
      timeLimitSeconds: 60,
      concept: 'reset-hard',
    },
    {
      id: 'undo-reflog-rescue',
      prompt:
        'Rescue practice: run git reset --hard HEAD~2, then use the reflog to bring back "feat: add payments".',
      setup: repo()
        .commit('feat: add cart', { 'src/cart.js': APP_V1 })
        .commit('feat: add checkout', { 'src/checkout.js': SIGNUP })
        .commit('feat: add payments', { 'src/payments.js': PRICING })
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'headMessageIs', message: 'feat: add payments' },
          {
            kind: 'reflogContains',
            pattern: '^reset: moving to',
            label: 'The reflog shows your reset',
          },
        ],
      },
      timeLimitSeconds: 90,
      concept: 'reflog',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: "Undo yesterday's release",
      body: "Customers hate yesterday's update. Can you undo it? Like, all of it. As fast as possible please.",
    },
    candidates: [
      {
        id: 'which-change',
        text: 'Which part are customers unhappy about? If it is one feature, can we revert just that and keep the fixes?',
        quality: 'strong',
        rationale:
          'Undoing "all of it" also removes the good changes, so narrow it to the one that hurts.',
      },
      {
        id: 'already-shared',
        text: 'Has the release already been pushed and pulled by the team?',
        quality: 'strong',
        rationale:
          "Picks the safe undo: shared history gets git revert, because resetting it breaks everyone's copy.",
      },
      {
        id: 'data-changes',
        text: 'Did the release change any data, like a database migration, that undoing code will not reverse?',
        quality: 'strong',
        rationale: 'Undoing code does not undo data, and missing this can make the rollback worse.',
      },
      {
        id: 'deadline',
        text: 'Is there a time it must be undone by, like before the US wakes up?',
        quality: 'okay',
        rationale: 'Helps plan the work, but does not change what to undo.',
      },
      {
        id: 'announce',
        text: 'Should we tell customers once it is rolled back?',
        quality: 'okay',
        rationale: 'A good follow-up, once you know what you are undoing.',
      },
      {
        id: 'force-push',
        text: 'Can I reset main to last week and force push?',
        quality: 'weak',
        rationale:
          "Throws away the good fixes and teammates' work, when revert is the tool for shared history.",
      },
      {
        id: 'whose-idea',
        text: 'Whose idea was this update anyway?',
        quality: 'weak',
        rationale: 'Blame, not information, and it does not help the rollback.',
      },
      {
        id: 'reclone',
        text: 'Should I delete my copy of the repo and clone it again?',
        quality: 'weak',
        rationale: 'Changes nothing that customers see, and throws away your local work.',
      },
    ],
    rubric:
      'A strong question pins down exactly which change to undo, whether the history is already shared (revert, not reset), or which data changes a code undo will not reverse.',
  },
};
