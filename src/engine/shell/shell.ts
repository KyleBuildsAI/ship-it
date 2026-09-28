import { baseName, resolvePath } from '../fs/paths';
import { FsError } from '../fs/virtualFs';
import { line, type OutputLine } from '../git/cli/output';
import { runGit } from '../git/cli/runGit';
import type { Workspace } from '../workspace';
import { MachineShell } from './machine/machineShell';
import { tokenize, TokenizeError, type Token } from './tokenize';

export interface ShellResult {
  readonly lines: readonly OutputLine[];
  readonly exitCode: number;
  /** The terminal should wipe its screen (`clear` / `cls`). */
  readonly clear?: boolean;
  /** The player asked to edit a file (`code app.ts`); the UI opens its editor. */
  readonly openFile?: string;
}

const ok = (lines: OutputLine[] = []): ShellResult => ({ lines, exitCode: 0 });
const fail = (message: string, ...hints: string[]): ShellResult => ({
  lines: [line(message, 'error'), ...hints.map((hint) => line(hint, 'hint'))],
  exitCode: 1,
});

/** Habits from other shells, answered with what to type in PowerShell and this sandbox. */
const GUIDANCE: Record<string, string> = {
  touch: 'Create an empty file with: echo "" > notes.txt',
  nano: 'Edit files with: code notes.txt',
  vim: 'Edit files with: code notes.txt',
  vi: 'Edit files with: code notes.txt',
  notepad: 'Edit files with: code notes.txt',
  cp: 'Copying files is not part of this sandbox. Create files with echo, or edit them with code.',
  copy: 'Copying files is not part of this sandbox. Create files with echo, or edit them with code.',
  mv: 'Rename tracked files with git mv old.txt new.txt, so git records the rename.',
  move: 'Rename tracked files with git mv old.txt new.txt, so git records the rename.',
  del: 'Delete files with: rm notes.txt',
  sudo: 'No administrator rights are needed in this sandbox.',
};

const HELP: OutputLine[] = [
  line('Commands in this sandbox:'),
  line('  pwd              where am I?'),
  line('  ls [-Force]      list files (-Force also shows the hidden .git folder)'),
  line('  cd <folder>      move into a folder (cd .. goes up, cd / to the project root)'),
  line('  cat <file>       print a file'),
  line('  code <file>      open a file in the editor'),
  line('  mkdir <folder>   make a folder'),
  line('  echo "text" > f  write text to a file (>> adds a line instead)'),
  line('  rm <file>        delete a file (rm -r <folder> for folders)'),
  line('  git <command>    run git (try git help)'),
  line('  history, clear, help'),
];

/**
 * A small PowerShell-flavoured shell over a Workspace. The commands are the ones that
 * also work in real PowerShell, so habits learned here carry over to Kyle's terminal.
 *
 * It has two profiles. Act 2's project sandboxes get the handful of commands below. An
 * Act 1 laptop sandbox (one with a machine) gets fuller PowerShell 7, in `machineShell`,
 * running in the laptop's active terminal tab.
 */
export class Shell {
  readonly ws: Workspace;
  /** Shown in the prompt, Windows style: C:\Users\kyle\quillwork\app */
  readonly displayRoot: string;
  private directory = '';
  private readonly past: string[] = [];
  /** One PowerShell per laptop tab, as each tab is its own pwsh process. */
  private readonly tabShells = new Map<number, MachineShell>();

  constructor(ws: Workspace, displayRoot: string) {
    this.ws = ws;
    this.displayRoot = displayRoot;
  }

  /** Act 1's PowerShell for the tab the player is typing in, when the sandbox is a laptop. */
  get machineShell(): MachineShell | null {
    const machine = this.ws.machine;
    if (machine === null) return null;
    const id = machine.active().id;
    let tab = this.tabShells.get(id);
    if (tab === undefined) {
      tab = new MachineShell(this.ws, machine, id);
      this.tabShells.set(id, tab);
    }
    return tab;
  }

  /**
   * The folder inside the project, for Act 2's commands and completion. On a laptop the
   * tab's folder lives on the machine instead (machineShell.session.cwd), and this stays ''.
   */
  get cwd(): string {
    return this.directory;
  }

  get history(): readonly string[] {
    return this.past;
  }

  prompt(): string {
    return this.machineShell?.prompt() ?? `PS ${this.displayPath(this.directory)}> `;
  }

