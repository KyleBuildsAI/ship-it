import type { Workspace } from '../../workspace';
import type { Repository } from '../repository';
import { RevisionError } from '../revparse';
import type { FileSnapshot, ObjectId } from '../types';
import type { Side } from './diffFormat';
import { fatal, line, type CommandResult } from './output';

/** Git's wording for a revision it can't find, depending on why. */
export function revisionFailure(repo: Repository, error: RevisionError): CommandResult {
  if (error.kind === 'unborn') {
    const branch = repo.currentBranch() ?? 'HEAD';
    return fatal(`your current branch '${branch}' does not have any commits yet`);
  }
  const ambiguous: CommandResult = {
    lines: [
      line(
        `fatal: ambiguous argument '${error.revision}': unknown revision or path not in the working tree.`,
        'error',
      ),
      line("Use '--' to separate paths from revisions, like this:", 'hint'),
      line("'git <command> [<revision>...] -- [<file>...]'", 'hint'),
    ],
    exitCode: 128,
  };
  if (error.kind === 'ambiguous') {
    return {
      ...ambiguous,
      lines: [
        line(`error: short object ID ${error.revision} is ambiguous`, 'error'),
        ...ambiguous.lines,
      ],
    };
  }
  return ambiguous;
}

/** Resolves a revision, or explains in git's words why it can't. */
export function resolveOrExplain(repo: Repository, revision: string): ObjectId | CommandResult {
  try {
    return repo.resolve(revision);
  } catch (error) {
    if (error instanceof RevisionError) return revisionFailure(repo, error);
    throw error;
  }
}

/** Blob contents for every file in a snapshot (a commit or the index). */
export function snapshotSides(repo: Repository, files: FileSnapshot): Map<string, Side> {
  return new Map([...files].map(([path, id]) => [path, { id, content: repo.readBlob(id) }]));
}

/** Current working-directory contents for the given paths; missing files are left out. */
export function workingSides(ws: Workspace, paths: Iterable<string>): Map<string, Side> {
  const repo = ws.requireRepo();
  const sides = new Map<string, Side>();
  for (const path of paths) {
    if (!ws.fs.isFile(path)) continue;
    const content = ws.fs.readFile(path);
    sides.set(path, { id: repo.idFor(content), content });
  }
  return sides;
}
