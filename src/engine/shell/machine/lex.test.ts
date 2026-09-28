import { describe, expect, it } from 'vitest';
import { lex, LexError, type LexToken, type WordPart } from './lex';

/** A readable form of each token: words as their text, operators in <angle brackets>. */
function show(input: string): string[] {
  return lex(input).map((token) => {
    switch (token.kind) {
      case 'word':
        return token.parts.map((part) => part.text).join('');
      case 'redirect':
        return `${token.stream === 'error' ? '2' : ''}${token.append ? '>>' : '>'}`;
      default:
        return `<${token.kind}>`;
    }
  });
}

function parts(input: string): readonly WordPart[] {
  const [token] = lex(input);
  if (token?.kind !== 'word') throw new Error(`${input} is not one word`);
  return token.parts;
}

function lexError(input: string): LexError {
  try {
    lex(input);
  } catch (error) {
    if (error instanceof LexError) return error;
    throw error;
  }
  throw new Error(`${input} lexed without an error`);
}

describe('lex: words and quotes', () => {
  it('splits on whitespace and ignores blank lines', () => {
    expect(show('Get-ChildItem   -Force\tC:\\Users')).toEqual([
      'Get-ChildItem',
      '-Force',
      'C:\\Users',
    ]);
    expect(show('   ')).toEqual([]);
  });

  it("keeps 'single quotes' exactly, with '' as one quote", () => {
    expect(show("cd 'C:\\Program Files\\nodejs'")).toEqual(['cd', 'C:\\Program Files\\nodejs']);
    expect(show("echo 'it''s $HOME `n'")).toEqual(['echo', "it's $HOME `n"]);
  });

  it('expands backtick escapes in "double quotes", with "" as one quote', () => {
    expect(show('echo "a`tb`nc"')).toEqual(['echo', 'a\tb\nc']);
    expect(show('echo "say ""hi"" `"now`""')).toEqual(['echo', 'say "hi" "now"']);
    expect(show('echo "cost: `$5 and ``ticks``"')).toEqual(['echo', 'cost: $5 and `ticks`']);
  });

  it('escapes the next character outside quotes too', () => {
    expect(show('echo a` b')).toEqual(['echo', 'a b']);
    expect(show('echo `$HOME')).toEqual(['echo', '$HOME']);
  });

  it('joins quoted pieces onto a word that starts bare', () => {
    expect(show('echo a"b"\'c\'')).toEqual(['echo', 'abc']);
    expect(show("Set-Location -Path:'C:\\Program Files'")).toEqual([
      'Set-Location',
      '-Path:C:\\Program Files',
    ]);
  });

  it('ends a word that starts with a quote where the quote closes', () => {
    expect(show('echo "a"b\'c\'')).toEqual(['echo', 'a', 'bc']);
    expect(show('cd "C:\\Program Files"\\nodejs')).toEqual(['cd', 'C:\\Program Files', '\\nodejs']);
    expect(show('echo "a""b"')).toEqual(['echo', 'a"b']);
  });

  it('reads curly quotes pasted from the web as quotes', () => {
    expect(show('git commit -m \u201Cfirst commit\u201D')).toEqual([
      'git',
      'commit',
      '-m',
      'first commit',
    ]);
    expect(show('echo \u2018it\u2019\u2019s\u2019 \u201Esay \u201C\u201Chi\u201D')).toEqual([
      'echo',
      'it\u2019s',
      'say \u201Chi',
    ]);
  });

  it('keeps an empty quoted string as a word', () => {
    expect(show('echo "" > empty.txt')).toEqual(['echo', '', '>', 'empty.txt']);
    expect(show("echo ''")).toEqual(['echo', '']);
  });

  it('remembers which text was quoted, so the binder can tell -Force from "-Force"', () => {
    expect(parts('-Force')).toEqual([{ kind: 'text', text: '-Force', quoted: false }]);
    expect(parts('"-Force"')).toEqual([{ kind: 'text', text: '-Force', quoted: true }]);
    expect(parts("-Path:'a b'")).toEqual([
      { kind: 'text', text: '-Path:', quoted: false },
      { kind: 'text', text: 'a b', quoted: true },
    ]);
    // A backtick escape counts as quoted, so `-Force is text too.
    expect(parts('`-Force')).toEqual([
      { kind: 'text', text: '-', quoted: true },
      { kind: 'text', text: 'Force', quoted: false },
    ]);
    expect(parts('"a`tb"')).toEqual([{ kind: 'text', text: 'a\tb', quoted: true }]);
  });

  it('starts a comment at # at the start of a token, but not inside a word', () => {
    expect(show('ls # list the folder')).toEqual(['ls']);
    expect(show('echo issue#12')).toEqual(['echo', 'issue#12']);
    expect(show('git commit -m "fix #12"')).toEqual(['git', 'commit', '-m', 'fix #12']);
    expect(show('echo "a"#b')).toEqual(['echo', 'a']);
  });
});

