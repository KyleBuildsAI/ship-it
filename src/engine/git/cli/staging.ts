import type { Workspace } from '../../workspace';
import type { FileSnapshot } from '../types';

/**
 * Copies files from the working directory into the index (the Loading Dock). A path
 * that no longer exists on disk is removed from the index, which stages its deletion.
 * Announces only the paths whose index entry actually changed.
 */
export function stagePaths(ws: Workspace, paths: readonly string[]): string[] {
  const repo = ws.requireRepo();
  const changed: string[] = [];
  for (const path of paths) {
    const before = repo.indexEntries().get(path);
    if (ws.fs.isFile(path)) {
      if (repo.stage(path, ws.fs.readFile(path)) !== before) changed.push(path);
    } else if (repo.removeFromIndex(path)) {
      changed.push(path);
    }
  }
  if (changed.length > 0) ws.events.emit({ type: 'staged', paths: changed });
  return changed;
}

/**
 * Makes index entries match `source` (usually HEAD): the file's staged version goes
 * back to the source's, or leaves the index if the source doesn't have it.
 */
export function resetIndexPaths(
  ws: Workspace,
  paths: readonly string[],
  source: FileSnapshot,
): string[] {
  const repo = ws.requireRepo();
  const changed: string[] = [];
  for (const path of paths) {
    const before = repo.indexEntries().get(path);
    const target = source.get(path);
    if (target === before) continue;
    if (target === undefined) repo.removeFromIndex(path);
    else repo.setIndexEntry(path, target);
    changed.push(path);
  }
  if (changed.length > 0) ws.events.emit({ type: 'unstaged', paths: changed });
  return changed;
}

/** Makes working-directory files match `source`, deleting files the source doesn't have. */
export function resetWorkingPaths(
  ws: Workspace,
  paths: readonly string[],
  source: FileSnapshot,
): void {
  const repo = ws.requireRepo();
  for (const path of paths) {
    const target = source.get(path);
    if (target !== undefined) ws.writeFile(path, repo.readBlob(target));
    else if (ws.fs.isFile(path)) ws.deleteFile(path);
  }
}
