import { Emitter } from '../events';
import { WindowsFs } from './windowsFs';
import { EnvTable, expandPercent } from './envTable';
import type { EnvScope, MachineEvent } from './events';
import { display, resolveExisting } from './winPath';

/** One PowerShell tab: where it stands and the environment it copied when it opened. */
export interface Session {
  /** The tab's number, as the terminal shows it: PS 1, PS 2. */
  readonly id: number;
  /** Each tab is a pwsh process with its own id. */
  readonly pid: number;
  /** Canonical, like 'Users/kyle'. */
  cwd: string;
  /**
   * PowerShell 7's location history: `cd -` steps back through `back`, and `cd +` forward
   * through `forward`, each holding up to 20 folders. Newest last.
   */
  readonly back: string[];
  readonly forward: string[];
  readonly env: EnvTable;
}

/** What `cd -` or `cd +` did: moved, found no history, or found a folder since deleted. */
export type HistoryMove = 'moved' | 'empty' | { readonly missing: string };

/** How many folders PowerShell 7 remembers each way for `cd -` and `cd +`. */
export const LOCATION_HISTORY_LIMIT = 20;

function remember(stack: string[], folder: string): void {
  stack.push(folder);
  if (stack.length > LOCATION_HISTORY_LIMIT) stack.shift();
}

export interface MachineOptions {
  readonly user: string;
  readonly computer: string;
  /** Saved variables: Machine scope (every user) and User scope (this user). */
  readonly saved?: {
    readonly machine?: Readonly<Record<string, string>>;
    readonly user?: Readonly<Record<string, string>>;
  };
}

/** Kyle isn't an administrator, so only setup code may change Machine-scope variables. */
export interface SetEnvOptions {
  readonly session?: number;
  readonly admin?: boolean;
  /** Save as expandable (REG_EXPAND_SZ) rather than plain text. Saved scopes only. */
  readonly expand?: boolean;
}

/** New process ids count up from here in steps of 4, as Windows hands them out. */
const FIRST_PID = 9000;
const PID_STEP = 4;

/**
 * The simulated Windows laptop Act 1 teaches on: one drive (C:), the player's home folder,
 * saved environment variables, and the terminal tabs that are open. Pure TypeScript, like
 * the git engine; it announces every change on `events`.
 *
 * The key lesson lives here: a tab copies the saved variables when it opens and never
 * looks at them again, so a change saved later only reaches tabs opened after it.
 */
export class Machine {
  /** C:, case-insensitive like NTFS. */
  readonly drive = new WindowsFs();
  readonly events = new Emitter<MachineEvent>();
  readonly user: string;
  readonly computer: string;
  /** The player's home folder, canonical: 'Users/kyle'. */
  readonly home: string;
  readonly saved: { readonly machine: EnvTable; readonly user: EnvTable };
  private readonly tabs: Session[] = [];
  private activeId: number | null = null;
  private nextSessionId = 1;
  private nextPid = FIRST_PID;

  constructor(options: MachineOptions) {
    this.user = options.user;
    this.computer = options.computer;
    this.home = `Users/${options.user}`;
    this.saved = {
      machine: new EnvTable(options.saved?.machine),
      user: new EnvTable(options.saved?.user),
    };
    this.drive.makeDir(this.home);
  }

  /** A fresh process id. */
  allocatePid(): number {
    const pid = this.nextPid;
    this.nextPid += PID_STEP;
    return pid;
  }

  /** The open tabs, in the order they were opened. */
  sessions(): readonly Session[] {
    return this.tabs;
  }

  /** The tab the player is typing in. */
  active(): Session {
    const session = this.tabs.find((tab) => tab.id === this.activeId);
    if (session === undefined) throw new Error('No terminal is open.');
    return session;
  }

  session(id: number): Session {
    const session = this.tabs.find((tab) => tab.id === id);
    if (session === undefined) throw new Error(`No terminal tab ${String(id)} is open.`);
    return session;
  }

  /** Opens a tab in the home folder with the saved variables as they are now. */
  openSession(): Session {
    const session: Session = {
      id: this.nextSessionId++,
      pid: this.allocatePid(),
      cwd: this.home,
      back: [],
      forward: [],
      env: this.newTerminalEnv(),
    };
    this.tabs.push(session);
    this.activeId = session.id;
    this.events.emit({ type: 'sessionOpened', session: session.id });
    return session;
  }

