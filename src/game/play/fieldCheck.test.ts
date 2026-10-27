import { describe, expect, it } from 'vitest';
import { cleanTheDirtyTree } from '../../content/act2/fieldMission';
import { verifyPaste, type Verification } from './fieldCheck';

function verification(overrides: Partial<Verification>): Verification {
  return {
    id: 'check',
    instruction: 'Run it and paste the output.',
    command: 'git status',
    parser: 'status-long',
    check: { kind: 'clean' },
    ...overrides,
  };
}

const CLEAN_LONG = [
  'PS C:\\repos\\sandcastles> git status',
  'On branch main',
  "Your branch is up to date with 'origin/main'.",
  '',
  'nothing to commit, working tree clean',
].join('\r\n');

const DIRTY_SHORT = [
  'PS C:\\repos\\sandcastles> git status --short',
  ' M src/app.ts',
  '?? dist/',
  '?? .env',
].join('\n');

const LOG = [
  'a1b2c3d (HEAD -> main) feat: add tide charts',
  'b2c3d4e fix: stop double deploys',
  'c3d4e5f docs: explain setup',
  'd4e5f60 wip',
].join('\n');

const MERGE_GRAPH = [
  'PS C:\\repos\\sandcastles> git log --oneline --graph -5',
  "*   4d7e1a0 (HEAD -> main, origin/main) Merge branch 'feat/tide-chart'",
  '|\\  ',
  '| * 9c2f6b1 feat: add tide charts',
  '|/  ',
  '* 1a2b3c4 chore: start',
].join('\r\n');

describe('verifyPaste: mergeCommit', () => {
  const check = verification({
    parser: 'log-oneline',
    command: 'git log --oneline --graph -5',
    check: { kind: 'mergeCommit' },
  });

  it('passes a merge of a typed branch whose commit is Conventional', () => {
    expect(verifyPaste(check, MERGE_GRAPH)).toEqual({
      passed: true,
      message: 'Main has a merge commit from feat/tide-chart.',
    });
  });

  it('explains a squash, a missing graph, and an untyped branch', () => {
    expect(verifyPaste(check, '* 4d7e1a0 feat: add tide charts (#3)').message).toContain(
      'Create a merge commit',
    );
    expect(verifyPaste(check, "4d7e1a0 Merge branch 'feat/tide-chart'").message).toContain(
      '--graph',
    );
    expect(verifyPaste(check, MERGE_GRAPH.replace('feat/tide-chart', 'tides')).message).toContain(
      'feat/readme-fix',
    );
    expect(verifyPaste(check, MERGE_GRAPH.replace('feat: add', 'added')).message).toContain(
      'Conventional',
    );
    const unnamed = MERGE_GRAPH.replace("Merge branch 'feat/tide-chart'", "Merge commit 'abc1234'");
    expect(verifyPaste(check, unnamed).message).toContain('name its branch');
    expect(verifyPaste(check, "*   4d7e1a0 Merge branch 'feat/x'").message).toContain('no commit');
    expect(verifyPaste(check, CLEAN_LONG).passed).toBe(false);
  });
});

