import { describe, expect, it } from 'vitest';
import { folder, repo } from '../git/fixtures';
import { gitQueries } from '../git/queries';
import { testDeps } from '../git/testDeps';
import { Shell, type ShellResult } from './shell';

const ROOT = 'C:\\Users\\kyle\\quillwork\\app';
const text = (result: ShellResult) => result.lines.map((output) => output.text).join('\n');
const shellFor = (builder = folder().write('README.md', '# App\n').write('src/app.ts', 'x\n')) =>
  new Shell(builder.build(testDeps()), ROOT);

describe('Shell navigation', () => {
  it('shows a PowerShell prompt and pwd', () => {
    const shell = shellFor();
    expect(shell.prompt()).toBe(`PS ${ROOT}> `);
    expect(text(shell.run('pwd'))).toBe(ROOT);
  });

  it('moves between folders with cd, and back to the root', () => {
    const shell = shellFor();
    shell.run('cd src');
    expect(shell.cwd).toBe('src');
    expect(shell.prompt()).toBe(`PS ${ROOT}\\src> `);
    shell.run('cd ..');
    expect(shell.cwd).toBe('');
    shell.run('cd src');
    shell.run('cd /');
    expect(shell.cwd).toBe('');
    shell.run('cd src');
    shell.run('cd');
    expect(shell.cwd).toBe('');
    shell.run('cd src');
    shell.run('cd ~');
    expect(shell.cwd).toBe('');
  });

  it('refuses missing folders, files, and climbing out of the project', () => {
    const shell = shellFor();
    expect(text(shell.run('cd nope'))).toBe(
      `cd: Cannot find path '${ROOT}\\nope' because it does not exist.`,
    );
    expect(shell.run('cd README.md').exitCode).toBe(1);
    expect(text(shell.run('cd ..'))).toContain('Cannot go above the project folder');
  });

  it('accepts backslash paths and is case-insensitive about command names', () => {
    const shell = shellFor(folder().write('src/lib/a.ts', 'a\n'));
    shell.run('CD src\\lib');
    expect(shell.cwd).toBe('src/lib');
  });
});

