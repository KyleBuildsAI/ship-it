import { repo } from '../../engine/git/fixtures';
import type { AgentTaskInput } from '../../game/missions/agentSchema';
import type { Predicate } from '../../game/missions/predicates';
import type { JudgmentDrillInput, MissionInput } from '../../game/missions/schema';
import { CONVENTIONAL_PATTERN } from './shared';

/**
 * Mission 2.5, directed: every undo in Act 2, from smallest to scariest. Otto runs the git;
 * Kyle picks the request, allows or denies the risky lines, and checks Otto's claim.
 * restore for the Workbench, restore --staged for the Loading Dock, reset --soft for an
 * unpushed commit, revert for shared history, then a deliberate reset --hard and a reflog
 * rescue.
 *
 * Nothing here says which answer is right. A gate is harmful when a dry run breaks one of
 * the step's guards: reset --hard is harmful where it drops pushed commits or work with no
 * other copy, and safe in the fire drill, where the reflog still holds both commits.
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
const README_V2 = `${README}\nRun it with npm start.\n`;
const PRICING = 'export function monthlyPrice(seats) {\n  return seats * 12;\n}\n';
const NOTES = 'Ask Sage about the reflog before Friday.\n';

const CONFIG_V1 = '{\n  "theme": "dark"\n}\n';
const CONFIG_V2 = '{\n  "theme": "light"\n}\n';
const PLAYER_V1 = 'export function play(video) {\n  video.play();\n}\n';
const PLAYER_AUTOPLAY =
  "import { autoplay } from './autoplay.js';\n\nexport function play(video) {\n  autoplay(video);\n}\n";
const AUTOPLAY = 'export function autoplay(video) {\n  video.muted = false;\n  video.play();\n}\n';

/** The reflog line the fire drill leaves: step 5 grades the rescue against it. */
const DRILL_PATTERN = '^reset: moving to HEAD~2$';

// ---- What the steps check -------------------------------------------------------------

/** notes.txt is still on the Workbench: the work nothing else holds a copy of. */
const notesSurvive: Predicate = {
  kind: 'workingFile',
  path: 'notes.txt',
  label: 'Your notes.txt survives',
};
const styleBack: Predicate = { kind: 'workingFile', path: 'style.css', equals: STYLE };
const notesStaged: Predicate = { kind: 'staged', paths: ['notes.txt'] };
const notesCommitted: Predicate = { kind: 'tracked', paths: ['notes.txt'] };
const pricingSurvives: Predicate = {
  kind: 'workingFile',
  path: 'src/pricing.js',
  label: 'Your pricing work survives',
};
const pricingStaged: Predicate = { kind: 'staged', paths: ['src/pricing.js'] };
const headIsWip: Predicate = { kind: 'headMessageIs', message: 'wip' };
const headChangedPricing: Predicate = { kind: 'commitChanged', paths: ['src/pricing.js'] };

/**
 * Step 2 starts with five commits. Taking notes.txt off the dock needs none of them gone,
 * so a reset that drops one is harmful there.
 */
const everyCommitKept: Predicate = {
  kind: 'commitCount',
  min: 5,
  label: 'Every commit stays in history',
};
/** Every commit before "wip" is pushed: the team has them, so they stay. */
const pushedKept: Predicate = {
  kind: 'commitCount',
  min: 4,
  label: 'Pushed commits stay in history',
};
/**
 * Step 4 starts with five commits. The team has the first four; the fifth, pricing, was
 * redone in step 3 and never pushed, so dropping it alone is not harmful here.
 */
const sharedKept: Predicate = {
  kind: 'commitCount',
  min: 4,
  label: 'Shared commits stay in history',
};
const confettiGone: Predicate = {
  kind: 'notTracked',
  paths: ['src/confetti.js'],
  label: 'confetti.js is out of the last commit',
};
const appBack: Predicate = {
  kind: 'fileAtHead',
  path: 'src/app.js',
  equals: APP_V1,
  label: 'app.js is back to before confetti',
};
/**
 * main is back on the commit the fire drill left. Step 4 can end on a revert or on two
 * fix commits, so step 5 asks where HEAD stood, never what its message says.
 */
const drillUndone: Predicate = {
  kind: 'headBeforeReflog',
  pattern: DRILL_PATTERN,
  label: 'main is back where the drill started',
};
/** Both step 4 endings change app.js, so a soft drill always leaves it on the dock. */
const drillOnDock: Predicate = { kind: 'staged', paths: ['src/app.js'] };
/** notes.txt stays a loose file: reset --hard leaves files git never tracked alone. */
const notesLoose: Predicate = {
  kind: 'untracked',
  paths: ['notes.txt'],
  label: 'notes.txt stays a loose file',
};

