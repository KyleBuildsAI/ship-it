import { describe, expect, it } from 'vitest';
import { normalizePaste, promptCommand, stripAnsi } from './normalize';

const ESC = '\u001b';

describe('stripAnsi', () => {
  it('removes the color codes git prints around words', () => {
    expect(stripAnsi(`${ESC}[32mmain${ESC}[m...${ESC}[1;31morigin/main${ESC}[m`)).toBe(
      'main...origin/main',
    );
  });

  it('removes window-title and link sequences some prompts emit', () => {
    expect(stripAnsi(`${ESC}]0;repo\u0007On branch main`)).toBe('On branch main');
    expect(stripAnsi(`${ESC}]8;;https://x${ESC}\\link${ESC}]8;;${ESC}\\`)).toBe('link');
  });

  it('leaves plain text alone', () => {
    expect(stripAnsi('nothing to commit, working tree clean')).toBe(
      'nothing to commit, working tree clean',
    );
  });
});

describe('promptCommand', () => {
  it('reads the command after a PowerShell prompt', () => {
    expect(promptCommand('PS C:\\Users\\kyle\\repo> git status -sb')).toBe('git status -sb');
    expect(promptCommand('PS> git log --oneline')).toBe('git log --oneline');
  });

  it('reads the prompt PowerShell shows on a network share, emoji and all', () => {
    const prompt = 'PS Microsoft.PowerShell.Core\\FileSystem::\\\\nas\\code\\SandCastles 🏰>';
    expect(promptCommand(`${prompt} git status`)).toBe('git status');
  });

  it('reads cmd.exe and Unix-style prompts', () => {
    expect(promptCommand('C:\\repo>git status')).toBe('git status');
    expect(promptCommand('$ git status --short')).toBe('git status --short');
  });

  it('returns an empty command for a bare prompt and null for ordinary lines', () => {
    expect(promptCommand('PS C:\\repo>')).toBe('');
    expect(promptCommand('On branch main')).toBeNull();
    expect(promptCommand(' M src/app.ts')).toBeNull();
  });
});

describe('normalizePaste', () => {
  it('splits Windows, Unix, and old Mac line endings the same way', () => {
    expect(normalizePaste('a\r\nb\nc\rd').lines).toEqual(['a', 'b', 'c', 'd']);
  });

  it('trims trailing whitespace but keeps the leading space short status depends on', () => {
    expect(normalizePaste(' M app.ts   \n?? notes.txt\t').lines).toEqual([
      ' M app.ts',
      '?? notes.txt',
    ]);
  });

  it('strips a leading PowerShell prompt and remembers the command', () => {
    const paste = normalizePaste('PS C:\\repo> git status\r\nOn branch main\r\n');
    expect(paste.command).toBe('git status');
    expect(paste.lines).toEqual(['On branch main']);
  });

  it('strips the next prompt, the pager marker, and blank lines at the end', () => {
    const paste = normalizePaste('\n\nabc1234 feat: x\n(END)\n\nPS C:\\repo> \n');
    expect(paste.lines).toEqual(['abc1234 feat: x']);
    expect(paste.command).toBeNull();
  });

  it('strips a typed command copied without its prompt', () => {
    expect(normalizePaste('git status -s\r\n M app.ts\r\n')).toEqual({
      lines: [' M app.ts'],
      command: 'git status -s',
    });
  });

  it('strips several prompts at the start, keeping the last command typed', () => {
    expect(
      normalizePaste('PS C:\\repo>\r\nPS C:\\repo> git log --oneline\r\nabc1234 feat: x'),
    ).toEqual({ lines: ['abc1234 feat: x'], command: 'git log --oneline' });
  });

  it('treats a pager marker with nothing above it as no output', () => {
    expect(normalizePaste('PS C:\\repo> git log --oneline\n(END)')).toEqual({
      lines: [],
      command: 'git log --oneline',
    });
  });

  it('drops a bare leading prompt without inventing a command', () => {
    expect(normalizePaste('PS C:\\repo>\n\nOn branch main')).toEqual({
      lines: ['On branch main'],
      command: null,
    });
  });

  it('keeps blank lines inside the output, where git uses them to separate sections', () => {
    expect(normalizePaste('On branch main\n\nUntracked files:').lines).toEqual([
      'On branch main',
      '',
      'Untracked files:',
    ]);
  });

  it('removes color codes and non-breaking spaces', () => {
    expect(normalizePaste(`${ESC}[31m??${ESC}[m\u00a0notes.txt`).lines).toEqual(['?? notes.txt']);
  });

  it('turns an empty or whitespace-only paste into no lines', () => {
    expect(normalizePaste('')).toEqual({ lines: [], command: null });
    expect(normalizePaste('  \r\n\t\n')).toEqual({ lines: [], command: null });
  });

  it('keeps the command when the output itself is empty, as with a clean `git status -s`', () => {
    expect(normalizePaste('PS C:\\repo> git status -s\r\nPS C:\\repo> ')).toEqual({
      lines: [],
      command: 'git status -s',
    });
  });
});
