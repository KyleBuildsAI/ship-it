import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 1.5 Dependencies Are Declared, taught as a lesson: the laptop engine doesn't simulate
 * npm, so Kyle reads real npm output and decides what Otto should do. The principle: a
 * project lists what it needs in package.json, installs into its own node_modules, and
 * is pinned by the lockfile. Install from the project folder, and read every name.
 */
export const dependenciesAreDeclared = {
  id: 'dependencies-are-declared',
  act: 1,
  title: 'Dependencies Are Declared',
  // The same as each directed mission in Act 1, so the lessons aren't worth less.
  xp: 100,
  briefing: [
    'The Quillwork API needs libraries before it runs: express for the web, dotenv for settings.',
    'Otto installs them fast. Your job is the judgment: which folder, which exact name, and what gets committed.',
  ],
  cards: [
    {
      id: 'declared',
      kind: 'choose',
      situation:
        'You open the Quillwork API on your laptop for the first time. Otto shows you package.json.',
      artifact: {
        kind: 'file',
        label: 'C:\\Users\\kyle\\quillwork\\api\\package.json',
        text: [
          '{',
          '  "name": "quillwork-api",',
          '  "version": "1.0.0",',
          '  "scripts": {',
          '    "start": "node server.js"',
          '  },',
          '  "dependencies": {',
          '    "dotenv": "^16.4.5",',
          '    "express": "^4.21.2"',
          '  },',
          '  "devDependencies": {',
          '    "vitest": "^2.1.8"',
          '  }',
          '}',
        ].join('\n'),
      },
      question: 'What does this file tell you?',
      options: [
        {
          id: 'the-code',
          text: 'It holds the code of express and dotenv, copied into the project.',
          correct: false,
          feedback:
            'It holds only names and version ranges. The code arrives when npm install runs.',
        },
        {
          id: 'the-list',
          text: 'What the API needs, by name and version range. npm install downloads them into node_modules.',
          correct: true,
          feedback: 'Yes. The list is committed; the downloaded code is rebuilt from it.',
        },
        {
          id: 'the-laptop',
          text: 'Which programs are installed on this laptop.',
          correct: false,
          feedback:
            'It’s about this one project. Another project on the same laptop has its own list.',
        },
      ],
      explanation:
        'package.json declares what a project needs. dependencies are needed to run it; devDependencies only to build and test it. Anyone who clones the repo runs npm install and gets the same list.',
    },
    {
      id: 'wrong-folder',
      kind: 'prompt',
      situation:
        'Otto opens a fresh terminal and runs npm install. It fails, and he has a plan to fix it.',
      artifact: {
        kind: 'terminal',
        label: 'PS 1',
        text: [
          'PS C:\\Users\\kyle> npm install',
          'npm error code ENOENT',
          'npm error syscall open',
          'npm error path C:\\Users\\kyle\\package.json',
          'npm error errno -4058',
          "npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open 'C:\\Users\\kyle\\package.json'",
          'npm error enoent This is related to npm not being able to find a file.',
          '',
          'otto › No package.json here. I’ll create one with npm init -y and retry.',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'init',
          text: 'Go ahead. npm init -y will fix it.',
          correct: false,
          feedback:
            'That makes a new, empty project in your home folder. The API’s package.json is somewhere else, still not installed.',
        },
        {
          id: 'reinstall-node',
          text: 'npm looks broken. Reinstall Node first.',
          correct: false,
          feedback: 'npm ran fine and told you exactly what it looked for. Nothing is broken.',
        },
        {
          id: 'go-there',
          text: 'Don’t create anything. cd to C:\\Users\\kyle\\quillwork\\api, confirm package.json is there, then run npm install.',
          correct: true,
          feedback:
            'Right. A fresh terminal starts at home, and npm reads the folder it stands in.',
        },
        {
          id: 'global',
          text: 'Add -g so it installs for the whole laptop.',
          correct: false,
          feedback: '-g installs one named tool for your user. It can’t install a project’s list.',
        },
      ],
      explanation:
        'npm install reads package.json in the folder the terminal stands in. ENOENT means “no such file” at that path. The fix is going to the project, not inventing a new one where you happen to be.',
    },
    {
      id: 'not-in-git',
      kind: 'choose',
      situation:
        'The install worked. Otto asks: “node_modules shows 4,812 new files. Shall I commit them, so Priya and Dex don’t have to install?”',
      artifact: {
        kind: 'terminal',
        label: 'PS 1',
        text: [
          'PS C:\\Users\\kyle\\quillwork\\api> git status --short',
          '?? node_modules/',
          'PS C:\\Users\\kyle\\quillwork\\api> (Get-ChildItem node_modules -Recurse -File).Count',
          '4812',
        ].join('\n'),
      },
      question: 'Commit node_modules?',
      options: [
        {
          id: 'ignore-it',
          text: 'No. It’s rebuilt from package.json and the lockfile. Add node_modules/ to .gitignore.',
          correct: true,
          feedback: 'Yes. Commit the list, never the download.',
        },
        {
          id: 'commit-all',
          text: 'Yes. It saves everyone a step.',
          correct: false,
          feedback:
            'It bloats every clone, and some packages build files for your Windows laptop that break on Dex’s Linux CI.',
        },
        {
          id: 'just-express',
          text: 'Commit only express’s folder. It’s the important one.',
          correct: false,
          feedback:
            'express needs dozens of packages of its own. Half a node_modules is worse than none.',
        },
      ],
      explanation:
        'node_modules is generated output, like a build folder: big, machine-specific, and rebuilt in a minute by npm install. What belongs in git is what generates it: package.json and the lockfile.',
    },
    {
      id: 'lockfile',
      kind: 'choose',
      situation:
        'Someone gitignored package-lock.json. On the same commit, Marco’s tests pass and yours fail. You both ran npm install, a week apart.',
      artifact: {
        kind: 'terminal',
        label: 'npm ls express, on both laptops',
        text: [
          'PS C:\\Users\\marco\\quillwork\\api> npm ls express',
          'quillwork-api@1.0.0 C:\\Users\\marco\\quillwork\\api',
          '└── express@4.21.2',
          '',
          'PS C:\\Users\\kyle\\quillwork\\api> npm ls express',
          'quillwork-api@1.0.0 C:\\Users\\kyle\\quillwork\\api',
          '└── express@4.22.0',
        ].join('\n'),
      },
      question: 'Why do you have different versions?',
      options: [
        {
          id: 'broken-npm',
          text: 'Your npm is broken. Reinstall it.',
          correct: false,
          feedback: 'npm did what it was told. The question is what it was told.',
        },
        {
          id: 'self-update',
          text: 'express updates itself inside node_modules.',
          correct: false,
          feedback: 'Packages never update themselves. Only an install changes node_modules.',
        },
        {
          id: 'range',
          text: '^4.21.2 allows any 4.x from 4.21.2 up. Without a committed lockfile, each install takes the newest that day.',
          correct: true,
          feedback: 'Yes. Commit package-lock.json and everyone gets the same versions.',
        },
        {
          id: 'edited',
          text: 'Marco edited package.json.',
          correct: false,
          feedback: 'You’re on the same commit, so package.json is identical on both laptops.',
        },
      ],
      explanation:
        'package.json says which versions are acceptable. package-lock.json records the exact versions installed. Commit it, and npm ci installs exactly what it pins, on every laptop and in CI.',
    },
    {
      id: 'lookalike',
      kind: 'prompt',
      situation:
        'The API should read its settings from .env, so it needs dotenv. Otto has a line ready.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: [
          'otto › I’ll add the .env loader.',
          'otto › npm install dotnev',
          '       Approve? [y/N]',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'approve',
          text: 'Approved. Go.',
          correct: false,
          feedback:
            'Read it again: dotnev, not dotenv. Lookalike names are a classic way to get malware onto a laptop.',
        },
        {
          id: 'exact-name',
          text: 'Deny. Install exactly dotenv, d-o-t-e-n-v. Show me its weekly downloads and repository first, then the package.json diff.',
          correct: true,
          feedback: 'Yes. Spell the name for him, check it’s the real one, then read the result.',
        },
        {
          id: 'both',
          text: 'Install both, to be safe.',
          correct: false,
          feedback:
            'Installing an unknown package runs its code. There’s nothing safe about an extra one.',
        },
        {
          id: 'write-own',
          text: 'Deny, and write our own .env reader instead.',
          correct: false,
          feedback:
            'Rewriting a well-known library adds bugs. Use the real one; just get its name right.',
        },
      ],
      explanation:
        'Agents misspell names and sometimes invent packages that don’t exist, and attackers register those lookalikes. Read every package name letter by letter before an install, the way you’d read a wire transfer.',
    },
    {
      id: 'read-the-listing',
      kind: 'choose',
      situation:
        'For another job, Otto finds a package that “loads .env files fast” and wants to add it. You ask him to show its listing first.',
      artifact: {
        kind: 'terminal',
        label: 'PS 1',
        text: [
          'PS C:\\Users\\kyle\\quillwork\\api> npm view env-dot-loadr',
          '',
          'env-dot-loadr@1.0.1 | MIT | deps: 1 | versions: 2',
          'Loads .env files fast',
          '',
          'dependencies:',
          'tiny-beacon-x: ^0.1.0',
          '',
          'maintainers:',
          '- quickdev42',
          '',
          'published 4 days ago by quickdev42',
          '',
          'PS C:\\Users\\kyle\\quillwork\\api> npm view env-dot-loadr scripts.postinstall',
          'node setup.js',
          'PS C:\\Users\\kyle\\quillwork\\api> npm view env-dot-loadr repository.url',
          'PS C:\\Users\\kyle\\quillwork\\api>',
        ].join('\n'),
      },
      question: 'What should stop you?',
      options: [
        {
          id: 'nothing',
          text: 'Nothing. The description says it does what we need.',
          correct: false,
          feedback: 'Anyone can write any description. Look at who made it and what it runs.',
        },
        {
          id: 'license',
          text: 'The MIT license.',
          correct: false,
          feedback: 'MIT is one of the most common, permissive licenses. That part is fine.',
        },
        {
          id: 'one-dep',
          text: 'It has a dependency.',
          correct: false,
          feedback:
            'Most packages have some. Though a .env loader that needs tiny-beacon-x is odd.',
        },
        {
          id: 'red-flags',
          text: 'Four days old, two versions, no repository, and a postinstall script that runs the moment it installs.',
          correct: true,
          feedback: 'Yes. A brand-new, unknown package that runs code at install time gets a no.',
        },
      ],
      explanation:
        'Installing a package runs its install scripts on your laptop, with your files and keys in reach. Before a new name goes in: who maintains it, how long it’s existed, whether its source is public, and what it runs.',
    },
    {
      id: 'project-not-global',
      kind: 'prompt',
      situation:
        'Sage wants the API to restart itself whenever a file changes, using nodemon. Otto suggests npm install -g nodemon.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'global',
          text: 'Fine. -g is quicker.',
          correct: false,
          feedback:
            'It lands on your laptop only. Dex clones the repo, runs the dev script, and gets “nodemon is not recognized”.',
        },
        {
          id: 'copy',
          text: 'Copy nodemon’s folder into the repo.',
          correct: false,
          feedback:
            'That’s committing node_modules by hand. The list in package.json does this job.',
        },
        {
          id: 'chat',
          text: 'Tell the team in chat to install nodemon themselves.',
          correct: false,
          feedback:
            'Chat gets missed, and the new hire never saw it. package.json is the list everyone reads.',
        },
        {
          id: 'save-dev',
          text: 'In C:\\Users\\kyle\\quillwork\\api, run npm install --save-dev nodemon, add a dev script that uses it, and show me the package.json diff.',
          correct: true,
          feedback: 'Yes. Now everyone who runs npm install gets it, at the same version.',
        },
      ],
      explanation:
        'A tool the project needs belongs in the project’s package.json, as a devDependency if only developers use it. Global installs live on one laptop, which is exactly how “works on my machine” starts.',
    },
    {
      id: 'safe-install',
      kind: 'order',
      situation:
        'Sage asks you to write down how Otto should add any new library to a Quillwork project.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'folder', text: 'Go to the project folder that holds package.json' },
        { id: 'name', text: 'Check the exact name: downloads, repository, maintainers' },
        { id: 'install', text: 'Run npm install with that exact name' },
        { id: 'diff', text: 'Read the package.json and package-lock.json diff' },
        { id: 'commit', text: 'Commit package.json and package-lock.json together' },
      ],
      explanation:
        'Right folder, right name, then the install, then read what changed before it’s committed. The two files go in one commit, so the list and the pinned versions never disagree.',
    },
  ],
} satisfies LessonInput;