  run(input: string): ShellResult {
    const machineShell = this.machineShell;
    // An answer to a question (Remove-Item's Confirm) isn't a command, so it's not history.
    if (input.trim() !== '' && machineShell?.asking !== true) this.past.push(input);
    if (machineShell) return machineShell.run(input);
    let tokens: Token[];
    try {
      tokens = tokenize(input);
    } catch (error) {
      if (error instanceof TokenizeError)
        return fail(`The string is ${error.message}.`, 'Close the quote and try again.');
      throw error;
    }

    const redirectAt = tokens.findIndex((token) => token.kind === 'redirect');
    const commandTokens = redirectAt === -1 ? tokens : tokens.slice(0, redirectAt);
    const words = commandTokens.flatMap((token) => (token.kind === 'word' ? [token.value] : []));
    const [name, ...args] = words;
    if (name === undefined)
      return redirectAt === -1 ? ok() : fail('Nothing to redirect: put a command before >.');

    const result = this.dispatch(name.toLowerCase(), args);
    if (redirectAt === -1) return result;
    return this.redirect(result, tokens.slice(redirectAt));
  }

  private dispatch(name: string, args: string[]): ShellResult {
    switch (name) {
      case 'git':
        return runGit(
          this.ws,
          { cwd: this.directory, displayRoot: this.displayRoot.replace(/\\/g, '/') },
          args,
        );
      case 'pwd':
        return ok([line(this.displayPath(this.directory))]);
      case 'ls':
      case 'dir':
        return this.ls(args);
      case 'cd':
        return this.cd(args[0]);
      case 'cat':
      case 'type':
        return this.cat(args);
      case 'code':
        return this.code(args[0]);
      case 'mkdir':
        return this.mkdir(args);
      case 'echo':
        return ok([line(args.join(' '))]);
      case 'rm':
        return this.rm(args);
      case 'clear':
      case 'cls':
        return { lines: [], exitCode: 0, clear: true };
      case 'history':
        return ok(
          this.past.map((entry, index) => line(`${String(index + 1).padStart(4)}  ${entry}`)),
        );
      case 'help':
        return ok(HELP);
      default: {
        const guidance = GUIDANCE[name];
        return fail(
          `${name}: The term '${name}' is not recognized as a name of a cmdlet, function, script file, or executable program.`,
          guidance ?? "Type 'help' to see the commands this sandbox knows.",
        );
      }
    }
  }

  /** `> file` replaces the file with the output; `>> file` adds to its end. */
  private redirect(result: ShellResult, rest: Token[]): ShellResult {
    const [operator, target, ...extra] = rest;
    if (operator?.kind !== 'redirect' || target?.kind !== 'word' || extra.length > 0) {
      return fail('Put exactly one file name after > or >>.');
    }
    if (result.exitCode !== 0) return result;
    const path = resolvePath(this.directory, target.value);
    if (path === null || path === '')
      return fail(`Cannot write to '${target.value}': it is outside the project.`);
    const text = result.lines.map((output) => `${output.text}\n`).join('');
    try {
      const before = operator.append && this.ws.fs.isFile(path) ? this.ws.fs.readFile(path) : '';
      const separator = before !== '' && !before.endsWith('\n') ? '\n' : '';
      this.ws.writeFile(path, before + separator + text);
    } catch (error) {
      if (error instanceof FsError) return this.fsFailure(error, target.value);
      throw error;
    }
    return ok();
  }

  private ls(args: string[]): ShellResult {
    const force = args.some((arg) => /^-(force|a|la|al)$/i.test(arg));
    const target = args.find((arg) => !arg.startsWith('-')) ?? '.';
    const path = resolvePath(this.directory, target);
    if (path === null || !this.ws.fs.exists(path)) return this.missing(target);
    if (this.ws.fs.isFile(path)) return ok([line(baseName(path))]);

    const entries = [...this.ws.fs.listDir(path)];
    if (path === '' && force && this.ws.repo !== null)
      entries.unshift({ name: '.git', kind: 'dir' });
    const lines = [line(''), line(`    Directory: ${this.displayPath(path)}`), line('')];
    if (entries.length === 0) return ok([...lines, line('(empty)', 'hint')]);
    lines.push(line('Mode   Name'), line('----   ----'));
    for (const entry of entries) {
      const hidden = entry.name === '.git';
      lines.push(
        line(
          `${entry.kind === 'dir' ? (hidden ? 'd--h-' : 'd----') : '-a---'}  ${entry.name}`,
          entry.kind === 'dir' ? 'meta' : 'plain',
        ),
      );
    }
    return ok(lines);
  }

