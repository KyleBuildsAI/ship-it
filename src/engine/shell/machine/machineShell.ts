import { line, type OutputLine } from '../../git/cli/output';
import type { Machine, Session } from '../../machine/machine';
import { display } from '../../machine/winPath';
import type { Workspace } from '../../workspace';
import type { ShellResult } from '../shell';
import { toArgs } from './args';
import { bind } from './bind';
import { lex, LexError, type LexToken, type WordPart } from './lex';
import { findCmdlet } from './registry';

const fail = (message: string, ...hints: string[]): ShellResult => ({
  lines: [line(message, 'error'), ...hints.map((hint) => line(hint, 'hint'))],
  exitCode: 1,
});

/** What each operator is called, for the pointer while this sandbox can't run it yet. */
const NOT_YET: Partial<Record<LexToken['kind'], string>> = {
  pipe: 'pipes (|)',
  redirect: 'redirects (> and >>)',
  open: 'parentheses',
  close: 'parentheses',
  call: 'the & operator',
};

/**
 * PowerShell 7 for Act 1's laptop, one per terminal tab. It reads a line the way
 * PowerShell does (lex, then find the command, then bind its parameters) and runs it
 * against the machine. Statements separated by ; run in turn, and one failing doesn't
 * stop the next, as in PowerShell.
 */
export class MachineShell {
  readonly ws: Workspace;
  readonly machine: Machine;
  readonly sessionId: number;

  constructor(ws: Workspace, machine: Machine, sessionId: number) {
    this.ws = ws;
    this.machine = machine;
    this.sessionId = sessionId;
  }

  get session(): Session {
    return this.machine.session(this.sessionId);
  }

  prompt(): string {
    return `PS ${display(this.session.cwd)}> `;
  }

  run(input: string): ShellResult {
    let tokens: LexToken[];
    try {
      tokens = lex(input);
    } catch (error) {
      if (error instanceof LexError) return fail(error.message, error.hint);
      throw error;
    }
    const lines: OutputLine[] = [];
    let exitCode = 0;
    for (const statement of statements(tokens)) {
      const result = this.runStatement(statement);
      lines.push(...result.lines);
      exitCode = result.exitCode;
    }
    return { lines, exitCode };
  }

  private runStatement(tokens: readonly LexToken[]): ShellResult {
    const unsupported = tokens.find((token) => NOT_YET[token.kind] !== undefined);
    if (unsupported)
      return fail(`This sandbox doesn't run ${NOT_YET[unsupported.kind] ?? ''} yet.`);
    const [first, ...rest] = tokens;
    if (first?.kind !== 'word' || first.parts.some((part) => part.kind === 'variable'))
      return fail("This sandbox doesn't run expressions yet. Start the line with a command.");
    const name = this.text(first.parts);
    const cmdlet = findCmdlet(name);
    if (cmdlet === null) return notRecognized(name);
    const args = toArgs(rest, (variable) => this.expand(variable));
    if (!Array.isArray(args)) return fail(args.message, ...args.hints);
    const bound = bind(cmdlet.spec, args);
    if (!bound.ok) return fail(`${cmdlet.spec.name}: ${bound.message}`, ...bound.hints);
    return cmdlet.run({ ws: this.ws, machine: this.machine, session: this.session }, bound.bound);
  }

  private text(parts: readonly WordPart[]): string {
    return parts
      .map((part) => (part.kind === 'text' ? part.text : this.expand(part.name)))
      .join('');
  }

  /** A variable's value in this tab. Names never set are empty, as $null prints in PowerShell. */
  private expand(name: string): string {
    const session = this.session;
    const lower = name.toLowerCase();
    if (lower.startsWith('env:')) return session.env.get(name.slice(4)) ?? '';
    switch (lower) {
      case 'home':
        return display(this.machine.home);
      case 'pwd':
        return display(session.cwd);
      default:
        return '';
    }
  }
}

/** PowerShell's two-line error for a name it can't find, word for word (captured). */
function notRecognized(name: string): ShellResult {
  return {
    lines: [
      line(
        `${name}: The term '${name}' is not recognized as a name of a cmdlet, function, script file, or executable program.`,
        'error',
      ),
      line(
        'Check the spelling of the name, or if a path was included, verify that the path is correct and try again.',
        'error',
      ),
    ],
    exitCode: 1,
  };
}

/** The statements of a line, split at each ;, skipping empty ones. */
function statements(tokens: readonly LexToken[]): LexToken[][] {
  const result: LexToken[][] = [[]];
  for (const token of tokens) {
    if (token.kind === 'end') result.push([]);
    else result.at(-1)?.push(token);
  }
  return result.filter((statement) => statement.length > 0);
}