describe('verifyPaste: clean on a branch, up to date', () => {
  const check = verification({ check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' } });

  it('passes main when it is clean and matches its remote', () => {
    expect(verifyPaste(check, CLEAN_LONG)).toEqual({
      passed: true,
      message: 'Clean, and in step with GitHub.',
    });
  });

  it('fails another branch, unpushed work, or a paste without the branch', () => {
    const onBranch = CLEAN_LONG.replace('On branch main', 'On branch feat/x');
    expect(verifyPaste(check, onBranch).message).toContain('git switch main');
    const ahead = CLEAN_LONG.replace(
      "Your branch is up to date with 'origin/main'.",
      "Your branch is ahead of 'origin/main' by 2 commits.",
    );
    expect(verifyPaste(check, ahead).message).toContain('GitHub doesn’t');
    const noUpstream = CLEAN_LONG.replace("Your branch is up to date with 'origin/main'.", '');
    expect(verifyPaste(check, noUpstream).passed).toBe(false);
    const short = verification({
      parser: 'status-short',
      command: 'git status -sb',
      check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' },
    });
    expect(verifyPaste(short, '## main...origin/main').passed).toBe(true);
    expect(verifyPaste(short, '## main...origin/main [ahead 1]').passed).toBe(false);
    expect(verifyPaste(short, 'git status -s').message).toContain('show the branch');
  });
});

describe('verifyPaste', () => {
  it('counts commits with the right plural', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1',
      check: { kind: 'minCommits', count: 2 },
    });
    expect(verifyPaste(check, 'a1b2c3d feat: one').message).toBe('Only 1 commit; this needs 2.');
    expect(verifyPaste(check, LOG).message).toBe('4 commits. Nice.');
  });

  it('passes a clean status and explains a dirty one', () => {
    expect(verifyPaste(verification({}), CLEAN_LONG)).toMatchObject({ passed: true });
    const dirty = verifyPaste(
      verification({ parser: 'status-short', command: 'git status --short' }),
      DIRTY_SHORT,
    );
    expect(dirty.passed).toBe(false);
    expect(dirty.message).toContain('Not clean');
  });

  it('asks for the right command when the paste is something else', () => {
    expect(verifyPaste(verification({}), LOG).message).toContain('git status');
    expect(verifyPaste(verification({}), '').message).toContain('Paste the output');
  });

  it('measures Conventional Commits in the newest commits', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -10',
      check: { kind: 'conventionalRatio', min: 0.75, last: 10 },
    });
    expect(verifyPaste(check, LOG)).toMatchObject({ passed: true });
    const strict = { ...check, check: { kind: 'conventionalRatio', min: 0.9, last: 10 } } as const;
    expect(verifyPaste(strict, LOG).message).toContain('75%');
    expect(verifyPaste(check, CLEAN_LONG).passed).toBe(false);
  });

  it('counts commits', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline',
      check: { kind: 'minCommits', count: 5 },
    });
    expect(verifyPaste(check, LOG).message).toContain('Only 4');
  });

  it('finds tracked secrets in a git ls-files paste', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'noTrackedSecrets' },
    });
    expect(verifyPaste(check, 'src/app.ts\n.env.example\n').passed).toBe(true);
    const leaked = verifyPaste(check, 'src/app.ts\n.env\n');
    expect(leaked.passed).toBe(false);
    expect(leaked.message).toContain('.env');
  });

  it('refuses a summary or another command’s output in place of a git ls-files list', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'noTrackedSecrets' },
    });
    for (const summary of ['all clean', 'hello', 'No .env here', '## main...origin/main']) {
      const verdict = verifyPaste(check, summary);
      expect(verdict.passed, summary).toBe(false);
      expect(verdict.message, summary).toContain("doesn't look like git ls-files output");
      expect(verdict.message, summary).toContain('Run git ls-files');
    }
    // Real names with spaces still pass, printed bare or quoted by git.
    const real = ['docs/Meeting notes.md', '"caf\\303\\251 menu.md"', 'src/app.ts'];
    expect(verifyPaste(check, real.join('\n'))).toEqual({
      passed: true,
      message: 'No secret files are tracked.',
    });
    expect(verifyPaste(check, [...real, '.env'].join('\n')).message).toContain(
      'Still tracked: .env',
    );
  });

  it('passes a tracked path only when it is on the list, and never beside a secret', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'tracksPath', patterns: ['.github/workflows/gitleaks.yml', 'docs/'] },
    });
    expect(verifyPaste(check, 'README.md\n').passed).toBe(false);
    expect(verifyPaste(check, 'docs/setup.md\n').passed).toBe(true);
    expect(verifyPaste(check, '.github/workflows/gitleaks.yml\n').message).toContain('Git tracks');
    expect(verifyPaste(check, '.github/workflows/gitleaks.yml\n.env\n').message).toContain('.env');
  });

  it('reads a gh run list paste for the newest run', () => {
    const check = verification({
      parser: 'gh-run-list',
      command: 'gh run list --limit 1',
      check: { kind: 'latestRunGreen' },
    });
    const table = 'STATUS  TITLE\n✓       ci: scan  Secret scan  main  push  1  9s  now';
    expect(verifyPaste(check, table).passed).toBe(true);
    const cancelled = '[{"status":"completed","conclusion":"cancelled"}]';
    expect(verifyPaste(check, cancelled).message).toContain('(cancelled)');
    expect(verifyPaste(check, '[{"status":"completed"}]').message).toContain('(no result)');
  });

  it('holds a typed Conventional check to that type', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1',
      check: { kind: 'conventionalRatio', min: 1, last: 1, types: ['ci', 'build'] },
    });
    expect(verifyPaste(check, 'a1b2c3d build: pin node\n').passed).toBe(true);
    expect(verifyPaste(check, 'a1b2c3d feat: add tide charts\n').message).toContain(
      'ci: or build:',
    );
  });

  it('finds a tracked file by pattern in a git ls-files paste', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'tracksPath', patterns: ['docs/specs/*.md'] },
    });
    const found = verifyPaste(check, 'README.md\ndocs/specs/tide-alerts.md\n');
    expect(found).toEqual({ passed: true, message: 'Git tracks docs/specs/tide-alerts.md.' });
    const missing = verifyPaste(check, 'README.md\ndocs/notes.md\n');
    expect(missing.passed).toBe(false);
    expect(missing.message).toContain('docs/specs/*.md');
    expect(verifyPaste(check, '\n\n').message).toContain('Paste the output');
  });

  it('tells a PR merge from a commit pushed straight to main', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline --first-parent -1',
      check: { kind: 'viaPullRequest' },
    });
    expect(verifyPaste(check, 'a1b2c3d feat: add tide alerts (#14)').passed).toBe(true);
    expect(verifyPaste(check, 'a1b2c3d Merge pull request #14 from kyle/tide').passed).toBe(true);
    const direct = verifyPaste(check, 'a1b2c3d feat: add tide alerts');
    expect(direct.passed).toBe(false);
    expect(direct.message).toContain('PR');
  });

  it('uses a mission’s own words for an empty paste and for advice, when it has them', () => {
    const empty = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -- docs/specs',
      check: { kind: 'minCommits', count: 1 },
      whenEmpty: 'It printed nothing: no spec is on main yet.',
    });
    expect(verifyPaste(empty, '  \n').message).toBe('It printed nothing: no spec is on main yet.');
    const secrets = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'noTrackedSecrets' },
      advice: 'Roll that key first.',
    });
    expect(verifyPaste(secrets, '.env\n').message).toBe(
      'Still tracked: .env. Roll that key first.',
    );
    const status = { ...secrets, parser: 'status-short', command: 'git status --short' } as const;
    expect(verifyPaste(status, 'A  .env\n').message).toContain('Roll that key first.');
    const titles = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
      advice: 'Fix it in your next PR title.',
    });
    expect(verifyPaste(titles, 'a1b2c3d Add tide alerts (#14)').message).toContain(
      'Fix it in your next PR title.',
    );
  });

  it('checks that build output and secrets are ignored', () => {
    const check = verification({
      parser: 'status-short',
      command: 'git status --short',
      check: { kind: 'ignores', patterns: ['.env', 'dist/'] },
    });
    const result = verifyPaste(check, DIRTY_SHORT);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('dist/');
    expect(result.message).toContain('.env');
    expect(verifyPaste(check, ' M src/app.ts\n').passed).toBe(true);
    // With --ignored, git lists ignored files behind !!, which is a pass.
    expect(verifyPaste(check, '!! .env\n!! dist/\n').passed).toBe(true);
    expect(verifyPaste(check, '').message).toContain('Copy the line');
  });

  it('tells pushed from merely clean', () => {
    const check = verification({ check: { kind: 'clean', upstream: 'up-to-date' } });
    expect(verifyPaste(check, CLEAN_LONG)).toMatchObject({ passed: true });
    const ahead = CLEAN_LONG.replace(
      "Your branch is up to date with 'origin/main'.",
      'Your branch is ahead of \'origin/main\' by 1 commit.\r\n  (use "git push" to publish your local commits)',
    );
    expect(verifyPaste(check, ahead).message).toContain('GitHub doesn’t');
    const dirty = verifyPaste(
      verification({
        parser: 'status-short',
        command: 'git status -sb',
        check: { kind: 'clean', upstream: 'up-to-date' },
      }),
      '## main...origin/main\n M src/app.ts\n',
    );
    expect(dirty.message).toContain('Not clean');
  });

  it('checks the newest commit has the right Conventional type', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1 origin/main -- README.md',
      check: { kind: 'newestCommitType', type: 'docs' },
    });
    expect(verifyPaste(check, 'a1b2c3d docs: document GET /health (#4)\n').passed).toBe(true);
    expect(verifyPaste(check, LOG).message).toContain('feat: add tide charts');
  });

  it('finds a documented request and its status code in a Select-String paste', () => {
    const check = verification({
      parser: 'select-string',
      command: "Select-String -Path README.md -Pattern 'GET /|[1-5][0-9][0-9]'",
      check: { kind: 'documentsRequest', file: 'README.md' },
    });
    const both = 'README.md:14:GET /health\nREADME.md:16:Returns 200 OK.\n';
    expect(verifyPaste(check, both)).toEqual({
      passed: true,
      message: 'README.md documents GET /health and its 200.',
    });
    expect(verifyPaste(check, 'README.md:14:GET /health\n').message).toContain('status code');
    expect(verifyPaste(check, 'README.md:16:Returns 200 OK.\n').message).toContain('GET /health');
    expect(verifyPaste(check, 'notes.md:1:GET /health 200\n').message).toContain('No lines');
    expect(verifyPaste(check, CLEAN_LONG).message).toContain('ask your agent');
  });

  it("fails the Act 2 Field Mission's ignore check while .env is still visible", () => {
    const check = cleanTheDirtyTree?.verifications.find(
      (entry) => entry.id === 'build-output-ignored',
    );
    if (check === undefined) throw new Error('the Act 2 Field Mission checks ignored files');
    const visible = verifyPaste(check, '?? .env\n!! dist/\n!! node_modules/\n');
    expect(visible.passed).toBe(false);
    expect(visible.message).toContain('.env');
    const ignored = verifyPaste(check, '!! .env\n!! dist/\n!! node_modules/\n');
    expect(ignored).toEqual({ passed: true, message: 'Git ignores .env, dist/, node_modules/.' });
  });

  it('refuses a paste that looks like it holds a secret, before any parser reads it', () => {
    // Built from parts so no whole token-shaped string sits in the repo.
    const fakeToken = 'ghp_' + 'a'.repeat(36);
    const leaked = `${CLEAN_LONG}\nGITHUB_TOKEN=${fakeToken}`;
    const verdict = verifyPaste(verification({}), leaked);
    expect(verdict).toMatchObject({ passed: false, clearPaste: true });
    expect(verdict.message).toContain('rotate it');
    expect(verdict.message).not.toContain('aaaa');
    // An ordinary paste is never marked for clearing.
    expect(verifyPaste(verification({}), CLEAN_LONG).clearPaste).toBeUndefined();
  });

  it('checks a tracked file is on a git ls-files list', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'tracksAny', paths: ['CLAUDE.md', 'AGENTS.md'] },
    });
    expect(verifyPaste(check, 'agents.md\nsrc/app.ts\n')).toEqual({
      passed: true,
      message: 'Git tracks AGENTS.md.',
    });
    expect(verifyPaste(check, 'src/app.ts\n').passed).toBe(false);
    expect(verifyPaste(check, 'warning: not a list\n').passed).toBe(false);
  });

  it('checks the newest written commit has the asked-for type, past a pulled merge', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -3',
      check: { kind: 'newestCommitType', type: 'docs' },
    });
    const merged = [
      'f00ba12 (HEAD -> main, origin/main) Merge pull request #3 from kyle/brief',
      'a1b2c3d docs: add environment setup for agents',
    ].join('\n');
    expect(verifyPaste(check, merged).passed).toBe(true);
    const verdict = verifyPaste(check, LOG);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('docs:');
  });

  it('with pushed, needs the branch level with its remote branch', () => {
    const check = verification({ check: { kind: 'clean', pushed: true } });
    expect(verifyPaste(check, CLEAN_LONG)).toEqual({
      passed: true,
      message: 'Committed and pushed: GitHub has it.',
    });
    const ahead = CLEAN_LONG.replace(
      "Your branch is up to date with 'origin/main'.",
      "Your branch is ahead of 'origin/main' by 2 commits.",
    );
    expect(verifyPaste(check, ahead).message).toContain('2 commits still only on this computer');
    const local = 'On branch main\nnothing to commit, working tree clean';
    expect(verifyPaste(check, local).message).toContain('can’t show the push');
    const dirty = verifyPaste(check, '## main...origin/main\n?? CLAUDE.md');
    expect(dirty.message).toContain('Not clean');
  });
});

