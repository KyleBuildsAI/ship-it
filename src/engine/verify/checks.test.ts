import { describe, expect, it } from 'vitest';
import {
  buildOutputToIgnore,
  conventionalRatio,
  isCleanStatus,
  isConventionalSubject,
  isGeneratedSubject,
  isSecretPath,
  trackedSecretPaths,
} from './checks';
import logDecorate from './fixtures/log-oneline-decorate.txt?raw';
import longAheadClean from './fixtures/status-long-ahead-clean.txt?raw';
import longClean from './fixtures/status-long-clean.txt?raw';
import longDeleted from './fixtures/status-long-deleted.txt?raw';
import longIgnored from './fixtures/status-long-ignored.txt?raw';
import longMergeConflict from './fixtures/status-long-merge-conflict.txt?raw';
import longMixed from './fixtures/status-long-mixed.txt?raw';
import longStagedUnborn from './fixtures/status-long-staged-unborn.txt?raw';
import longSubdir from './fixtures/status-long-subdir.txt?raw';
import sbClean from './fixtures/status-sb-clean.txt?raw';
import sbMixed from './fixtures/status-sb-mixed.txt?raw';
import sbStagedUnborn from './fixtures/status-sb-staged-unborn.txt?raw';
import shortClean from './fixtures/status-short-clean.txt?raw';
import shortDeleted from './fixtures/status-short-deleted.txt?raw';
import shortIgnored from './fixtures/status-short-ignored.txt?raw';
import { parseLogOneline } from './logOneline';
import { parseStatusLong } from './statusLong';
import { parseStatusShort } from './statusShort';

describe('isConventionalSubject', () => {
  it.each([
    'feat: add status parser',
    'fix(parser): handle quoted paths',
    'feat!: drop legacy format',
    'refactor(ui/hud)!: split the panel',
    'docs(changelog): start a changelog',
    'style: format',
    'perf: cache hashes',
    'test: cover detached HEAD',
    'build: bump vite',
    'ci: run gitleaks',
    'chore(deps-dev): update eslint',
    'revert: undo the cache',
  ])('accepts %s', (subject) => {
    expect(isConventionalSubject(subject)).toBe(true);
  });

  it.each([
    'update stuff',
    'Initial commit',
    'Feat: capital type',
    'feature: not a type',
    'feat:no space',
    'feat: ',
    'feat:  two spaces',
    'feat(): empty scope',
    'feat(a(b)): nested scope',
    'feat (scope): space before scope',
    "Merge branch 'feature'",
    '',
  ])('rejects %j', (subject) => {
    expect(isConventionalSubject(subject)).toBe(false);
  });
});

describe('isGeneratedSubject', () => {
  it('recognizes the subjects git and GitHub write themselves', () => {
    expect(isGeneratedSubject("Merge branch 'feature'")).toBe(true);
    expect(isGeneratedSubject("Merge branches 'a' and 'b'")).toBe(true);
    expect(isGeneratedSubject("Merge remote-tracking branch 'origin/main'")).toBe(true);
    expect(isGeneratedSubject('Merge pull request #12 from kyle/feat-x')).toBe(true);
    expect(isGeneratedSubject("Merge tag 'v1.0'")).toBe(true);
    expect(isGeneratedSubject('Revert "feat: add cache"')).toBe(true);
  });

  it('leaves subjects a person wrote alone', () => {
    expect(isGeneratedSubject('merge the two configs')).toBe(false);
    expect(isGeneratedSubject('revert: undo the cache')).toBe(false);
  });
});

describe('conventionalRatio', () => {
  it('scores the real log, not counting the merge git wrote', () => {
    // 8 written commits; "update stuff" and "Initial commit" don't follow the convention.
    expect(conventionalRatio(parseLogOneline(logDecorate))).toBe(6 / 8);
  });

  it('gives 1 when every written commit follows the convention', () => {
    expect(conventionalRatio([{ subject: 'feat: a' }, { subject: "Merge branch 'x'" }])).toBe(1);
  });

  it('gives 0 when there is nothing to judge', () => {
    expect(conventionalRatio([])).toBe(0);
    expect(conventionalRatio([{ subject: "Merge branch 'x'" }])).toBe(0);
  });
});

describe('isCleanStatus', () => {
  it('agrees with git for both formats', () => {
    expect(isCleanStatus(parseStatusLong(longClean))).toBe(true);
    expect(isCleanStatus(parseStatusLong(longAheadClean))).toBe(true);
    expect(isCleanStatus(parseStatusLong(longMixed))).toBe(false);
    expect(isCleanStatus(parseStatusShort(sbClean))).toBe(true);
    expect(isCleanStatus(parseStatusShort(shortClean))).toBe(true);
    expect(isCleanStatus(parseStatusShort(sbMixed))).toBe(false);
  });

  it('ignores ignored files but not the untracked file next to them', () => {
    expect(isCleanStatus(parseStatusShort('!! dist/\n!! .env'))).toBe(true);
    expect(isCleanStatus(parseStatusShort(shortIgnored))).toBe(false);
    expect(isCleanStatus(parseStatusLong(longIgnored))).toBe(false);
  });

  it('never calls a paste with lines it could not read clean', () => {
    expect(isCleanStatus(parseStatusShort('## main\nsomething odd'))).toBe(false);
  });

  it('never calls a tree with a conflict clean', () => {
    expect(isCleanStatus(parseStatusLong(longMergeConflict))).toBe(false);
  });
});

