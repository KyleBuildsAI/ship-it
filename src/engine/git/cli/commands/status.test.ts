import { describe, expect, it } from 'vitest';
import { folder, repo } from '../../fixtures';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const build = (builder: ReturnType<typeof repo>) => builder.build(testDeps());

describe('git status (long format)', () => {
  it('describes a fresh repository with nothing in it', () => {
    expect(gitText(build(repo()), ['status'])).toBe(
      [
        'On branch main',
        '',
        'No commits yet',
        '',
        'nothing to commit (create/copy files and use "git add" to track)',
      ].join('\n'),
    );
  });

  it('shows untracked files before the first commit, collapsing new folders', () => {
    const ws = build(
      repo().untracked('index.html').untracked('src/app.ts').untracked('src/lib/x.ts'),
    );
    expect(gitText(ws, ['status'])).toBe(
      [
        'On branch main',
        '',
        'No commits yet',
        '',
        'Untracked files:',
        '  (use "git add <file>..." to include in what will be committed)',
        '\tindex.html',
        '\tsrc/',
        '',
        'nothing added to commit but untracked files present (use "git add" to track)',
      ].join('\n'),
    );
  });

  it('uses the rm --cached hint for staged files before the first commit', () => {
    const ws = build(repo().untracked('a.ts').stage('a.ts'));
    expect(gitText(ws, ['status'])).toBe(
      [
        'On branch main',
        '',
        'No commits yet',
        '',
        'Changes to be committed:',
        '  (use "git rm --cached <file>..." to unstage)',
        '\tnew file:   a.ts',
        '',
      ].join('\n'),
    );
  });

  it('reports a clean tree in one line', () => {
    const ws = build(repo().commit('init', { 'a.ts': 'a' }));
    expect(gitText(ws, ['status'])).toBe('On branch main\nnothing to commit, working tree clean');
  });

  it('shows all three sections with the right hints', () => {
    const ws = build(
      repo()
        .commit('init', { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c', 'old.ts': 'same' })
        .modify('a.ts', 'A')
        .stage('a.ts')
        .write('moved.ts', 'same')
        .delete('old.ts')
        .stage('old.ts', 'moved.ts')
        .modify('b.ts', 'B')
        .delete('c.ts')
        .untracked('.env', 'KEY=1'),
    );
    expect(gitText(ws, ['status'])).toBe(
      [
        'On branch main',
        'Changes to be committed:',
        '  (use "git restore --staged <file>..." to unstage)',
        '\tmodified:   a.ts',
        '\trenamed:    old.ts -> moved.ts',
        '',
        'Changes not staged for commit:',
        '  (use "git add/rm <file>..." to update what will be committed)',
        '  (use "git restore <file>..." to discard changes in working directory)',
        '\tmodified:   b.ts',
        '\tdeleted:    c.ts',
        '',
        'Untracked files:',
        '  (use "git add <file>..." to include in what will be committed)',
        '\t.env',
        '',
      ].join('\n'),
    );
  });

  it('ends unstaged-only output with the "no changes added" summary', () => {
    const ws = build(repo().commit('init', { 'a.ts': 'a' }).modify('a.ts', 'A'));
    const text = gitText(ws, ['status']);
    expect(text).toContain('  (use "git add <file>..." to update what will be committed)');
    expect(
      text.endsWith('\n\nno changes added to commit (use "git add" and/or "git commit -a")'),
    ).toBe(true);
  });

  it('keeps folders expanded when git already tracks something inside', () => {
    const ws = build(repo().commit('init', { 'src/app.ts': 'a' }).untracked('src/new.ts'));
    expect(gitText(ws, ['status'])).toContain('\tsrc/new.ts');
  });

  it('prints paths relative to the current folder', () => {
    const ws = build(
      repo()
        .commit('init', { 'README.md': 'r', 'src/app.ts': 'a' })
        .modify('README.md', 'R')
        .modify('src/app.ts', 'A'),
    );
    const text = gitText(ws, ['status'], 'src');
    expect(text).toContain('\tmodified:   ../README.md');
    expect(text).toContain('\tmodified:   app.ts');
  });

  it('warns about a detached HEAD', () => {
    const ws = build(repo().commit('one', { 'a.ts': '1' }).commit('two', { 'a.ts': '2' }));
    const repository = ws.requireRepo();
    const first = repository.resolve('HEAD~1');
    repository.detachHead(first, 'checkout: moving from main to HEAD~1');
    repository.replaceIndex(repository.getCommit(first)?.files ?? new Map());
    ws.writeFile('a.ts', '1');
    const result = git(ws, ['status']);
    expect(result.lines[0]).toEqual({
      text: `HEAD detached at ${first.slice(0, 7)}`,
      tone: 'error',
    });
  });

  it('rejects unknown options', () => {
    expect(git(build(repo()), ['status', '--frob']).exitCode).toBe(128);
  });
});

describe('git status --short', () => {
  it('prints two status columns, a branch header with -b, and ?? for untracked', () => {
    const ws = build(
      repo()
        .commit('init', { 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c', 'old.ts': 'same' })
        .modify('a.ts', 'A')
        .stage('a.ts')
        .modify('a.ts', 'AA')
        .modify('b.ts', 'B')
        .write('moved.ts', 'same')
        .delete('old.ts')
        .stage('old.ts', 'moved.ts')
        .untracked('notes/todo.md'),
    );
    expect(gitText(ws, ['status', '-sb'])).toBe(
      ['## main', 'MM a.ts', ' M b.ts', 'R  old.ts -> moved.ts', '?? notes/'].join('\n'),
    );
    expect(gitText(ws, ['status', '--porcelain'])).not.toContain('## main');
  });

  it('labels the branch header before the first commit', () => {
    expect(gitText(build(repo().untracked('a.ts')), ['status', '-s', '-b'])).toBe(
      '## No commits yet on main\n?? a.ts',
    );
  });

  it('marks staged additions and deletions', () => {
    const ws = build(
      repo()
        .commit('init', { 'gone.ts': 'g' })
        .delete('gone.ts')
        .stage('gone.ts')
        .untracked('new.ts')
        .stage('new.ts'),
    );
    expect(gitText(ws, ['status', '-s'])).toBe('D  gone.ts\nA  new.ts');
  });

  it('shows ./ when standing inside a brand-new folder', () => {
    const ws = folder()
      .init()
      .write('README.md', 'r')
      .stage('README.md')
      .untracked('drafts/a.md')
      .build(testDeps());
    expect(gitText(ws, ['status', '-s'], 'drafts')).toBe('A  ../README.md\n?? ./');
  });
});
