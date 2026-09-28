import { line, type OutputLine } from '../../git/cli/output';
import type { Machine, Session } from '../../machine/machine';
import { display } from '../../machine/winPath';
import type { Workspace } from '../../workspace';
import type { ShellResult } from '../shell';
import { toArgs } from './args';
import { bind } from './bind';
import { CHOICES, question as confirmLines, readAnswer, type ConfirmRequest } from './confirm';
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
  /** A cmdlet's open question; while it's open, the next line is its answer. */
  private question: ConfirmRequest | null = null;
  /** Statements typed after the one that asked, which run once it's answered. */
  private waiting: LexToken[][] = [];

  constructor(ws: Workspace, machine: Machine, sessionId: number) {
    this.ws = ws;
    this.machine = machine;
    this.sessionId = sessionId;
  }

  get session(): Session {
    return this.machine.session(this.sessionId);
  }

  /** True while a cmdlet waits for a yes or no, so the line typed isn't a command. */
  get asking(): boolean {
    return this.question !== null;
  }

  prompt(): string {
    return this.question === null ? `PS ${display(this.session.cwd)}> ` : CHOICES;
  }

  run(input: string): ShellResult {
    if (this.question !== null) return this.answer(this.question, input);
    let tokens: LexToken[];
    try {
      tokens = lex(input);
    } catch (error) {
      if (error instanceof LexError) return fail(error.message, error.hint);
      throw error;
    }
    return this.runStatements(statements(tokens));
  }

  private answer(question: ConfirmRequest, input: string): ShellResult {
    const read = readAnswer(input);
    if ('again' in read) return { lines: read.again, exitCode: 0 };
    this.question = null;
    const answered = question.answer(read.choice);
    // Answering may ask the next question, like Remove-Item's next full folder.
    const next = this.openQuestion();
    if (next !== null) return { lines: [...answered.lines, ...confirmLines(next)], exitCode: 0 };
    const rest = this.runStatements(this.waiting);
    return rest.lines.length === 0 && this.waiting.length === 0
      ? answered
      : { lines: [...answered.lines, ...rest.lines], exitCode: rest.exitCode };
  }

  /** Read through a method: a cmdlet may have opened a question since the last look. */
  private openQuestion(): ConfirmRequest | null {
    return this.question;
  }

  private runStatements(list: readonly LexToken[][]): ShellResult {
    const lines: OutputLine[] = [];
    let exitCode = 0;
    for (const [index, statement] of list.entries()) {
      const result = this.runStatement(statement);
      lines.push(...result.lines);
      exitCode = result.exitCode;
      const asked = this.openQuestion();
      if (asked !== null) {
        // PowerShell waits for the answer before it goes on to the next statement.
        this.waiting = list.slice(index + 1);
        return { lines: [...lines, ...confirmLines(asked)], exitCode };
      }
    }
    this.waiting = [];
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
    const context = {
      ws: this.ws,
      machine: this.machine,
      session: this.session,
      confirm: (request: ConfirmRequest) => {
        this.question = request;
      },
    };
    return cmdlet.run(context, bound.bound);
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