describe('a clean check that also asks for the branch and upstream', () => {
  const inSync = verification({ check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' } });

  function status(...lines: string[]): string {
    return [...lines, '', 'nothing to commit, working tree clean'].join('\n');
  }

  it('passes main in step with origin/main, from either format', () => {
    expect(verifyPaste(inSync, CLEAN_LONG)).toEqual({
      passed: true,
      message: 'Clean, and in step with GitHub.',
    });
    const short = verification({
      parser: 'status-short',
      command: 'git status -sb',
      check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' },
    });
    expect(verifyPaste(short, '## main...origin/main\n').passed).toBe(true);
  });

  it('says what to do about each way main can be out of step', () => {
    const ahead = status('On branch main', "Your branch is ahead of 'origin/main' by 1 commit.");
    expect(verifyPaste(inSync, ahead).message).toContain('move them onto a branch');
    const diverged = status(
      'On branch main',
      "Your branch and 'origin/main' have diverged,",
      'and have 1 and 1 different commits each, respectively.',
    );
    expect(verifyPaste(inSync, diverged).message).toContain('without force');
    const gone = status(
      'On branch main',
      "Your branch is based on 'origin/main', but the upstream is gone.",
    );
    expect(verifyPaste(inSync, gone).message).toContain('git fetch');
  });

  it('fails a detached HEAD, naming where to go', () => {
    const detached = 'HEAD detached at 340bbf0\nnothing to commit, working tree clean\n';
    expect(verifyPaste(inSync, detached).message).toContain('not on a branch');
  });
});

describe('the squash-merge and history checks', () => {
  const squash = verification({
    command: 'git log --oneline -1',
    parser: 'log-oneline',
    check: { kind: 'squashMergedPr' },
  });
  const history = verification({
    command: 'git log --all --oneline -- .env',
    parser: 'log-oneline',
    check: { kind: 'noCommits', path: '.env' },
  });

  it('names a plain merge commit as the reason a squash check failed', () => {
    const merged = verifyPaste(squash, 'b2c3d4e Merge pull request #12 from kyle/fix');
    expect(merged.message).toContain('Squash and merge');
    expect(verifyPaste(squash, 'a1b2c3d fix: round tides (#12)').message).toBe(
      'Squash-merged: “fix: round tides (#12)”.',
    );
  });

  it('reads a history search, whatever it prints', () => {
    expect(
      verifyPaste(history, 'PS> git log --all --oneline -- .env\nfatal: oops').message,
    ).toContain('doesn’t look like git log');
    expect(verifyPaste(history, 'a1b2c3d chore: add .env').message).toMatch(/^A commit touched/);
    expect(verifyPaste(history, 'git status').message).toContain('copy the line');
  });
});

describe('verifyPaste: scoped clean, tracked files and headings', () => {
  it('scopes a clean check to named files, in either status format', () => {
    const check = verification({
      parser: 'status-long',
      command: 'git status',
      check: { kind: 'clean', paths: ['docs/story.md'] },
    });
    const otherWork = [
      'On branch main',
      'Changes not staged for commit:',
      '\tmodified:   src/app.ts',
      '',
      'Untracked files:',
      '\tnotes.txt',
    ].join('\n');
    expect(verifyPaste(check, otherWork).passed).toBe(true);
    const storyLeft = [
      'On branch main',
      'Changes to be committed:',
      '\trenamed:    docs/draft.md -> docs/story.md',
    ].join('\n');
    const verdict = verifyPaste(check, storyLeft);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('docs/story.md');
  });

  it('matches a tracked file however its slashes are written', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'tracked', paths: ['docs\\story.md'] },
    });
    expect(verifyPaste(check, 'docs/story.md\nREADME.md').passed).toBe(true);
  });

  it('gives an empty log without a file the plain paste-it message', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -3',
      check: { kind: 'minCommits', count: 3 },
    });
    expect(verifyPaste(check, '').message).toBe('Paste the output of git log --oneline -3 first.');
    // Only the copied prompt, and no output: still nothing to check.
    expect(verifyPaste(check, 'PS C:\\repo> git log --oneline -3').message).toContain('Paste');
  });

  it('names the file after --, not the branch before it, when a scoped log prints nothing', () => {
    const remote = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1 origin/main -- .github/workflows/gitleaks.yml',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
    });
    const verdict = verifyPaste(remote, '');
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toBe(
      'No line means origin/main has no commit that touched .github/workflows/gitleaks.yml yet. Merge it through a pull request, run git fetch, then run this again.',
    );
    const local = { ...remote, command: 'git log --oneline -1 -- docs/story.md' };
    expect(verifyPaste(local, '').message).toBe(
      'No line means no commit has touched docs/story.md yet. Ask your agent to commit it, then run it again.',
    );
  });

  it('refuses a Select-String paste checked against the wrong kind of check', () => {
    const check = verification({
      parser: 'select-string',
      command: "Select-String -Path docs/story.md -Pattern '^## '",
      check: { kind: 'clean' },
    });
    expect(verifyPaste(check, '## Situation').passed).toBe(false);
  });
});