  /** Closes a tab. If it was the active one, the most recently opened tab left takes over. */
  closeSession(id: number): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) throw new Error(`No terminal tab ${String(id)} is open.`);
    this.tabs.splice(index, 1);
    // Settle every change before announcing any, so a listener never sees a closed tab
    // still marked active.
    const wasActive = this.activeId === id;
    const next = wasActive ? (this.tabs.at(-1) ?? null) : null;
    if (wasActive) this.activeId = next?.id ?? null;
    this.events.emit({ type: 'sessionClosed', session: id });
    if (next) this.events.emit({ type: 'sessionActivated', session: next.id });
  }

  activate(id: number): void {
    this.session(id);
    if (this.activeId === id) return;
    this.activeId = id;
    this.events.emit({ type: 'sessionActivated', session: id });
  }

  /**
   * Every tab closes and reopens, as after Windows Update restarts the terminals: same tab
   * numbers, new processes, back in the home folder, with freshly copied variables.
   * Anything that lived only in a tab (a `$env:` note, a folder you'd walked to) is gone.
   */
  restartTerminals(): void {
    for (const [index, tab] of this.tabs.entries()) {
      this.tabs[index] = {
        id: tab.id,
        pid: this.allocatePid(),
        cwd: this.home,
        back: [],
        forward: [],
        env: this.newTerminalEnv(),
      };
    }
    this.events.emit({ type: 'terminalsRestarted' });
  }

  /**
   * The variables a tab opened now would copy: a few that Windows sets for every sign-in,
   * then the Machine scope, then the User scope on top. Path is the exception: the saved
   * Machine Path and User Path join into one, Machine first. %NAME% references expand.
   */
  newTerminalEnv(): EnvTable {
    const profile = display(this.home);
    const env = new EnvTable({
      USERNAME: this.user,
      USERPROFILE: profile,
      HOMEDRIVE: 'C:',
      HOMEPATH: profile.slice(2),
      APPDATA: `${profile}\\AppData\\Roaming`,
      LOCALAPPDATA: `${profile}\\AppData\\Local`,
      COMPUTERNAME: this.computer,
    });
    const expand = (value: string) => expandPercent(value, (name) => env.get(name));
    // Windows' order: the Machine scope first, then the User scope. Within each, plain
    // values are set before expandable ones expand, so a reference to a plain variable
    // always resolves; and a scope's Path expands before the next scope exists.
    const applyScope = (scope: EnvTable): string | null => {
      const entries = scope.entries().filter(({ name }) => name.toUpperCase() !== 'PATH');
      for (const { name, value } of entries) if (!scope.expands(name)) env.set(name, value);
      for (const { name, value } of entries) if (scope.expands(name)) env.set(name, expand(value));
      const path = scope.get('Path');
      if (path === null) return null;
      return scope.expands('Path') ? expand(path) : path;
    };
    const machinePath = applyScope(this.saved.machine);
    const userPath = applyScope(this.saved.user);
    env.set(
      'Path',
      [machinePath, userPath].filter((part): part is string => part !== null).join(';'),
    );
    return env;
  }

  /**
   * Moves a tab to another folder. The folder it leaves joins the back history, and the
   * forward history clears, as a new move does in PowerShell 7.
   */
  setLocation(sessionId: number, path: string, via: 'relative' | 'absolute' | 'home') {
    const session = this.session(sessionId);
    remember(session.back, session.cwd);
    session.forward.length = 0;
    this.move(session, path, via);
  }

  /**
   * `cd -`: back to the previous folder. 'empty' when there's no history left. A folder
   * deleted since is reported as missing, and the tab stays put; like PowerShell, the
   * history step is used up either way.
   */
  goBack(sessionId: number): HistoryMove {
    const session = this.session(sessionId);
    const to = session.back.pop();
    if (to === undefined) return 'empty';
    remember(session.forward, session.cwd);
    return this.moveIfThere(session, to, 'back');
  }

  /** `cd +`: forward again, after `cd -`, with the same rules as goBack. */
  goForward(sessionId: number): HistoryMove {
    const session = this.session(sessionId);
    const to = session.forward.pop();
    if (to === undefined) return 'empty';
    remember(session.back, session.cwd);
    return this.moveIfThere(session, to, 'forward');
  }

  private moveIfThere(session: Session, to: string, via: 'back' | 'forward'): HistoryMove {
    const found = resolveExisting(this.drive, to);
    if (found === null || !this.drive.isDir(found)) return { missing: to };
    this.move(session, found, via);
    return 'moved';
  }

  private move(
    session: Session,
    to: string,
    via: 'relative' | 'absolute' | 'home' | 'back' | 'forward',
  ) {
    const from = session.cwd;
    session.cwd = to;
    this.events.emit({ type: 'cwdChanged', session: session.id, from, to, via });
  }

  /**
   * Sets (or, with null or '', removes) a variable in one scope. Machine scope needs an
   * administrator, which the player isn't: it answers 'denied' and changes nothing.
   */
  setEnv(
    scope: EnvScope,
    name: string,
    value: string | null,
    options: SetEnvOptions = {},
  ): 'ok' | 'denied' {
    if (scope === 'machine' && options.admin !== true) return 'denied';
    const table =
      scope === 'session'
        ? this.session(options.session ?? this.active().id).env
        : this.saved[scope];
    const session = scope === 'session' ? (options.session ?? this.active().id) : null;
    const before = table.get(name);
    const after = value === '' ? null : value;
    if (after === null) table.delete(name);
    else table.set(name, after, { expand: options.expand === true });
    if (before !== after) {
      const change = after === null ? 'removed' : 'set';
      this.events.emit({ type: 'envChanged', scope, session, name, change });
    }
    return 'ok';
  }
}
