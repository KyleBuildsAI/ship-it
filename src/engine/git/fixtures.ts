import { Workspace } from '../workspace';
import { sha1 } from './hash';
import type { RepositoryDeps } from './repository';

/**
 * One setup step for a sandbox. Missions store their starting state as a list of
 * these plain objects, so it can be validated, saved, and replayed exactly.
 */
export type FixtureStep =
  | { readonly op: 'init' }
  | { readonly op: 'write'; readonly path: string; readonly content: string }
  | { readonly op: 'append'; readonly path: string; readonly text: string }
  | { readonly op: 'delete'; readonly path: string }
  | { readonly op: 'stage'; readonly paths: readonly string[] }
  | { readonly op: 'commit'; readonly message: string };

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

/** Real SHA-1, the real clock, and the player as author: what the game itself uses. */
export function defaultDeps(): RepositoryDeps {
  return {
    hash: sha1,
    clock: () => Date.now(),
    author: { name: 'Kyle', email: 'kyle@quillwork.ai' },
  };
}

/** Replays setup steps into a fresh workspace. */
export function buildWorkspace(steps: readonly FixtureStep[], deps: RepositoryDeps): Workspace {
  const ws = new Workspace(deps);
  for (const step of steps) {
    switch (step.op) {
      case 'init':
        ws.initRepo();
        break;
      case 'write':
        ws.writeFile(step.path, step.content);
        break;
      case 'append': {
        const before = ws.fs.isFile(step.path) ? ws.fs.readFile(step.path) : '';
        ws.writeFile(step.path, before + step.text);
        break;
      }
      case 'delete':
        ws.deleteFile(step.path);
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
  return ws;
}