describe('lex: operators', () => {
  it('reads pipes, statement ends, lists, groups and the call operator', () => {
    expect(show('Get-Process node | Stop-Process; cd ~')).toEqual([
      'Get-Process',
      'node',
      '<pipe>',
      'Stop-Process',
      '<end>',
      'cd',
      '~',
    ]);
    expect(show('gcm node,npm')).toEqual(['gcm', 'node', '<comma>', 'npm']);
    expect(show('(Get-Process node).Id')).toEqual([
      '<open>',
      'Get-Process',
      'node',
      '<close>',
      '.Id',
    ]);
    expect(show("& 'C:\\Program Files\\nodejs\\node.exe' -v")).toEqual([
      '<call>',
      'C:\\Program Files\\nodejs\\node.exe',
      '-v',
    ]);
  });

  it('reads > >> 1> 2> and 2>> at the start of a token', () => {
    expect(show('echo hi >>a.txt')).toEqual(['echo', 'hi', '>>', 'a.txt']);
    expect(show('echo "hi">a.txt')).toEqual(['echo', 'hi', '>', 'a.txt']);
    expect(show('echo hi 1>a.txt')).toEqual(['echo', 'hi', '>', 'a.txt']);
    expect(show('where.exe nope 2>$null')).toEqual(['where.exe', 'nope', '2>', '$null']);
    expect(show('npm run dev 2>> errors.log > out.log')).toEqual([
      'npm',
      'run',
      'dev',
      '2>>',
      'errors.log',
      '>',
      'out.log',
    ]);
    expect(show('echo 2 "a > b"')).toEqual(['echo', '2', 'a > b']);
  });

  it('keeps > inside a bare word, as PowerShell does', () => {
    expect(show('echo hi>>a.txt a2>b')).toEqual(['echo', 'hi>>a.txt', 'a2>b']);
  });

  it('marks redirects with their stream', () => {
    const redirects = lex('a > b 2>> c').filter(
      (token): token is Extract<LexToken, { kind: 'redirect' }> => token.kind === 'redirect',
    );
    expect(redirects).toEqual([
      { kind: 'redirect', stream: 'output', append: false },
      { kind: 'redirect', stream: 'error', append: true },
    ]);
  });
});

describe('lex: errors', () => {
  it("reports an unclosed quote in PowerShell's words", () => {
    expect(lexError("echo 'ship it").message).toBe("The string is missing the terminator: '.");
    expect(lexError('git commit -m "oops').message).toBe(
      'The string is missing the terminator: ".',
    );
  });

  it('points script blocks at what to type instead', () => {
    for (const line of ['Get-Process | Where-Object { $_.CPU -gt 1 }', 'git show HEAD@{1}']) {
      const error = lexError(line);
      expect(error.message).toBe("This sandbox doesn't run script blocks.");
      expect(error.hint).toContain("'HEAD@{1}'");
    }
  });

  it('explains a backtick at the very end', () => {
    expect(lexError('echo a `').hint).toContain('one line at a time');
  });

  it('only redirects output and errors', () => {
    expect(lexError('npm run dev *> all.log').message).toBe(
      "This sandbox doesn't redirect stream *.",
    );
    expect(lexError('npm run dev 3> warnings.log').hint).toContain('2>');
  });
});
