import { FsError, type FsErrorCode } from '../../fs/virtualFs';
import { line, type OutputLine } from '../../git/cli/output';
import type { Machine, Session } from '../../machine/machine';
import { display } from '../../machine/winPath';
import type { Workspace } from '../../workspace';
import type { ShellResult } from '../shell';
import { toArgs, type Arg } from './args';
import { bind } from './bind';
import { CHOICES, question as confirmLines, readAnswer, type ConfirmRequest } from './confirm';
import { lex, LexError, type LexToken, type WordPart } from './lex';
import { openSink, pour, splitRedirects, type Sink } from './redirect';
import { findCmdlet, type Cmdlet, type CmdletResult, type CommandContext } from './registry';

const fail = (message: string, ...hints: string[]): ShellResult => ({
  lines: [line(message, 'error'), ...hints.map((hint) => line(hint, 'hint'))],
  exitCode: 1,
});

const isErrorTone = (output: OutputLine) => output.tone === 'error';

/** A command found by name, with its arguments read but not yet bound. */
interface Found {
  readonly cmdlet: Cmdlet;
  readonly args: Arg[];
}

/** Where each stream of a statement goes; null is the screen. */
interface Sinks {
  output: Sink | null;
  error: Sink | null;
}

/** What each operator is called, for the pointer while this sandbox can't run it yet. */
const NOT_YET: Partial<Record<LexToken['kind'], string>> = {
  pipe: 'pipes (|)',
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

  /**
   * One statement, in PowerShell's order (checked in 7.6.6). It finds the command first,
   * so a name it can't find is reported on screen with no file touched. Then each redirect
   * opens its file, then the command binds its parameters and runs, holding those files.
   */
  private runStatement(tokens: readonly LexToken[]): ShellResult {
    const split = splitRedirects(tokens);
    if ('refused' in split) return fail(split.refused);
    const found = this.resolve(split.command);
    if (!('cmdlet' in found)) return found;
    const sinks: Sinks = { output: null, error: null };
    const held = new Set<string>();
    const context = { ws: this.ws, machine: this.machine, session: this.session };
    for (const redirect of split.redirects) {
      const sink = openSink(context, redirect, this.text(redirect.target), held);
      if ('refused' in sink) return fail(`Out-File: ${sink.refused}`);
      sinks[redirect.stream] = sink;
      if (sink.kind === 'file') held.add(sink.path.toLowerCase());
    }
    const route = (result: CmdletResult) => this.route(result, sinks, split.merge);
    return route(this.execute(found, held, route));
  }

  /** The command a statement names, with its arguments read, or why it can't run. */
  private resolve(tokens: readonly LexToken[]): Found | ShellResult {
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
    return { cmdlet, args };
  }

  /**
   * Binds a found command's parameters and runs it, with `held` files off limits. What it
   * prints after a question is answered still belongs to this statement, so `route` sends
   * it through the same redirects.
   */
  private execute(
    { cmdlet, args }: Found,
    held: ReadonlySet<string>,
    route: (result: CmdletResult) => ShellResult,
  ): CmdletResult {
    const { spec } = cmdlet;
    const bound = bind(spec, args);
    // A binding error is PowerShell's, not the command's, so no redirect takes it.
    if (!bound.ok)
      return { ...fail(`${spec.name}: ${bound.message}`, ...bound.hints), stopped: true };
    const context: CommandContext = {
      ws: this.ws,
      machine: this.machine,
      session: this.session,
      held,
      confirm: (request: ConfirmRequest) => {
        // Answering carries on the cmdlet's work, so it gets the same safety net and files.
        this.question = {
          ...request,
          answer: (choice) => route(guarded(spec.name, () => request.answer(choice))),
        };
      },
    };
    return guarded(spec.name, () => cmdlet.run(context, bound.bound));
  }

  /**
   * Sends a command's lines where its redirects point, in the order they came. Output goes
   * to the output sink. Errors go to the error sink, or with 2>&1 wherever output goes;
   * the sandbox's hints under them stay off files. An error that stopped the command
   * isn't in the error stream at all, so it prints on screen whatever the redirects say.
   */
  private route(result: CmdletResult, sinks: Sinks, merge: boolean): ShellResult {
    // No file, or 2>&1 alone, changes nothing on screen: errors already show there, in order.
    if (sinks.output === null && sinks.error === null) return result;
    const context = { ws: this.ws, machine: this.machine };
    const stop = result.stopped === true ? result.lines.findLastIndex(isErrorTone) : -1;
    const flowing = stop === -1 ? result.lines : result.lines.slice(0, stop);
    const stopper = stop === -1 ? [] : result.lines.slice(stop);
    const withoutHints = (lines: readonly OutputLine[]) =>
      lines.filter((output) => output.tone !== 'hint');
    let screen: readonly OutputLine[];
    if (merge && sinks.output !== null) {
      // 2>&1 leaves no error sink, so errors join the output in its file, in order.
      pour(context, sinks.output, withoutHints(flowing));
      screen = [];
    } else {
      const isError = (output: OutputLine) => output.tone === 'error' || output.tone === 'hint';
      const errors = flowing.filter(isError);
      const output = flowing.filter((output) => !isError(output));
      if (sinks.output !== null) pour(context, sinks.output, output);
      if (sinks.error !== null) pour(context, sinks.error, withoutHints(errors));
      screen = [...(sinks.error === null ? errors : []), ...(sinks.output === null ? output : [])];
    }
    return { lines: [...screen, ...stopper], exitCode: result.exitCode };
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

/**
 * Runs a cmdlet's work with a safety net. Cmdlets check the drive before they change it, so
 * a drive error means a check was missed; it prints as one PowerShell-style error line
 * rather than escaping Shell.run, where nothing catches it and the prompt never comes back.
 */
function guarded(cmdlet: string, work: () => CmdletResult): CmdletResult {
  try {
    return work();
  } catch (error) {
    if (error instanceof FsError)
      return fail(`${cmdlet}: ${DRIVE_ERRORS[error.code](display(error.path))}`);
    throw error;
  }
}

/**
 * Each drive error in the words PowerShell 7.6.6 shows: .NET's for the IO errors, and
 * PowerShell's own for a missing item and for a folder moved inside itself.
 */
const DRIVE_ERRORS: Readonly<Record<FsErrorCode, (path: string) => string>> = {
  ENOENT: (path) => `Cannot find path '${path}' because it does not exist.`,
  ENOTDIR: (path) => `Could not find a part of the path '${path}'.`,
  EISDIR: (path) => `Access to the path '${path}' is denied.`,
  EEXIST: (path) =>
    `Cannot create '${path}' because a file or directory with the same name already exists.`,
  ENOTEMPTY: (path) => `The directory is not empty. : '${path}'.`,
  EINVAL: (path) =>
    `Destination path cannot be a subdirectory of the source or the source itself: ${path}.`,
};

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
