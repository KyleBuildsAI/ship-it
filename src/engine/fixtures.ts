import { SubtreeFs } from './fs/fileTree';
import { sha1 } from './git/hash';
import type { RepositoryDeps } from './git/repository';
import { applyMachineStep, isMachineStep, type MachineFixtureStep } from './machine/fixtures';
import type { Machine } from './machine/machine';
import { stockMachine } from './machine/stock';
import { Workspace } from './workspace';

/** A step that shapes the project folder and its repository (Act 2's sandboxes). */
export type GitFixtureStep =
  | { readonly op: 'init' }
  | { readonly op: 'write'; readonly path: string; readonly content: string }
  | { readonly op: 'append'; readonly path: string; readonly text: string }
  | { readonly op: 'delete'; readonly path: string }
  | { readonly op: 'stage'; readonly paths: readonly string[] }
  | { readonly op: 'commit'; readonly message: string };

/**
 * The first step of an Act 1 sandbox: a stock Windows laptop for `user`, with the project
 * folder (where git works) mounted at `mount`, by default ~\quillwork\app.
 */
export interface WindowsStep {
  readonly op: 'windows';
  readonly user: string;
  readonly computer: string;
  readonly mount?: string;
}

/**
 * One setup step for a sandbox. Missions store their starting state as a list of
 * these plain objects, so it can be validated, saved, and replayed exactly.
 *
 * In a windows() sandbox, write, append and delete take drive paths
 * ('Users/kyle/notes/today.txt'), while init, stage and commit act on the mounted project
 * folder and take paths inside it, as git would.
 */
export type FixtureStep = WindowsStep | GitFixtureStep | MachineFixtureStep;

/** What `modify(path)` adds when no new content is given: a visible, realistic edit. */
export const DEFAULT_EDIT = '// work in progress\n';

/**
 * Builds sandbox setups in a readable chain, as in DESIGN.md section 7:
 * `repo().commit('init', files).modify('app.ts').untracked('.env')`.
 * Every call returns a new builder, so shared setups can be extended safely.
 */
export class FixtureBuilder {
  private readonly steps: readonly FixtureStep[];

  constructor(steps: readonly FixtureStep[] = []) {
    this.steps = steps;
  }

  private then(...steps: FixtureStep[]): FixtureBuilder {
    return new FixtureBuilder([...this.steps, ...steps]);
  }

  init(): FixtureBuilder {
    return this.then({ op: 'init' });
  }

  write(path: string, content: string): FixtureBuilder {
    return this.then({ op: 'write', path, content });
  }

  /** Edit a file: replace its content, or append a small change if none is given. */
  modify(path: string, content?: string): FixtureBuilder {
    return content === undefined
      ? this.then({ op: 'append', path, text: DEFAULT_EDIT })
      : this.write(path, content);
  }

  /** A new file git doesn't know about yet. */
  untracked(path: string, content = ''): FixtureBuilder {
    return this.write(path, content);
  }

  delete(path: string): FixtureBuilder {
    return this.then({ op: 'delete', path });
  }

  stage(...paths: string[]): FixtureBuilder {
    return this.then({ op: 'stage', paths });
  }

  /** Write the given files, stage exactly those files, and commit them. */
  commit(message: string, files: Record<string, string> = {}): FixtureBuilder {
    const writes = Object.entries(files).map(([path, content]): FixtureStep => ({
      op: 'write',
      path,
      content,
    }));
    return this.then(
      ...writes,
      { op: 'stage', paths: Object.keys(files) },
      { op: 'commit', message },
    );
  }

  /** Write several files at once: { path: content }. */
  files(files: Readonly<Record<string, string>>): FixtureBuilder {
    return this.then(
      ...Object.entries(files).map(([path, content]): FixtureStep => ({
        op: 'write',
        path,
        content,
      })),
    );
  }

  mkdir(path: string): FixtureBuilder {
    return this.then({ op: 'mkdir', path });
  }

  /**
   * Open a terminal now. It keeps the variables it copied, so later saved changes (an
   * install, a setx) won't reach it: that's how a stale terminal is set up.
   */
  session(): FixtureBuilder {
    return this.then({ op: 'session' });
  }

  toSpec(): readonly FixtureStep[] {
    return this.steps;
  }