  private cd(target: string | undefined): ShellResult {
    if (target === undefined || target === '~') {
      this.directory = '';
      return ok();
    }
    const path = resolvePath(this.directory, target);
    if (path === null)
      return fail(
        `cd: Cannot go above the project folder.`,
        'The sandbox only contains this project.',
      );
    if (!this.ws.fs.isDir(path)) return this.missing(target, 'cd');
    this.directory = path;
    return ok();
  }

  private cat(args: string[]): ShellResult {
    if (args.length === 0) return fail('cat: Name a file to print, like: cat README.md');
    const lines: OutputLine[] = [];
    for (const arg of args) {
      const path = resolvePath(this.directory, arg);
      if (path === null || !this.ws.fs.exists(path)) return this.missing(arg, 'cat');
      if (this.ws.fs.isDir(path))
        return fail(`cat: Unable to read '${arg}': it is a folder.`, `List it with: ls ${arg}`);
      const content = this.ws.fs.readFile(path);
      const body = content.endsWith('\n') ? content.slice(0, -1) : content;
      if (content !== '') lines.push(...body.split('\n').map((text) => line(text)));
    }
    return ok(lines);
  }

  private code(target: string | undefined): ShellResult {
    if (target === undefined) return fail('code: Name a file to open, like: code app.ts');
    const path = resolvePath(this.directory, target);
    if (path === null || path === '') return fail(`code: Cannot open '${target}'.`);
    if (this.ws.fs.isDir(path))
      return fail(`code: '${target}' is a folder. Open a file inside it.`);
    // Opening a file that doesn't exist yet creates it on save, as in VS Code.
    return { lines: [], exitCode: 0, openFile: path };
  }

  private mkdir(args: string[]): ShellResult {
    const names = args.filter((arg) => !arg.startsWith('-'));
    if (names.length === 0) return fail('mkdir: Name the folder to create, like: mkdir docs');
    for (const name of names) {
      const path = resolvePath(this.directory, name);
      if (path === null || path === '') return fail(`mkdir: Cannot create '${name}'.`);
      if (this.ws.fs.exists(path))
        return fail(
          `mkdir: An item with the specified name ${this.displayPath(path)} already exists.`,
        );
      this.ws.fs.makeDir(path);
    }
    return ok();
  }

  private rm(args: string[]): ShellResult {
    const recursive = args.some((arg) => /^-(r|rf|fr|recurse)$/i.test(arg));
    const targets = args.filter((arg) => !arg.startsWith('-'));
    if (targets.length === 0) return fail('rm: Name what to delete, like: rm notes.txt');
    for (const target of targets) {
      const path = resolvePath(this.directory, target);
      if (path === null || path === '') return fail(`rm: Refusing to delete '${target}'.`);
      if (!this.ws.fs.exists(path)) return this.missing(target, 'rm');
      if (this.ws.fs.isDir(path)) {
        if (!recursive && this.ws.fs.listDir(path).length > 0) {
          return fail(
            `rm: The item at ${this.displayPath(path)} has children and the -Recurse parameter was not specified.`,
            `Use: rm -r ${target}`,
          );
        }
        this.ws.fs.allFiles(path).forEach((file) => {
          this.ws.deleteFile(file);
        });
        this.ws.fs.removeDir(path, { recursive: true });
      } else {
        this.ws.deleteFile(path);
      }
    }
    return ok();
  }

  private missing(target: string, command = 'ls'): ShellResult {
    const resolved = resolvePath(this.directory, target);
    const shown = resolved === null ? target : this.displayPath(resolved);
    return fail(`${command}: Cannot find path '${shown}' because it does not exist.`);
  }

  private fsFailure(error: FsError, target: string): ShellResult {
    return fail(
      error.code === 'EISDIR'
        ? `Cannot write to '${target}': it is a folder.`
        : `Cannot write to '${target}' (${error.code}).`,
    );
  }

  private displayPath(path: string): string {
    return path === '' ? this.displayRoot : `${this.displayRoot}\\${path.replace(/\//g, '\\')}`;
  }
}