describe('Shell files', () => {
  it('lists a folder with folders first, and the hidden .git only with -Force', () => {
    const shell = shellFor(repo().write('README.md', 'r').write('src/app.ts', 'x'));
    const plain = text(shell.run('ls'));
    expect(plain).toContain(`    Directory: ${ROOT}`);
    expect(plain).toContain('d----  src\n-a---  README.md');
    expect(plain).not.toContain('.git');
    expect(text(shell.run('ls -Force'))).toContain('d--h-  .git');
    expect(text(shell.run('dir src'))).toContain('-a---  app.ts');
    expect(text(shell.run('ls README.md'))).toBe('README.md');
    expect(shell.run('ls nope').exitCode).toBe(1);
  });

  it('says a folder is empty', () => {
    const shell = shellFor(folder());
    shell.run('mkdir docs');
    expect(text(shell.run('ls docs'))).toContain('(empty)');
  });

  it('prints files with cat and explains mistakes', () => {
    const shell = shellFor(
      folder().write('a.txt', 'one\ntwo\n').write('empty.txt', '').write('b.txt', 'b'),
    );
    expect(text(shell.run('cat a.txt'))).toBe('one\ntwo');
    expect(text(shell.run('type a.txt b.txt'))).toBe('one\ntwo\nb');
    expect(text(shell.run('cat empty.txt'))).toBe('');
    shell.run('mkdir dir');
    expect(text(shell.run('cat dir'))).toContain('it is a folder');
    expect(shell.run('cat').exitCode).toBe(1);
    expect(shell.run('cat ghost.txt').exitCode).toBe(1);
  });

  it('writes and appends with echo > and >>', () => {
    const shell = shellFor(folder());
    shell.run('echo "API_KEY=secret" > .env');
    expect(shell.ws.fs.readFile('.env')).toBe('API_KEY=secret\n');
    shell.run('echo dist/ >> .gitignore');
    shell.run('echo .env >> .gitignore');
    expect(shell.ws.fs.readFile('.gitignore')).toBe('dist/\n.env\n');
    shell.run('echo "" > empty.txt');
    expect(shell.ws.fs.readFile('empty.txt')).toBe('\n');
    expect(text(shell.run('echo hello world'))).toBe('hello world');
  });

  it('adds a newline before appending to a file that lacks one', () => {
    const shell = shellFor(folder().write('list.txt', 'a'));
    shell.run('echo b >> list.txt');
    expect(shell.ws.fs.readFile('list.txt')).toBe('a\nb\n');
  });

  it('redirects any command output, and refuses bad redirects', () => {
    const shell = shellFor();
    shell.run('pwd > where.txt');
    expect(shell.ws.fs.readFile('where.txt')).toBe(`${ROOT}\n`);
    expect(shell.run('echo x >').exitCode).toBe(1);
    expect(shell.run('echo x > a b').exitCode).toBe(1);
    expect(shell.run('> x').exitCode).toBe(1);
    expect(text(shell.run('echo x > src'))).toContain('it is a folder');
    expect(text(shell.run('echo x > ../out.txt'))).toContain('outside the project');
    expect(shell.run('cat ghost > copy.txt').exitCode).toBe(1);
    expect(shell.ws.fs.isFile('copy.txt')).toBe(false);
    expect(text(shell.run('echo x > README.md/inner'))).toContain('ENOTDIR');
  });

  it('makes folders and refuses duplicates', () => {
    const shell = shellFor();
    expect(shell.run('mkdir docs notes').exitCode).toBe(0);
    expect(shell.ws.fs.isDir('notes')).toBe(true);
    expect(text(shell.run('mkdir docs'))).toContain('already exists');
    expect(shell.run('mkdir').exitCode).toBe(1);
    expect(shell.run('mkdir ..').exitCode).toBe(1);
  });

  it('deletes files, and folders only with -r', () => {
    const shell = shellFor();
    shell.run('rm README.md');
    expect(shell.ws.fs.isFile('README.md')).toBe(false);
    expect(text(shell.run('rm src'))).toContain('Use: rm -r src');
    shell.run('rm -r src');
    expect(shell.ws.fs.exists('src')).toBe(false);
    shell.run('mkdir empty');
    expect(shell.run('rm empty').exitCode).toBe(0);
    expect(shell.run('rm').exitCode).toBe(1);
    expect(shell.run('rm ghost').exitCode).toBe(1);
    expect(shell.run('rm ..').exitCode).toBe(1);
  });

  it('asks the UI to open a file with code', () => {
    const shell = shellFor();
    shell.run('cd src');
    expect(shell.run('code app.ts').openFile).toBe('src/app.ts');
    expect(shell.run('code new.ts').openFile).toBe('src/new.ts');
    expect(shell.run('code').exitCode).toBe(1);
    shell.run('cd /');
    expect(shell.run('code src').exitCode).toBe(1);
    expect(shell.run('code ..').exitCode).toBe(1);
  });
});

describe('Shell and git', () => {
  it('runs git in the current folder with a Git-for-Windows style root', () => {
    const shell = shellFor();
    expect(text(shell.run('git init'))).toBe(
      'Initialized empty Git repository in C:/Users/kyle/quillwork/app/.git/',
    );
    shell.run('git add .');
    shell.run('git commit -m "feat: first commit"');
    expect(gitQueries(shell.ws).log()).toHaveLength(1);
    shell.run('cd src');
    shell.run('echo more >> app.ts');
    expect(text(shell.run('git status -s'))).toBe(' M app.ts');
  });
});

describe('Shell extras', () => {
  it('keeps a numbered history of non-empty commands', () => {
    const shell = shellFor();
    shell.run('pwd');
    shell.run('   ');
    shell.run('ls');
    expect(shell.history).toEqual(['pwd', 'ls']);
    expect(text(shell.run('history'))).toBe('   1  pwd\n   2  ls\n   3  history');
  });

  it('clears the screen and prints help', () => {
    const shell = shellFor();
    expect(shell.run('clear').clear).toBe(true);
    expect(shell.run('cls').clear).toBe(true);
    expect(text(shell.run('help'))).toContain('git <command>');
    expect(shell.run('').exitCode).toBe(0);
  });

  it('answers unknown commands with PowerShell wording and a pointer', () => {
    const shell = shellFor();
    const touch = shell.run('touch notes.txt');
    expect(touch.exitCode).toBe(1);
    expect(text(touch)).toBe(
      [
        "touch: The term 'touch' is not recognized as a name of a cmdlet, function, script file, or executable program.",
        'Create an empty file with: echo "" > notes.txt',
      ].join('\n'),
    );
    expect(text(shell.run('frobnicate'))).toContain("Type 'help'");
  });

  it('explains an unclosed quote', () => {
    expect(text(shellFor().run('git commit -m "oops'))).toBe(
      'The string is missing closing double quote.\nClose the quote and try again.',
    );
  });
});