  build(deps: RepositoryDeps = defaultDeps()): Workspace {
    return buildWorkspace(this.steps, deps);
  }
}

/** A folder that already has `git init` run in it. */
export function repo(): FixtureBuilder {
  return new FixtureBuilder([{ op: 'init' }]);
}

/** A plain project folder with no repository yet, for missions that start with `git init`. */
export function folder(): FixtureBuilder {
  return new FixtureBuilder();
}

/** A stock Windows laptop (Act 1). Every other step comes after this one. */
export function windows(
  options: { user?: string; computer?: string; mount?: string } = {},
): FixtureBuilder {
  const { user = 'kyle', computer = 'QUILL-LT-7', mount } = options;
  const step: WindowsStep =
    mount === undefined
      ? { op: 'windows', user, computer }
      : { op: 'windows', user, computer, mount };
  return new FixtureBuilder([step]);
}

/** Real SHA-1, the real clock, and the player as author: what the game itself uses. */
export function defaultDeps(): RepositoryDeps {
  return {
    hash: sha1,
    clock: () => Date.now(),
    author: { name: 'Kyle', email: 'kyle@quillwork.ai' },
  };
}

/** Where a laptop's project folder is mounted unless the windows() step says otherwise. */
export function defaultMount(user: string): string {
  return `Users/${user}/quillwork/app`;
}

/**
 * Writes a file the way a setup step means it: on a laptop's drive (a drive path) in an
 * Act 1 sandbox, in the project folder otherwise. Either way it announces the change.
 */
export function writeSandboxFile(ws: Workspace, path: string, content: string): void {
  if (ws.machine === null) {
    ws.writeFile(path, content);
    return;
  }
  const change = ws.machine.drive.writeFile(path, content);
  if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path, change });
}

/** Reads a file for a setup step, from the same place writeSandboxFile writes it. */
export function readSandboxFile(ws: Workspace, path: string): string | null {
  const tree = ws.machine?.drive ?? ws.fs;
  return tree.isFile(path) ? tree.readFile(path) : null;
}

export function deleteSandboxFile(ws: Workspace, path: string): void {
  if (ws.machine === null) {
    ws.deleteFile(path);
    return;
  }
  ws.machine.drive.deleteFile(path);
  ws.events.emit({ type: 'fileChanged', path, change: 'deleted' });
}

/** Applies one git step, the way setup does it. */
function applyGitStep(ws: Workspace, step: GitFixtureStep): void {
  switch (step.op) {
    case 'init':
      ws.initRepo();
      break;
    case 'write':
      writeSandboxFile(ws, step.path, step.content);
      break;
    case 'append':
      writeSandboxFile(ws, step.path, (readSandboxFile(ws, step.path) ?? '') + step.text);
      break;
    case 'delete':
      deleteSandboxFile(ws, step.path);
      break;
    case 'stage': {
      const repository = ws.requireRepo();
      for (const path of step.paths) {
        if (ws.fs.isFile(path)) repository.stage(path, ws.fs.readFile(path));
        else repository.removeFromIndex(path);
      }
      break;
    }
    case 'commit':
      ws.requireRepo().commitIndex(step.message);
      break;
  }
}

/**
 * Replays setup steps into a fresh workspace. A sandbox whose first step is windows()
 * gets a laptop, with the project folder mounted on its drive; and if no step opened a
 * terminal, one opens at the end, so the player always has a prompt.
 */
export function buildWorkspace(steps: readonly FixtureStep[], deps: RepositoryDeps): Workspace {
  const [first, ...rest] = steps;
  let machine: Machine | null = null;
  let ws: Workspace;
  if (first?.op === 'windows') {
    machine = stockMachine(first.user, first.computer);
    const mount = first.mount ?? defaultMount(first.user);
    ws = new Workspace(deps, { fs: new SubtreeFs(machine.drive, mount), machine });
  } else {
    ws = new Workspace(deps);
  }
  for (const step of first?.op === 'windows' ? rest : steps) {
    if (step.op === 'windows') throw new Error('windows() must be the first step.');
    if (isMachineStep(step)) {
      if (machine === null) throw new Error(`The "${step.op}" step needs a windows() sandbox.`);
      applyMachineStep(machine, step);
    } else {
      applyGitStep(ws, step);
    }
  }
  if (machine !== null && machine.sessions().length === 0) machine.openSession();
  return ws;
}
