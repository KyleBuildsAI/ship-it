import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 3.3: conflicts. Reading the markers, resolving by what each side meant, and
 * keeping Otto honest when he resolves them fast and says he's done.
 */
export const conflictsWithoutPanic = {
  id: 'conflicts-without-panic',
  act: 3,
  title: 'Conflicts Without Panic',
  briefing: [
    'Priya and Otto both changed the autosave settings. Git can’t guess which is right, so it stops.',
    'A conflict isn’t an error. It’s a question only someone who knows why the code changed can answer.',
    'Sage’s rule: find out why each side changed before you pick one.',
  ],
  cards: [
    {
      id: 'why-it-stopped',
      kind: 'choose',
      situation: 'You merge Otto’s feat/slow-network into main, and git stops.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git merge feat/slow-network',
          'Auto-merging src/editor/autosave.ts',
          'CONFLICT (content): Merge conflict in src/editor/autosave.ts',
          'Automatic merge failed; fix conflicts and then commit the result.',
        ].join('\n'),
      },
      question: 'Why did git stop?',
      options: [
        {
          id: 'corrupt',
          text: 'autosave.ts is corrupted.',
          correct: false,
          feedback: 'Nothing is broken. Git wrote both versions into the file so you can choose.',
        },
        {
          id: 'too-far',
          text: 'The branches are too far apart to merge.',
          correct: false,
          feedback: 'Distance doesn’t matter. Only overlapping edits to the same lines conflict.',
        },
        {
          id: 'pull',
          text: 'Someone forgot to pull.',
          correct: false,
          feedback: 'Pulling wouldn’t help: the two changes really do overlap.',
        },
        {
          id: 'same-lines',
          text: 'Both branches changed the same lines of autosave.ts in different ways.',
          correct: true,
          feedback: 'Right. Every other file merged on its own.',
        },
      ],
      explanation:
        'Git merges changes to different lines by itself. When both sides change the same lines, it can’t know which is right, so it stops and asks.',
    },
    {
      id: 'read-markers',
      kind: 'choose',
      situation: 'You open the conflicted file.',
      artifact: {
        kind: 'file',
        label: 'src/editor/autosave.ts',
        text: [
          'export const autosave = {',
          '<<<<<<< HEAD',
          '  delayMs: 2000,',
          '=======',
          '  delayMs: 500,',
          '  retries: 3,',
          '>>>>>>> feat/slow-network',
          '};',
        ].join('\n'),
      },
      question: 'What do the markers mean?',
      options: [
        {
          id: 'old-new',
          text: 'Above ======= is the old code; below is the new code.',
          correct: false,
          feedback: 'Both sides are new. Each branch changed these lines differently.',
        },
        {
          id: 'sides',
          text: 'Above ======= is main (HEAD, where you are). Below is feat/slow-network, coming in.',
          correct: true,
          feedback: 'Yes. The incoming branch is named on the last marker.',
        },
        {
          id: 'picked',
          text: 'Git picked the bottom version; the top is a backup.',
          correct: false,
          feedback: 'Git picked nothing. Until you edit it, the file holds both.',
        },
      ],
      explanation:
        'From <<<<<<< HEAD to ======= is your side; from ======= to >>>>>>> is theirs. You resolve by writing the right result and deleting all three markers.',
    },
    {
      id: 'resolve-by-intent',
      kind: 'choose',
      situation:
        'Priya set 2000ms on main so slow laptops don’t stutter. Otto set 500ms plus 3 retries so flaky Wi-Fi loses less work.',
      question: 'How should you resolve it?',
      options: [
        {
          id: 'theirs',
          text: 'Take the incoming side. It’s newer.',
          correct: false,
          feedback: 'Newer isn’t right. Priya’s stutter fix would quietly disappear.',
        },
        {
          id: 'both-lines',
          text: 'Keep both delayMs lines. The last one wins anyway.',
          correct: false,
          feedback:
            'TypeScript rejects a duplicate key outright, and even in plain JavaScript one value silently disappears. Pick one value on purpose.',
        },
        {
          id: 'intent',
          text: 'Check both reasons with Priya, write a version that serves both, then run the tests.',
          correct: true,
          feedback: 'Yes. Maybe 2000ms with 3 retries keeps both fixes.',
        },
        {
          id: 'ours',
          text: 'Keep main’s side. Main is always right.',
          correct: false,
          feedback: 'Main isn’t automatically right. Otto’s retries fix a real problem.',
        },
      ],
      explanation:
        'Resolving means deciding what the code should do. Find out why each side changed, combine them if both reasons hold, and prove it with tests.',
    },
    {
      id: 'brief-the-resolve',
      kind: 'prompt',
      situation:
        'Otto hit 14 conflicts merging main into his branch. He offers to resolve them all.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'explain',
          text: 'For each conflict, show me both sides and what each was for. Resolve only the obvious ones, list the judgment calls for me, then run the full test suite.',
          correct: true,
          feedback: 'You stay in charge of the hard calls, and you get proof.',
        },
        {
          id: 'ours',
          text: 'Resolve them all with git checkout --ours, keeping your side.',
          correct: false,
          feedback: 'That silently throws away every teammate change in those 14 spots.',
        },
        {
          id: 'restart',
          text: 'Delete your branch and start over from main.',
          correct: false,
          feedback: 'Losing all that work costs far more than reading 14 conflicts.',
        },
      ],
      explanation:
        'Agents resolve conflicts fast but can’t know intent. Make the agent show its reasoning, keep the judgment calls for yourself, and require green tests as proof.',
    },
    {
      id: 'markers-left',
      kind: 'choose',
      situation: 'Otto says: “All conflicts resolved, ready to commit.” You read his diff first.',
      artifact: {
        kind: 'diff',
        label: 'src/editor/drafts.ts',
        text: [
          '@@ -8,4 +8,8 @@ export async function saveDraft(doc: Doc) {',
          '   const body = serialize(doc);',
          '+<<<<<<< HEAD',
          '   await store.put(doc.id, body);',
          '+=======',
          '+  await store.put(doc.id, body, { retries: 3 });',
          '+>>>>>>> feat/slow-network',
          '   return body;',
          ' }',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'commit',
          text: 'Commit it. He said it’s resolved.',
          correct: false,
          feedback: 'The markers are still in the file. It won’t even compile.',
        },
        {
          id: 'not-done',
          text: 'Not resolved: the markers are still there. Apply the version we agreed on, remove every marker, and run the tests.',
          correct: true,
          feedback: 'Yes. You read the diff instead of trusting the claim.',
        },
        {
          id: 'comments',
          text: 'Fine. The markers are just comments.',
          correct: false,
          feedback: 'They aren’t comments in any language. They break the build.',
        },
      ],
      explanation:
        'A conflict is resolved only when the markers are gone and the code is right. Agents claim “done” early, so read the diff and ask for proof before committing.',
    },
    {
      id: 'conflict-steps',
      kind: 'order',
      situation: 'A merge stopped with conflicts in two files.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'status', text: 'Run git status to list the conflicted files' },
        { id: 'edit', text: 'Edit each file to the right result, markers removed' },
        { id: 'check', text: 'Run git diff --check to catch any leftover markers' },
        { id: 'add', text: 'git add the resolved files' },
        { id: 'commit', text: 'Commit to finish the merge' },
      ],
      explanation:
        'Status lists what’s conflicted. After editing, git diff --check flags stray markers, but only before you stage. git add marks a file resolved, and the commit completes the merge.',
    },
    {
      id: 'wrong-branch',
      kind: 'prompt',
      situation:
        'Halfway through resolving, Otto realises he merged feat/live-cursors instead of feat/slow-network.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'delete-files',
          text: 'Delete the conflicted files and start again.',
          correct: false,
          feedback: 'That deletes files from the project, and the merge is still in progress.',
        },
        {
          id: 'commit-revert',
          text: 'Commit what you have, then revert it later.',
          correct: false,
          feedback:
            'Git won’t commit unresolved files without you staging the markers as-is, and reverting a merge later is messy. Abort is the clean undo.',
        },
        {
          id: 'abort',
          text: 'Run git merge --abort to put everything back as before the merge. Confirm git status is clean, then merge the right branch.',
          correct: true,
          feedback: 'The undo button for a merge in progress, plus proof it worked.',
        },
        {
          id: 'reset',
          text: 'Run git reset --hard HEAD~5 to be safe.',
          correct: false,
          feedback: 'That throws away five real commits as well as the merge.',
        },
      ],
      explanation:
        'Nothing is recorded until the merge commit. git merge --abort undoes a merge in progress, and a clean git status proves you’re back where you started.',
    },
    {
      id: 'fewer-conflicts',
      kind: 'choose',
      situation:
        'Quillwork has painful conflicts every week. Most branches live for about a month.',
      question: 'What reduces them most?',
      options: [
        {
          id: 'lock',
          text: 'Only one person may edit each file.',
          correct: false,
          feedback: 'It blocks the team and doesn’t scale.',
        },
        {
          id: 'small',
          text: 'Small branches merged within a day or two, bringing main in often.',
          correct: true,
          feedback: 'Yes: less time apart means fewer overlapping edits.',
        },
        {
          id: 'big',
          text: 'Bigger branches, merged once a month.',
          correct: false,
          feedback: 'The longer branches live apart, the more they collide.',
        },
      ],
      explanation:
        'Conflicts grow with time apart. Keep branches short-lived, bring main into them often, and split big work into small PRs.',
    },
  ],
} satisfies LessonInput;
