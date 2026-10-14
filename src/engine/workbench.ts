import type { FileTree } from './fs/fileTree';
import { VirtualFs } from './fs/virtualFs';
import { Repository, type RepositoryData, type RepositoryDeps } from './git/repository';
import { Workspace } from './workspace';

/**
 * An Act 2 sandbox as plain JSON: the Workbench's files and folders, and the repository
 * (Loading Dock and Vault) if `git init` has run. The save keeps one so a mission left
 * halfway resumes on the very sandbox it was left on, commit ids and all.
 */
export interface WorkbenchData {
  readonly files: Readonly<Record<string, string>>;
  /** Every folder, so an empty one made with mkdir comes back too. */
  readonly dirs: readonly string[];
  readonly repo: RepositoryData | null;
}

function allDirs(fs: FileTree, dir = ''): string[] {
  return fs
    .listDir(dir)
    .filter((entry) => entry.kind === 'dir')
    .flatMap((entry) => {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
      return [path, ...allDirs(fs, path)];
    });
}

/**
 * The sandbox as data. Only a plain project folder fits: a laptop (Act 1) is a whole
 * simulated machine, which comes back by replaying Otto's log instead.
 */
export function saveWorkbench(ws: Workspace): WorkbenchData {
  if (ws.machine !== null) throw new Error('A laptop sandbox cannot be saved as a Workbench.');
  const files = Object.fromEntries(ws.fs.allFiles().map((path) => [path, ws.fs.readFile(path)]));
  return { files, dirs: allDirs(ws.fs), repo: ws.repo?.toData() ?? null };
}

/** Rebuilds the sandbox saveWorkbench described. New commits use `deps`, as usual. */
export function loadWorkbench(data: WorkbenchData, deps: RepositoryDeps): Workspace {
  const fs = new VirtualFs();
  for (const dir of data.dirs) fs.makeDir(dir);
  for (const [path, content] of Object.entries(data.files)) fs.writeFile(path, content);
  const repo = data.repo === null ? undefined : Repository.fromData(data.repo, deps);
  return new Workspace(deps, repo === undefined ? { fs } : { fs, repo });
}