describe('isSecretPath', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.production',
    'server/.env',
    '../.ENV',
    'certs/tls.pem',
    'keys/signing.key',
    'store.p12',
    'store.pfx',
    'release.jks',
    'android.keystore',
    'id_rsa',
    '.ssh/id_ed25519',
    'id_ecdsa',
    'id_dsa',
    'config/secrets.json',
    'secrets.yml',
    'secrets.yaml',
    'credentials.json',
    '.netrc',
    '.pgpass',
  ])('flags %s', (path) => {
    expect(isSecretPath(path)).toBe(true);
  });

  it.each([
    '.env.example',
    '.env.sample',
    '.env.template',
    'id_rsa.pub',
    'src/env.ts',
    'environment.md',
    'keyboard.ts',
    'secrets.md',
    'config/',
    '',
  ])('does not flag %j', (path) => {
    expect(isSecretPath(path)).toBe(false);
  });
});

describe('trackedSecretPaths', () => {
  it('finds a secret that is staged to be committed', () => {
    const staged =
      'On branch main\nChanges to be committed:\n\tnew file:   .env\n\tnew file:   a.ts';
    expect(trackedSecretPaths(parseStatusLong(staged))).toEqual(['.env']);
    expect(trackedSecretPaths(parseStatusShort('A  .env\nA  a.ts'))).toEqual(['.env']);
  });

  it('finds a tracked secret with unstaged edits, listed once even if also staged', () => {
    const both =
      'Changes to be committed:\n\tmodified:   id_rsa\n\nChanges not staged for commit:\n\tmodified:   id_rsa';
    expect(trackedSecretPaths(parseStatusLong(both))).toEqual(['id_rsa']);
    expect(trackedSecretPaths(parseStatusShort('MM id_rsa'))).toEqual(['id_rsa']);
  });

  it('does not flag an untracked secret, or one being removed with rm --cached', () => {
    expect(trackedSecretPaths(parseStatusLong(longDeleted))).toEqual([]);
    expect(trackedSecretPaths(parseStatusShort(shortDeleted))).toEqual([]);
    expect(trackedSecretPaths(parseStatusLong(longStagedUnborn))).toEqual([]);
    expect(trackedSecretPaths(parseStatusShort(sbStagedUnborn))).toEqual([]);
  });

  it('still flags a secret deleted from disk but not from git', () => {
    expect(trackedSecretPaths(parseStatusShort(' D .env'))).toEqual(['.env']);
  });

  it('flags a secret in a merge conflict, even when one side deleted it', () => {
    expect(trackedSecretPaths(parseStatusShort('DU .env\nUU a.ts'))).toEqual(['.env']);
    expect(trackedSecretPaths(parseStatusShort('DD secrets.json'))).toEqual(['secrets.json']);
    expect(trackedSecretPaths(parseStatusLong('Unmerged paths:\n\tboth added:   .env'))).toEqual([
      '.env',
    ]);
  });

  it('checks a plain path list, like the output of git ls-files', () => {
    expect(trackedSecretPaths(['README.md', '.env.example', 'deploy/prod.pem'])).toEqual([
      'deploy/prod.pem',
    ]);
  });
});

describe('buildOutputToIgnore', () => {
  it('suggests ignoring build output git can still see', () => {
    expect(buildOutputToIgnore(parseStatusLong(longMixed))).toEqual(['dist/']);
    expect(buildOutputToIgnore(parseStatusShort(sbMixed))).toEqual(['dist/']);
    expect(buildOutputToIgnore(parseStatusLong(longSubdir))).toEqual(['dist/']);
  });

  it('suggests nothing once .gitignore already hides the build output', () => {
    expect(buildOutputToIgnore(parseStatusShort(shortIgnored))).toEqual([]);
    expect(buildOutputToIgnore(parseStatusLong(longIgnored))).toEqual([]);
  });

  it('finds tracked build files and nested build folders, in a fixed order', () => {
    const status = parseStatusShort(
      ' M coverage/lcov.info\n?? packages/web/node_modules/\nM  build/out.js\n?? DIST/',
    );
    expect(buildOutputToIgnore(status)).toEqual(['dist/', 'build/', 'node_modules/', 'coverage/']);
  });

  it('skips build files already being removed with git rm -r --cached', () => {
    expect(buildOutputToIgnore(parseStatusShort('D  dist/app.js'))).toEqual([]);
  });

  it('does not mistake a file named like a build folder for the folder', () => {
    expect(buildOutputToIgnore(['scripts/build', 'src/dist.ts', 'coverage.md'])).toEqual([]);
    expect(buildOutputToIgnore(['node_modules/react/index.js'])).toEqual(['node_modules/']);
  });
});
