import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 4.4: shipping. A version number is a promise to users about whether upgrading is safe,
 * a tag pins the exact commit that shipped, and a changelog is written for the people
 * upgrading, not for the people who wrote the code.
 */
export const releasesAndVersions = {
  id: 'releases-and-versions',
  act: 4,
  title: 'Releases and Versions',
  briefing: [
    'Merged is not shipped. A release is a named, tagged point that users can install and trust.',
    'Quillwork uses semantic versioning: MAJOR.MINOR.PATCH, where each number is a promise about what changed.',
  ],
  cards: [
    {
      id: 'minor',
      kind: 'choose',
      situation:
        'Quillwork is at 2.3.1. This release adds PDF export. Nothing that worked before changes.',
      question: 'What’s the next version?',
      options: [
        {
          id: 'patch',
          text: '2.3.2',
          correct: false,
          feedback: 'PATCH is for bug fixes only. This adds something new.',
        },
        {
          id: 'minor',
          text: '2.4.0',
          correct: true,
          feedback: 'Yes: a new feature that breaks nothing. PATCH resets to 0.',
        },
        {
          id: 'major',
          text: '3.0.0',
          correct: false,
          feedback: 'MAJOR means something people rely on stopped working. Nothing did.',
        },
      ],
      explanation:
        'Semantic versioning: MAJOR for breaking changes, MINOR for new features that keep old things working, PATCH for fixes. Bumping one resets the numbers to its right.',
    },
    {
      id: 'major',
      kind: 'choose',
      situation:
        'This release removes the old /v1/export API. Two partner apps still call it. The current version is 2.4.0.',
      question: 'What’s the next version?',
      options: [
        {
          id: 'minor',
          text: '2.5.0',
          correct: false,
          feedback: 'MINOR promises nothing breaks. The partner apps would break.',
        },
        {
          id: 'patch',
          text: '2.4.1',
          correct: false,
          feedback: 'A removal isn’t a fix, and users trust patches to be safe.',
        },
        {
          id: 'major',
          text: '3.0.0',
          correct: true,
          feedback: 'Removing something people use is a breaking change: MAJOR.',
        },
      ],
      explanation:
        'Breaking means code that worked against the old version stops working. That’s MAJOR, however small the change looks to you.',
    },
    {
      id: 'big-not-breaking',
      kind: 'choose',
      situation:
        'The next release adds twelve features and removes or changes nothing. The current version is 2.4.0.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: 'This release is huge, so I suggest we call it 3.0.0. A big number will get attention.',
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'minor',
          text: 'It’s 2.5.0. Lots of features, but nothing breaks.',
          correct: true,
          feedback: 'Yes. Size doesn’t pick the number. Compatibility does.',
        },
        {
          id: 'agree',
          text: 'Agreed, 3.0.0 tells users it’s a big deal.',
          correct: false,
          feedback: 'It also tells them upgrading might break things, so some won’t upgrade.',
        },
        {
          id: 'twelve',
          text: 'It’s 2.16.0, one minor bump per feature.',
          correct: false,
          feedback: 'One release bumps once. The version names a release, not a feature.',
        },
        {
          id: 'patch',
          text: 'It’s 2.4.1, since nothing broke.',
          correct: false,
          feedback: 'Nothing broke, but new features are MINOR, not PATCH.',
        },
      ],
      explanation:
        'A version number is a promise about compatibility, not a measure of effort. Users and tools decide whether to upgrade from it, so marketing has no place in it.',
    },
    {
      id: 'brief-the-changelog',
      kind: 'prompt',
      situation: 'You ask Otto to write the CHANGELOG.md entry for 3.0.0.',
      question: 'Which instruction gets a changelog users can use?',
      options: [
        {
          id: 'git-log',
          text: 'Paste the git log since 2.4.0 into CHANGELOG.md.',
          correct: false,
          feedback: 'Commit messages are for developers. “fix typo” tells users nothing.',
        },
        {
          id: 'vague',
          text: 'Write “Bug fixes and improvements”.',
          correct: false,
          feedback: 'Users can’t tell whether they need to change anything.',
        },
        {
          id: 'everything',
          text: 'List every file that changed, so nothing is left out.',
          correct: false,
          feedback: 'Complete, but useless to a user. They care about behaviour, not files.',
        },
        {
          id: 'grouped',
          text: 'Write the 3.0.0 entry from the merged PRs. Group it as Breaking, Added and Fixed, explain each in a user’s words, and give upgrade steps for removing /v1/export.',
          correct: true,
          feedback: 'Grouped, written for users, and the breaking change says what to do.',
        },
      ],
      explanation:
        'A changelog is for the people upgrading. Breaking changes come first with migration steps, then what’s new and what’s fixed. Merged PRs are a better source than raw commits.',
    },
    {
      id: 'what-a-tag-is',
      kind: 'choose',
      situation: 'Otto tagged the release.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git tag -a v3.0.0 -m "Quillwork 3.0.0"',
          'PS> git push origin v3.0.0',
          ' * [new tag]         v3.0.0 -> v3.0.0',
        ].join('\n'),
      },
      question: 'What does the tag give the team?',
      options: [
        {
          id: 'branch',
          text: 'A new branch for 3.0.0 work.',
          correct: false,
          feedback: 'Branches move as you commit. A tag stays on one commit.',
        },
        {
          id: 'pin',
          text: 'A fixed name for the exact commit that shipped.',
          correct: true,
          feedback: 'Yes. Anyone can check out v3.0.0 later and get exactly what users got.',
        },
        {
          id: 'deploy',
          text: 'It deploys 3.0.0 to users.',
          correct: false,
          feedback:
            'A tag is just a name. A pipeline might deploy on tags, but the tag itself doesn’t.',
        },
      ],
      explanation:
        'A tag names one commit and, by team rule, never moves. When a user reports a bug in 3.0.0, the tag lets you see exactly the code they’re running, even after main has moved on.',
    },
    {
      id: 'brief-the-release',
      kind: 'prompt',
      situation: 'Main has everything for 3.0.0. You want Otto to prepare the release.',
      question: 'Which instruction?',
      options: [
        {
          id: 'tag-branch',
          text: 'Tag v3.0.0 on your branch and publish the release now.',
          correct: false,
          feedback: 'Users would get code that was never reviewed or merged to main.',
        },
        {
          id: 'whatever',
          text: 'Release whatever is on main right now.',
          correct: false,
          feedback: 'No version bump and no changelog, so users can’t tell what changed.',
        },
        {
          id: 'pr-then-wait',
          text: 'Open a PR that bumps the version to 3.0.0 and adds the CHANGELOG entry. Don’t tag or publish; I’ll do that after it merges and main’s CI is green.',
          correct: true,
          feedback: 'The release prep gets reviewed, and the risky step waits for you.',
        },
      ],
      explanation:
        'Even release prep goes through a PR. Keeping the irreversible steps, tagging and publishing, for a person after CI is green is a sensible line to draw for an agent.',
    },
    {
      id: 'never-move-a-tag',
      kind: 'choose',
      situation:
        'An hour after 3.0.0 ships, Dex finds a typo in the export dialog. Otto offers to move the v3.0.0 tag onto the fix.',
      question: 'What do you do?',
      options: [
        {
          id: 'move',
          text: 'Move the tag. It’s only a typo.',
          correct: false,
          feedback: 'People already downloaded 3.0.0. Now one name means two different things.',
        },
        {
          id: 'delete',
          text: 'Delete the 3.0.0 release and publish it again.',
          correct: false,
          feedback: 'Same problem: users have the old 3.0.0 and can’t tell it apart.',
        },
        {
          id: 'wait',
          text: 'Leave it until 4.0.0.',
          correct: false,
          feedback: 'Users live with the bug for months. Patches exist for this.',
        },
        {
          id: 'patch',
          text: 'Leave v3.0.0 alone and ship the fix as 3.0.1.',
          correct: true,
          feedback: 'Yes. A published version never changes; the next one fixes it.',
        },
      ],
      explanation:
        'Once a version is out, its name must always mean the same code. Fixes go in a new PATCH release, so every user can say exactly what they’re running.',
    },
    {
      id: 'release-steps',
      kind: 'order',
      situation: 'The 3.0.0 release PR has been approved.',
      question: 'Put the release steps in order.',
      steps: [
        { id: 'merge', text: 'Merge the version bump and changelog PR' },
        { id: 'ci', text: 'Confirm CI on main is green' },
        { id: 'tag', text: 'Tag the merged commit v3.0.0' },
        { id: 'publish', text: 'Publish a GitHub release from the tag' },
        { id: 'announce', text: 'Tell users about the breaking change' },
      ],
      explanation:
        'Release from a green main with the changelog already merged. The tag pins the commit, the GitHub release gives users notes, and the announcement warns those affected.',
    },
  ],
} satisfies LessonInput;