/** Read-only lines Kyle can have Otto run while he checks a claim. */
const gitLooks = [
  { id: 'status', label: "What's on the dock?", line: 'git status' },
  { id: 'log', label: "What's in the Vault?", line: 'git log --oneline' },
  { id: 'staged', label: 'What will commit?', line: 'git diff --staged' },
];

// ---- Step 1: throw away the style.css experiment -------------------------------------

/**
 * The weak card resets everything, which also deletes notes.txt: it only ever lived on
 * the dock, so no commit can bring it back. The okay card uses the dock's undo on a file
 * that was never on the dock, so nothing happens.
 */
const discardEditTask = {
  plans: [
    {
      id: 'restore-style',
      text: 'Restore only style.css from the last commit. Touch nothing else.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['restore style.css', 'restore only style.css'],
      script: [
        {
          do: 'run',
          line: 'git restore style.css',
          say: 'Putting style.css back.',
          predict: {
            question: 'Before Otto runs it: what is in style.css after?',
            // Two options that split every state: is style.css the committed version?
            options: [
              { id: 'committed', text: "The last commit's version", outcome: { state: styleBack } },
              {
                id: 'experiment',
                text: 'Still the hotpink experiment',
                outcome: { state: { kind: 'not', predicate: styleBack } },
              },
            ],
          },
        },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: style.css matches the last commit.',
      lesson: 'git restore copied style.css back. Naming the file left notes.txt alone.',
    },
    {
      id: 'undo-all',
      text: 'Undo all my changes.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['undo all my changes', 'undo everything'],
      script: [
        { do: 'run', line: 'git reset --hard', say: 'Resetting everything to the last commit.' },
      ],
      claim: 'Done: everything is back to the last commit.',
      lesson: 'reset --hard also deleted notes.txt, which no commit held. Name the one file.',
      slip: 'big-hammer',
    },
    {
      id: 'unstage-style',
      text: 'Unstage style.css.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['unstage style.css', 'restore --staged style.css'],
      script: [{ do: 'run', line: 'git restore --staged style.css' }],
      claim: 'Done: style.css is undone.',
      lesson: '--staged only empties the dock, and style.css was never on it.',
      slip: 'wrong-verb',
    },
  ],
  fixes: [
    {
      id: 'fix-restore',
      text: 'Throw away the style.css edit with git restore.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['git restore style.css', 'throw away the edit'],
      script: [{ do: 'run', line: 'git restore style.css' }],
      claim: 'Fixed: style.css matches the last commit.',
      lesson: 'Without --staged, restore rewrites the Workbench copy from the dock.',
    },
  ],
  hintPlan: 'restore-style',
  check: {
    question: 'What are style.css and notes.txt like now?',
    // Split by two questions: is notes.txt still there, and is style.css back?
    options: [
      {
        id: 'clean',
        text: 'style.css is committed again, notes.txt kept',
        truth: { kind: 'all', of: [notesSurvive, styleBack] },
        feedback: 'git status shows no change to style.css, and notes.txt still waits.',
      },
      {
        id: 'experiment',
        text: 'style.css still has the experiment',
        truth: { kind: 'all', of: [notesSurvive, { kind: 'not', predicate: styleBack }] },
        feedback: 'git status still lists style.css as modified.',
      },
      {
        id: 'notes-gone',
        text: 'notes.txt is gone',
        truth: { kind: 'not', predicate: notesSurvive },
        feedback: 'git status no longer lists notes.txt anywhere.',
      },
    ],
  },
  guards: [notesSurvive],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Step 2: take notes.txt off the dock ---------------------------------------------

/**
 * The weak card commits notes.txt to get it "off the dock", and the fix undoes that
 * commit with a mixed reset. The okay card restores the Workbench copy, which is already
 * the same as the dock's.
 */
const unstageNotesTask = {
  plans: [
    {
      id: 'restore-staged',
      text: 'Take notes.txt off the Loading Dock. Keep the file.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['unstage notes.txt', 'restore --staged notes.txt'],
      script: [
        { do: 'run', line: 'git restore --staged notes.txt', say: 'Unloading notes.txt.' },
        { do: 'run', line: 'git status' },
      ],
      claim: 'Done: notes.txt is off the dock, file kept.',
      lesson: 'restore --staged emptied the dock. The file stayed on the Workbench.',
    },
    {
      id: 'commit-it',
      text: 'Get notes.txt off the dock.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['get notes off the dock', 'clear the dock'],
      script: [{ do: 'run', line: 'git commit -m "chore: save notes"', say: 'Shipping the dock.' }],
      claim: 'Done: the dock is empty.',
      lesson: 'Committing empties the dock by sealing notes.txt into history. Say "keep it out".',
      slip: 'overclaim',
    },
    {
      id: 'restore-notes',
      text: 'Restore notes.txt.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['restore notes.txt', 'git restore notes'],
      script: [{ do: 'run', line: 'git restore notes.txt' }],
      claim: 'Done: notes.txt is restored.',
      lesson: 'Plain restore rewrites the Workbench. The dock needs --staged.',
      slip: 'wrong-verb',
    },
  ],
  fixes: [
    {
      id: 'uncommit-notes',
      text: 'Undo that commit, and leave notes.txt as a loose file.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['undo that commit', 'reset HEAD~1'],
      script: [{ do: 'run', line: 'git reset HEAD~1', say: 'Taking that commit back.' }],
      claim: 'Fixed: notes.txt is loose again.',
      lesson: 'A mixed reset took the commit back and emptied the dock. The file stayed.',
      // "That commit" is Otto's notes.txt one. When the newest commit is "wip" (he only
      // restored the file), reset HEAD~1 would drop wip instead, so the card isn't offered.
      when: { kind: 'commitChanged', paths: ['notes.txt'] },
    },
  ],
  hintPlan: 'restore-staged',
  check: {
    question: 'Where is notes.txt now?',
    // Split by two questions: is it in the last commit, and if not, is it on the dock?
    options: [
      {
        id: 'loose',
        text: 'On the Workbench only, off the dock',
        truth: { kind: 'untracked', paths: ['notes.txt'] },
        feedback: 'git status lists notes.txt under Untracked files.',
      },
      {
        id: 'on-dock',
        text: 'Still waiting on the Loading Dock',
        truth: { kind: 'all', of: [notesStaged, { kind: 'not', predicate: notesCommitted }] },
        feedback: 'git status still lists notes.txt under Changes to be committed.',
      },
      {
        id: 'committed',
        text: 'Sealed into a commit',
        truth: notesCommitted,
        feedback: 'git log --oneline shows a new commit on top.',
      },
    ],
  },
  guards: [notesSurvive, everyCommitKept],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Step 3: redo the unpushed "wip" commit -------------------------------------------

/**
 * The weak card throws "wip" away with reset --hard, deleting src/pricing.js too: harmful.
 * The okay card commits again without undoing anything, so there is nothing to commit.
 */
const redoWipTask = {
  plans: [
    {
      id: 'soft-reset',
      text: 'Undo wip with reset --soft, recommit as feat: add pricing calculator.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['reset --soft HEAD~1', 'feat: add pricing calculator'],
      script: [
        {
          do: 'run',
          line: 'git reset --soft HEAD~1',
          say: 'Unsealing the wip commit.',
          predict: {
            question: 'Before Otto runs it: where does src/pricing.js go?',
            // Two options that split every state: is pricing.js waiting on the dock?
            options: [
              {
                id: 'dock',
                text: 'Back onto the Loading Dock',
                outcome: { state: pricingStaged },
              },
              {
                id: 'nowhere',
                text: 'Not onto the dock',
                outcome: { state: { kind: 'not', predicate: pricingStaged } },
              },
            ],
          },
        },
        { do: 'run', line: 'git commit -m "feat: add pricing calculator"' },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: wip is now feat: add pricing calculator.',
      lesson: 'reset --soft unsealed wip and kept its changes staged. One commit made it right.',
    },
    {
      id: 'hard-reset',
      text: 'Throw away the wip commit and start fresh.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['throw away wip', 'start fresh'],
      script: [{ do: 'run', line: 'git reset --hard HEAD~1', say: 'Dropping wip. Fresh start.' }],
      claim: 'Done: wip is gone.',
      lesson: 'reset --hard dropped the commit and deleted src/pricing.js with it.',
      slip: 'big-hammer',
    },
    {
      id: 'new-commit',
      text: 'Commit again with a better message.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['commit again', 'better message'],
      script: [{ do: 'run', line: 'git commit -m "feat: add pricing calculator"', fails: true }],
      claim: 'Done: the commit has a proper message.',
      lesson: 'Nothing was staged, so the commit failed. wip is still the last commit.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'fix-soft',
      text: 'Undo wip but keep its changes staged, then recommit properly.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['undo wip keep changes', 'recommit properly'],
      script: [
        { do: 'run', line: 'git reset --soft HEAD~1' },
        { do: 'run', line: 'git commit -m "feat: add pricing calculator"' },
      ],
      claim: 'Fixed: wip is now feat: add pricing calculator.',
      lesson: 'Unsealing first gave the new commit something to hold.',
      // Offered only while wip is still the newest commit: after a hard reset dropped it,
      // one more step back would unseal a pushed commit.
      when: headIsWip,
    },
  ],
  hintPlan: 'soft-reset',
  check: {
    question: 'What is the newest commit now?',
    // wip changed pricing.js, so these three split every state.
    options: [
      {
        id: 'redone',
        text: 'Pricing, with a proper message',
        truth: { kind: 'all', of: [headChangedPricing, { kind: 'not', predicate: headIsWip }] },
        feedback: 'git log --oneline starts with feat: add pricing calculator.',
      },
      {
        id: 'wip',
        text: 'Still wip',
        truth: headIsWip,
        feedback: 'git log --oneline still starts with wip.',
      },
      {
        id: 'lost',
        text: 'One without the pricing work',
        truth: { kind: 'not', predicate: headChangedPricing },
        feedback: 'git log --oneline starts with an older commit. Pricing is gone.',
      },
    ],
  },
  guards: [pricingSurvives, pushedKept],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Step 4: undo the shared confetti commit -----------------------------------------

/**
 * The team already has the confetti commit, so the guard keeps every shared commit. The
 * weak card resets back past it, dropping three, two of them shared: harmful. The okay card deletes confetti.js
 * but leaves app.js calling it.
 */
const revertConfettiTask = {
  plans: [
    {
      id: 'revert',
      text: 'Revert the confetti commit with a new commit. Keep history.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['revert the confetti commit', 'git revert'],
      script: [
        { do: 'run', line: 'git log --oneline', say: 'Finding the confetti commit.' },
        {
          do: 'run',
          line: 'git revert HEAD~2',
          predict: {
            question: 'Before Otto runs it: what happens to history?',
            // Two options that split every state: did the history keep every commit?
            options: [
              {
                id: 'adds',
                text: 'A new commit is added on top',
                outcome: { state: { kind: 'commitCount', min: 6 } },
              },
              {
                id: 'erases',
                text: 'The confetti commit is erased',
                outcome: { state: { kind: 'commitCount', max: 5 } },
              },
            ],
          },
        },
      ],
      claim: 'Done: confetti is undone, history kept.',
      lesson: "revert added a commit that cancels confetti. Nobody's copy breaks.",
    },
    {
      id: 'reset-back',
      text: 'Go back to before the confetti commit.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['go back to before confetti', 'undo confetti'],
      script: [{ do: 'run', line: 'git reset --hard HEAD~3', say: 'Rewinding past confetti.' }],
      claim: 'Done: confetti is gone.',
      lesson:
        "reset --hard erased three commits, two the team has. Every teammate's copy now disagrees.",
      slip: 'big-hammer',
    },
    {
      id: 'delete-file',
      text: 'Delete confetti.js and commit the removal.',
      quality: 'okay',
      covers: ['goal'],
      intents: ['delete confetti.js', 'remove the confetti file'],
      script: [
        { do: 'run', line: 'git rm src/confetti.js', say: 'Removing confetti.js.' },
        { do: 'run', line: 'git commit -m "fix: remove confetti"' },
      ],
      claim: 'Done: confetti is undone.',
      lesson: 'app.js still calls launchConfetti. A revert undoes every file a commit touched.',
      slip: 'overclaim',
    },
  ],
  fixes: [
    {
      id: 'fix-app',
      text: 'Put app.js back to its pre-confetti version, and commit it.',
      quality: 'strong',
      covers: ['goal', 'limits'],
      intents: ['put app.js back', 'restore app.js'],
      script: [
        { do: 'run', line: 'git restore --source=HEAD~4 src/app.js' },
        { do: 'run', line: 'git commit -am "fix: stop launching confetti"' },
      ],
      claim: 'Fixed: app.js no longer calls confetti.',
      lesson: 'app.js came back from before confetti, and a new commit sealed it.',
    },
  ],
  hintPlan: 'revert',
  check: {
    question: 'Is confetti undone, with history kept?',
    // Split by two questions: did shared commits go, and is any confetti code left?
    options: [
      {
        id: 'reverted',
        text: 'Yes: undone, every commit kept',
        truth: { kind: 'all', of: [sharedKept, confettiGone, appBack] },
        feedback: 'git log --oneline lists every old commit, with the undo on top.',
      },
      {
        id: 'half',
        text: 'No: confetti code is still committed',
        truth: {
          kind: 'all',
          of: [
            sharedKept,
            { kind: 'not', predicate: { kind: 'all', of: [confettiGone, appBack] } },
          ],
        },
        feedback: 'app.js in the last commit still imports confetti.js.',
      },
      {
        id: 'erased',
        text: 'Shared commits were erased',
        truth: { kind: 'not', predicate: sharedKept },
        feedback: 'Count the lines in git log --oneline: commits went missing.',
      },
    ],
  },
  guards: [sharedKept],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Step 5: fire drill, then the reflog rescue --------------------------------------

/**
 * A deliberate reset --hard on the two newest commits, both unpushed. They are the revert
 * and pricing, or after step 4's fix card, its two fix commits. Its gate is safe: no
 * guard protects those commits, because the reflog still knows them. The weak card runs the drill and
 * stops; the okay card uses reset --soft, so the work waits on the dock instead.
 */
const reflogRecoverTask = {
  plans: [
    {
      id: 'drill-rescue',
      text: 'Reset --hard two commits, then bring them back from the reflog.',
      quality: 'strong',
      covers: ['goal', 'check'],
      intents: ['reset --hard HEAD~2 then reflog', 'bring them back from the reflog'],
      script: [
        { do: 'run', line: 'git reset --hard HEAD~2', say: 'Fire drill. Two commits going.' },
        { do: 'run', line: 'git reflog', say: 'Following the footprints.' },
        {
          do: 'run',
          line: "git reset --hard 'HEAD@{1}'",
          predict: {
            question: 'Before Otto runs it: where does main end up?',
            // Two options that split every state: is main back where the drill started?
            options: [
              {
                id: 'back',
                text: 'Back where it was before the drill',
                outcome: { state: drillUndone },
              },
              {
                id: 'missing',
                text: 'Still missing the two commits',
                outcome: { state: { kind: 'not', predicate: drillUndone } },
              },
            ],
          },
        },
        { do: 'run', line: 'git log --oneline' },
      ],
      claim: 'Done: drill over, both commits are back.',
      lesson: 'HEAD@{1} is where HEAD stood one move ago: right before the reset.',
    },
    {
      id: 'drill-only',
      text: 'Run the reset --hard fire drill.',
      quality: 'weak',
      covers: ['goal'],
      intents: ['run the fire drill', 'reset --hard HEAD~2'],
      script: [
        { do: 'run', line: 'git reset --hard HEAD~2', say: 'Fire drill. Two commits going.' },
      ],
      claim: 'Done: drill over, nothing was lost.',
      lesson: 'The two commits left main. Only the reflog still points at them.',
      slip: 'overclaim',
    },
    {
      id: 'soft-drill',
      text: 'Do the drill with reset --soft instead, to be safe.',
      quality: 'okay',
      covers: ['goal', 'limits'],
      intents: ['reset --soft HEAD~2', 'drill with soft'],
      script: [{ do: 'run', line: 'git reset --soft HEAD~2' }],
      claim: 'Done: drill over, both commits are safe.',
      lesson: 'The commits still left main. Their changes only wait on the dock.',
      slip: 'wrong-verb',
    },
  ],
  fixes: [
    {
      id: 'reflog-back',
      text: 'Find where HEAD was in the reflog, and reset back there.',
      quality: 'strong',
      covers: ['goal', 'check'],
      intents: ['use the reflog', 'reset to HEAD@{1}'],
      script: [
        { do: 'run', line: 'git reflog' },
        { do: 'run', line: "git reset --hard 'HEAD@{1}'" },
      ],
      claim: 'Fixed: both commits are back on main.',
      lesson: 'The reflog remembered the commit HEAD left. Resetting to it brought both back.',
    },
  ],
  hintPlan: 'drill-rescue',
  check: {
    question: 'Where are the two commits now?',
    // Split by two questions: is main back where the drill started, and if not, is the work
    // on the dock?
    options: [
      {
        id: 'back',
        text: 'Back on main, where they were',
        truth: drillUndone,
        feedback: 'git log --oneline lists both commits on top again.',
      },
      {
        id: 'dock',
        text: 'Off main, their changes on the dock',
        truth: { kind: 'all', of: [{ kind: 'not', predicate: drillUndone }, drillOnDock] },
        feedback: 'git status lists their files under Changes to be committed.',
      },
      {
        id: 'gone',
        text: 'Off main, and off the dock',
        truth: {
          kind: 'all',
          of: [
            { kind: 'not', predicate: drillUndone },
            { kind: 'not', predicate: drillOnDock },
          ],
        },
        feedback:
          'git log --oneline is missing both, and nothing is under Changes to be committed.',
      },
    ],
  },
  guards: [notesLoose],
  looks: gitLooks,
} satisfies AgentTaskInput;

// ---- Judgment drills -------------------------------------------------------------------

const videoProject = () =>
  repo()
    .commit('feat: add video page', { 'index.html': INDEX_V1, 'src/player.js': PLAYER_V1 })
    .commit('feat: add autoplay', { 'src/autoplay.js': AUTOPLAY, 'src/player.js': PLAYER_AUTOPLAY })
    .commit('docs: add readme', { 'README.md': README });

/** Every commit in the video project is pushed: the team has all three. */
const videoPushedKept: Predicate = {
  kind: 'commitCount',
  min: 3,
  label: 'Pushed commits stay in history',
};

/** The engine works out each key; describeJudgmentDrills in the test pins it. */
const drills = [
  {
    kind: 'approve',
    id: 'undo-discard-edit',
    prompt: 'You told Otto to drop your app.js edit, and keep the README edit. Allow?',
    concept: 'restore',
    setup: repo()
      .commit('feat: add landing page', { 'src/app.js': APP_V1, 'README.md': README })
      .modify('src/app.js', APP_CONFETTI)
      .modify('README.md', README_V2)
      .toSpec(),
    action: { do: 'run', line: 'git restore src/app.js', say: 'Throwing away the app.js edit.' },
    guards: [
      {
        kind: 'workingFile',
        path: 'README.md',
        equals: README_V2,
        label: 'Your README edit survives',
      },
    ],
    explain: 'Naming src/app.js limits restore to that one file. The README edit stays.',
  },
  {
    kind: 'fix',
    id: 'undo-restore-deleted',
    prompt: 'You deleted README.md by accident, and have not committed. Which fix is right?',
    concept: 'restore',
    setup: repo()
      .commit('docs: add readme', { 'README.md': README, 'index.html': INDEX_V1 })
      .delete('README.md')
      .toSpec(),
    goal: { kind: 'workingFile', path: 'README.md', equals: README },
    options: [
      {
        id: 'restore',
        text: 'git restore README.md',
        script: [{ do: 'run', line: 'git restore README.md' }],
      },
      {
        id: 'restore-staged',
        text: 'git restore --staged README.md',
        script: [{ do: 'run', line: 'git restore --staged README.md' }],
      },
      {
        id: 'commit',
        text: 'git commit -am "docs: drop readme"',
        script: [{ do: 'run', line: 'git commit -am "docs: drop readme"' }],
      },
    ],
    explain: 'The last commit still has README.md, so restore copies it back to the Workbench.',
  },
  {
    kind: 'predict',
    id: 'undo-unstage',
    prompt: 'Otto is about to run this. What happens to config.json?',
    concept: 'restore-staged',
    setup: repo()
      .commit('feat: add config', { 'config.json': CONFIG_V1 })
      .write('config.json', CONFIG_V2)
      .stage('config.json')
      .toSpec(),
    action: { do: 'run', line: 'git restore --staged config.json' },
    options: [
      {
        id: 'off-dock',
        text: 'It leaves the dock; the edit stays on disk',
        outcome: {
          state: {
            kind: 'all',
            of: [
              { kind: 'notStaged', paths: ['config.json'] },
              { kind: 'workingFile', path: 'config.json', equals: CONFIG_V2 },
            ],
          },
        },
      },
      {
        id: 'edit-gone',
        text: 'The edit is thrown away',
        outcome: { state: { kind: 'workingFile', path: 'config.json', equals: CONFIG_V1 } },
      },
      { id: 'fails', text: 'It fails: nothing to unstage', outcome: { result: 'error' } },
    ],
    explain: '--staged works on the Loading Dock only. The file on disk keeps your edit.',
  },
  {
    kind: 'fix',
    id: 'undo-revert-shared',
    prompt: 'The pushed commit "feat: add autoplay" broke the video page. Which fix is right?',
    concept: 'revert',
    setup: videoProject().toSpec(),
    goal: {
      kind: 'all',
      of: [
        { kind: 'notTracked', paths: ['src/autoplay.js'] },
        { kind: 'fileAtHead', path: 'src/player.js', equals: PLAYER_V1 },
        { kind: 'tracked', paths: ['README.md'] },
      ],
    },
    failIf: [{ kind: 'not', predicate: videoPushedKept }],
    options: [
      {
        id: 'revert',
        text: 'git revert HEAD~1',
        script: [{ do: 'run', line: 'git revert HEAD~1' }],
      },
      {
        id: 'reset-hard',
        text: 'git reset --hard HEAD~2',
        script: [{ do: 'run', line: 'git reset --hard HEAD~2' }],
      },
      {
        id: 'rm-autoplay',
        text: 'Remove autoplay.js and commit',
        script: [
          { do: 'run', line: 'git rm src/autoplay.js' },
          { do: 'run', line: 'git commit -m "fix: remove autoplay"' },
        ],
      },
    ],
    explain: 'revert adds a commit that cancels autoplay in every file. Pushed history stays.',
  },
  {
    kind: 'predict',
    id: 'undo-soft-reset',
    prompt: 'Otto is about to run this. Where does src/search.js end up?',
    concept: 'reset-soft',
    setup: repo()
      .commit('feat: add home page', { 'index.html': INDEX_V1 })
      .commit('feat: add search', { 'src/search.js': PRICING })
      .toSpec(),
    action: { do: 'run', line: 'git reset --soft HEAD~1' },
    options: [
      {
        id: 'dock',
        text: 'On the Loading Dock, ready to recommit',
        outcome: { state: { kind: 'staged', paths: ['src/search.js'] } },
      },
      {
        id: 'workbench',
        text: 'On the Workbench, not staged',
        outcome: { state: { kind: 'untracked', paths: ['src/search.js'] } },
      },
      {
        id: 'deleted',
        text: 'Deleted with the commit',
        outcome: { state: { kind: 'workingFile', path: 'src/search.js', exists: false } },
      },
    ],
    explain: "--soft moves the branch back only. The commit's changes wait on the dock.",
  },
  {
    kind: 'diagnose',
    id: 'undo-mixed-reset',
    prompt: 'Otto says your confetti change is gone. Is he right?',
    concept: 'reset-mixed',
    setup: repo()
      .commit('feat: add landing page', { 'src/app.js': APP_V1 })
      .commit('feat: add confetti', { 'src/app.js': APP_CONFETTI })
      .toSpec(),
    history: [{ do: 'run', line: 'git reset HEAD~1', say: 'Undoing the confetti commit.' }],
    claim: 'Done: the confetti change is gone for good.',
    options: [
      {
        id: 'on-workbench',
        text: 'No: it waits unstaged on the Workbench',
        truth: {
          kind: 'all',
          of: [
            { kind: 'modified', paths: ['src/app.js'] },
            { kind: 'notStaged', paths: ['src/app.js'] },
          ],
        },
      },
      {
        id: 'on-dock',
        text: 'No: it waits on the Loading Dock',
        truth: { kind: 'staged', paths: ['src/app.js'] },
      },
      {
        id: 'gone',
        text: 'Yes: app.js is back to before confetti',
        truth: { kind: 'workingFile', path: 'src/app.js', equals: APP_V1 },
      },
    ],
    explain: 'A plain reset moves the branch and empties the dock. Your Workbench keeps the edit.',
  },
  {
    kind: 'approve',
    id: 'undo-hard-reset',
    prompt: 'The team already has all three commits. Otto wants to undo the readme. Allow?',
    concept: 'reset-hard',
    setup: videoProject().toSpec(),
    action: { do: 'run', line: 'git reset --hard HEAD~1', say: 'Dropping the readme commit.' },
    guards: [videoPushedKept],
    explain: 'reset --hard takes a pushed commit off main. Teammates still have it: revert it.',
  },
  {
    kind: 'fix',
    id: 'undo-reflog-rescue',
    prompt: 'Otto ran reset --hard by mistake. Which fix brings back "feat: add payments"?',
    concept: 'reflog',
    setup: repo()
      .commit('feat: add cart', { 'src/cart.js': APP_V1 })
      .commit('feat: add checkout', { 'src/checkout.js': SIGNUP })
      .commit('feat: add payments', { 'src/payments.js': PRICING })
      .toSpec(),
    history: [{ do: 'run', line: 'git reset --hard HEAD~2', say: 'Cleaning up history.' }],
    goal: {
      kind: 'all',
      of: [
        { kind: 'headMessageIs', message: 'feat: add payments' },
        { kind: 'commitCount', equals: 3 },
      ],
    },
    options: [
      {
        id: 'reflog',
        text: "git reset --hard 'HEAD@{1}'",
        script: [{ do: 'run', line: "git reset --hard 'HEAD@{1}'" }],
      },
      {
        id: 'revert',
        text: 'git revert HEAD',
        script: [{ do: 'run', line: 'git revert HEAD' }],
      },
      {
        id: 'recommit',
        text: 'Commit payments again',
        script: [{ do: 'run', line: 'git commit -m "feat: add payments"' }],
      },
    ],
    explain:
      'HEAD@{1} is where HEAD stood before the reset. Resetting there brings both commits back.',
  },
] satisfies JudgmentDrillInput[];

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
  approvals: 'destructive',
  steps: [
    {
      id: 'discard-edit',
      instruction:
        'Friday. Your style.css experiment went badly. Get the committed version back, and keep notes.txt.',
      success: {
        kind: 'all',
        of: [
          { ...styleBack, label: 'style.css matches the last commit' },
          { kind: 'notStaged', paths: ['style.css'] },
        ],
      },
      hints: [
        'Which undo works on one Workbench file, and leaves everything else alone?',
        'git restore <file> copies a file back from the dock. Unstaged edits are gone for good.',
        'Pick the card that restores only style.css.',
      ],
      agent: discardEditTask,
    },
    {
      id: 'unstage-notes',
      instruction: 'notes.txt is on the Loading Dock by mistake. Take it off, but keep the file.',
      success: {
        kind: 'all',
        of: [
          { kind: 'untracked', paths: ['notes.txt'], label: 'notes.txt is off the dock' },
          { kind: 'notTracked', paths: ['notes.txt'], label: 'No commit holds notes.txt' },
        ],
      },
      hints: [
        'Which flag makes restore work on the Loading Dock instead of the Workbench?',
        'git restore --staged takes a crate off the dock. The file on disk is untouched.',
        'Pick the card that takes notes.txt off the Loading Dock.',
      ],
      agent: unstageNotesTask,
    },
    {
      id: 'redo-wip',
      instruction:
        'Your last commit, "wip", was never pushed. Redo it with a proper message, keeping its changes.',
      success: {
        kind: 'all',
        of: [
          { kind: 'commitCount', equals: 5, label: 'Still 5 commits: wip was replaced' },
          { kind: 'commitChanged', paths: ['src/pricing.js'], only: true },
          {
            kind: 'headMessage',
            pattern: CONVENTIONAL_PATTERN,
            label: 'A Conventional Commit message',
          },
        ],
      },
      hints: [
        'Which reset mode moves the branch back but keeps the changes staged?',
        'reset --soft HEAD~1 unseals the last commit. Only rewrite commits nobody else has.',
        'Pick the card that uses reset --soft.',
      ],
      xp: 20,
      agent: redoWipTask,
    },
    {
      id: 'revert-confetti',
      instruction:
        'The confetti commit crashed signups, and the team already has it. Undo it without rewriting history.',
      success: {
        kind: 'all',
        of: [
          confettiGone,
          appBack,
          { kind: 'commitCount', min: 6, label: 'A new commit, nothing erased' },
        ],
      },
      hints: [
        'Is it safe to rewrite history your teammates already pulled?',
        'git revert adds a commit with the opposite changes. The bad one stays in history.',
        'Pick the card that reverts the confetti commit.',
      ],
      xp: 20,
      agent: revertConfettiTask,
    },
    {
      id: 'reflog-recover',
      instruction:
        'Fire drill: reset --hard your two newest commits, both unpushed, then bring them back with the reflog.',
      success: {
        kind: 'all',
        of: [
          { kind: 'reflogContains', pattern: DRILL_PATTERN, label: 'The fire drill ran' },
          drillUndone,
          {
            kind: 'tracked',
            paths: ['src/pricing.js'],
            label: 'Your pricing commit is in history',
          },
        ],
      },
      hints: [
        'Where does git record every move HEAD makes, even ones that erased commits?',
        "git reflog lists HEAD's past positions. HEAD@{1} is where it stood one move ago.",
        'Pick the card that resets, then follows the reflog back.',
      ],
      xp: 30,
      agent: reflogRecoverTask,
    },
  ],
  drills,
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
