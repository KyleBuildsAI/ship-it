import { repo } from '../../engine/git/fixtures';
import type { MissionInput } from '../../game/missions/schema';
import { headIsType } from './shared';

/**
 * Mission 2.4: the blocklist sign. .gitignore patterns, untracking a file git already
 * knows with `git rm --cached`, and keeping secrets out while sharing their names.
 *
 * Every "secret" here is an obvious placeholder. gitleaks scans this repository in CI,
 * and realistic-looking keys would fail the build (and teach the wrong habit).
 */

const ENV = 'API_KEY=dev-only\nDATABASE_URL=postgres://localhost/dev\n';
const PACKAGE = '{\n  "name": "quillwork-notes",\n  "version": "1.0.0"\n}\n';
const README = '# Quillwork Notes\n\nCopy .env.example to .env and fill in your own values.\n';
const APP = "export function start(): void {\n  document.title = 'Quillwork Notes';\n}\n";
const BUNDLE = '(()=>{document.title="Quillwork Notes"})();\n';
const DIST_HTML = '<!doctype html>\n<script src="app.js"></script>\n';
const LOG_LINE = '[12:00:01] server started on port 3000\n';
const LOGGER = 'export function log(message: string): void {\n  console.info(message);\n}\n';

export const ignoreList: MissionInput = {
  id: 'ignore-list',
  act: 2,
  title: 'The Ignore List',
  xp: 140,
  briefing: {
    sceneId: 'ignore-list',
    captions: [
      'Some crates should never reach the Vault: build output, logs, and secrets.',
      'A .gitignore file is the blocklist sign. Ignored crates grey out and cannot be staged.',
      'But the sign only stops new crates. A secret already in the Vault must be untracked first.',
    ],
    diagram: 'blocklist-sign',
  },
  initialRepoState: repo()
    .commit('chore: scaffold notes app', {
      'package.json': PACKAGE,
      'README.md': README,
      'src/app.ts': APP,
      // The mistake this mission cleans up: secrets committed on day one.
      '.env': ENV,
    })
    .untracked('dist/index.html', DIST_HTML)
    .untracked('dist/app.js', BUNDLE)
    .untracked('debug.log', LOG_LINE)
    .untracked('server/logs/error.log', LOG_LINE)
    .toSpec(),
  steps: [
    {
      id: 'ignore-dist',
      instruction:
        'git status is noisy. dist/ is build output, rebuilt from src/ every time. Create a .gitignore that hides the whole dist/ folder.',
      success: {
        kind: 'ignored',
        paths: ['dist/index.html', 'dist/app.js'],
        label: 'Everything in dist/ is ignored',
      },
      hints: [
        'Where does git look for a list of files it should never show or stage?',
        'A .gitignore file in the project root lists patterns, one per line. A trailing slash, as in dist/, matches a whole folder.',
        'Run: echo "dist/" >> .gitignore',
      ],
    },
    {
      id: 'ignore-logs',
      instruction:
        'Log files are noise too. Add one line that ignores every .log file, in any folder.',
      success: {
        kind: 'ignored',
        paths: ['debug.log', 'server/logs/error.log'],
        label: 'Every .log file is ignored',
      },
      hints: [
        'What pattern matches any file name that ends in .log?',
        'A * matches any characters within one name. A pattern with no slash applies in every folder, so one line covers them all.',
        'Run: echo "*.log" >> .gitignore',
      ],
    },
    {
      id: 'untrack-env',
      instruction:
        '.env holds secrets, and someone committed it. Ignoring it now does nothing: git keeps tracking files it already knows. Stop tracking .env, but keep it on your disk.',
      success: {
        kind: 'any',
        label: '.env is off the Loading Dock but still on disk',
        of: [
          { kind: 'untracked', paths: ['.env'] },
          { kind: 'ignored', paths: ['.env'] },
        ],
      },
      hints: [
        'git rm deletes a file. Which flag makes git forget the file but leave it on disk?',
        '--cached means "only the Loading Dock". git rm --cached removes the file from the index, so the next commit stops tracking it.',
        'Run: git rm --cached .env',
      ],
      xp: 20,
    },
    {
      id: 'ignore-env',
      instruction: 'Now add .env to .gitignore, so it can never be staged by accident again.',
      success: { kind: 'ignored', paths: ['.env'] },
      hints: [
        'Which file lists what git should never stage?',
        'Ignore rules only apply to untracked files. Now that .env is untracked, one .gitignore line hides it for good.',
        'Run: echo ".env" >> .gitignore',
      ],
    },
    {
      id: 'env-example',
      instruction:
        'Teammates still need to know which settings exist. Create .env.example listing API_KEY and DATABASE_URL, with no values.',
      success: {
        kind: 'all',
        of: [
          { kind: 'workingFile', path: '.env.example', contains: 'API_KEY' },
          { kind: 'workingFile', path: '.env.example', contains: 'DATABASE_URL' },
          {
            kind: 'not',
            label: 'No real values in .env.example',
            predicate: {
              kind: 'any',
              of: [
                { kind: 'workingFile', path: '.env.example', contains: 'dev-only' },
                { kind: 'workingFile', path: '.env.example', contains: 'localhost' },
              ],
            },
          },
        ],
      },
      hints: [
        'How can a teammate learn the setting names without ever seeing your values?',
        'A committed .env.example lists variable names with empty values. Real values stay in the ignored .env on each machine.',
        'Run: echo "API_KEY=" > .env.example, then echo "DATABASE_URL=" >> .env.example',
      ],
    },
    {
      id: 'commit-cleanup',
      instruction:
        'Commit .gitignore, .env.example, and the removal of .env together, as one chore commit.',
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['.env'] },
          { kind: 'tracked', paths: ['.gitignore', '.env.example'] },
          { kind: 'workingFile', path: '.env', exists: true, label: '.env is still on your disk' },
          { kind: 'clean' },
          headIsType('chore'),
        ],
      },
      hints: [
        'Which three changes are waiting, and how do you stage the two new files?',
        'git status lists .env as deleted: that is the untracking, already staged. Stage .gitignore and .env.example, then commit all three together.',
        'Run: git add .gitignore .env.example, then git commit -m "chore: ignore secrets and build output"',
      ],
    },
  ],
  drills: [
    {
      id: 'ignore-dist-folder',
      prompt:
        'Build output in dist/ keeps showing up in git status. Make git ignore the whole folder.',
      setup: repo()
        .commit('feat: add app', { 'src/app.ts': APP })
        .untracked('dist/app.js', BUNDLE)
        .untracked('dist/index.html', DIST_HTML)
        .toSpec(),
      success: {
        kind: 'ignored',
        paths: ['dist/app.js', 'dist/index.html'],
        label: 'Everything in dist/ is ignored',
      },
      timeLimitSeconds: 45,
      concept: 'gitignore',
    },
    {
      id: 'ignore-logs-anywhere',
      prompt:
        'Ignore every .log file in any folder, with one rule. src/logger.ts is code and must stay visible.',
      setup: repo()
        .commit('feat: add app', { 'src/app.ts': APP })
        .untracked('debug.log', LOG_LINE)
        .untracked('server/logs/today.log', LOG_LINE)
        .untracked('src/logger.ts', LOGGER)
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          {
            kind: 'ignored',
            paths: ['debug.log', 'server/logs/today.log'],
            label: 'Both .log files are ignored',
          },
          { kind: 'untracked', paths: ['src/logger.ts'], label: 'src/logger.ts is still visible' },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'gitignore',
    },
    {
      id: 'ignore-untrack-env',
      prompt:
        '.env was committed by mistake. Stop tracking it in a new commit, but keep the file on disk.',
      setup: repo().commit('chore: scaffold app', { 'src/app.ts': APP, '.env': ENV }).toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['.env'] },
          { kind: 'workingFile', path: '.env', exists: true, label: '.env is still on your disk' },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'rm-cached',
    },
    {
      id: 'ignore-env-rule',
      prompt:
        '.env is untracked. Make sure git can never stage it by accident, and commit that rule.',
      setup: repo().commit('feat: add app', { 'src/app.ts': APP }).untracked('.env', ENV).toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'ignored', paths: ['.env'] },
          {
            kind: 'fileAtHead',
            path: '.gitignore',
            contains: '.env',
            label: 'The committed .gitignore mentions .env',
          },
        ],
      },
      timeLimitSeconds: 60,
      concept: 'gitignore',
    },
    {
      id: 'ignore-tracked-dist',
      prompt:
        'dist/ was committed before anyone ignored it. Untrack the whole folder, keep the files, ignore it, and commit.',
      setup: repo()
        .commit('chore: scaffold app', {
          'src/app.ts': APP,
          'dist/app.js': BUNDLE,
          'dist/index.html': DIST_HTML,
        })
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'notTracked', paths: ['dist/app.js', 'dist/index.html'] },
          {
            kind: 'ignored',
            paths: ['dist/app.js', 'dist/index.html'],
            label: 'Everything in dist/ is ignored',
          },
          { kind: 'clean' },
        ],
      },
      timeLimitSeconds: 120,
      concept: 'rm-cached',
    },
    {
      id: 'ignore-negate',
      prompt: 'Ignore .env and .env.local, but not .env.example: teammates need that one.',
      setup: repo()
        .commit('feat: add app', { 'src/app.ts': APP })
        .untracked('.env', ENV)
        .untracked('.env.local', ENV)
        .untracked('.env.example', 'API_KEY=\nDATABASE_URL=\n')
        .toSpec(),
      success: {
        kind: 'all',
        of: [
          { kind: 'ignored', paths: ['.env', '.env.local'] },
          {
            kind: 'untracked',
            paths: ['.env.example'],
            label: '.env.example is still visible to git',
          },
        ],
      },
      timeLimitSeconds: 90,
      concept: 'gitignore',
    },
  ],
  questionRound: {
    ticket: {
      from: 'Marco',
      title: 'Our API key is on GitHub?',
      body: 'A customer emailed saying they found our API key in our public repo. Can you just delete it? Kind of urgent.',
    },
    candidates: [
      {
        id: 'rotated-yet',
        text: 'Has the key been revoked or rotated yet? Deleting the file does not remove it from git history.',
        quality: 'strong',
        rationale:
          'Anyone may have copied it already, so a new key is the real fix and cleanup comes second.',
      },
      {
        id: 'how-long',
        text: 'How long has the repo been public with the key in it?',
        quality: 'strong',
        rationale: 'Tells you how far back to check the key for misuse.',
      },
      {
        id: 'other-secrets',
        text: 'Could other secrets be committed too, like a .env file or a config with passwords?',
        quality: 'strong',
        rationale:
          'One leaked secret often means more, so check the whole history, not just one file.',
      },
      {
        id: 'key-owner',
        text: 'Who owns the account for that key and can issue a new one?',
        quality: 'okay',
        rationale: 'Needed to act, but first confirm what leaked and whether it is still live.',
      },
      {
        id: 'tell-anyone',
        text: 'Do we need to tell customers or a security contact?',
        quality: 'okay',
        rationale: 'Important soon, but stopping the leak comes first.',
      },
      {
        id: 'just-delete',
        text: 'Can I delete the file and push, so it is gone?',
        quality: 'weak',
        rationale: "The key stays in history and in everyone's clone, so rotate it first.",
      },
      {
        id: 'go-private',
        text: 'Should I make the repo private so nobody can see it?',
        quality: 'weak',
        rationale: 'Too late for anyone who already saw it, and the key must still be replaced.',
      },
      {
        id: 'who-did-it',
        text: 'Who committed the key?',
        quality: 'weak',
        rationale:
          'Blame does not stop the leak; better habits like .gitignore and secret scanning do.',
      },
    ],
    rubric:
      'A strong question makes sure the exposed key is revoked or rotated first, and asks how long it was exposed or whether other secrets leaked with it.',
  },
};
