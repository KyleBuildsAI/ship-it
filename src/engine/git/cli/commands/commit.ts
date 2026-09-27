import type { Workspace } from '../../../workspace';
import { shortId } from '../../hash';
import { parseArgs } from '../args';
import { changeSummary, compareSides, lineCounts } from '../diffFormat';
import { subjectOf } from '../logFormat';
import { failure, fatal, line, ok, type CommandResult, type OutputLine } from '../output';
import type { CommandContext } from '../pathspec';
import { snapshotSides } from '../revisions';
import { stagePaths } from '../staging';
import { statusCommand } from './status';

function sameFiles(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  return a.size === b.size && [...a].every(([path, id]) => b.get(path) === id);
}

/**
 * `git commit`: seal what's on the Loading Dock into a new snapshot in the Vault.
 * `-m` gives the message (several -m flags become paragraphs), `-a` first stages every
 * tracked file's edits and deletions, which is exactly why it can surprise you.
 */
export function commitCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['m', 'message'], takesValue: true },
    { names: ['a', 'all'] },
    { names: ['allow-empty'] },
    { names: ['q', 'quiet'] },
  ]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);

  const repo = ws.requireRepo();
  const messages = args.values.get('m');
  if (messages === undefined) {
    return failure([
      line('error: the sandbox has no text editor for commit messages', 'error'),
      line('hint: write the message inline: git commit -m "feat: describe the change"', 'hint'),
    ]);
  }
  const message = messages
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '')
    .join('\n\n');
  if (message === '') {
    return failure([line('Aborting commit due to empty commit message.', 'error')]);
  }

  if (args.flags.has('a')) stagePaths(ws, [...repo.indexEntries().keys()]);

  const parentFiles = repo.headFiles();
  if (sameFiles(parentFiles, repo.indexEntries()) && !args.flags.has('allow-empty')) {
    // Like real git, explain the situation with the same text `git status` prints.
    const status = statusCommand(ws, ctx, []).lines.map((output) =>
      output.text === 'No commits yet' ? line('Initial commit') : output,
    );
    return failure(status);
  }

  const branch = repo.currentBranch();
  const from = repo.headCommitId();
  const commit = repo.commitIndex(message);
  ws.events.emit({ type: 'committed', commit, branch });
  if (branch !== null) ws.events.emit({ type: 'branchMoved', branch, from, to: commit.id });
  ws.events.emit({ type: 'headMoved', from, to: commit.id, reason: 'commit' });
  if (args.flags.has('q')) return ok();

  const changes = compareSides(
    snapshotSides(repo, parentFiles),
    snapshotSides(repo, commit.files),
    true,
  );
  const counts = changes.map(lineCounts);
  const out: OutputLine[] = [
    line(
      `[${branch ?? 'detached HEAD'}${from === null ? ' (root-commit)' : ''} ${shortId(commit.id)}] ${subjectOf(commit)}`,
    ),
  ];
  if (changes.length > 0) {
    out.push(
      line(
        changeSummary(
          changes.length,
          counts.reduce((sum, count) => sum + count.insertions, 0),
          counts.reduce((sum, count) => sum + count.deletions, 0),
        ),
      ),
    );
  }
  for (const change of changes) {
    if (change.before === null) out.push(line(` create mode 100644 ${change.newPath}`));
    else if (change.after === null) out.push(line(` delete mode 100644 ${change.oldPath}`));
    else if (change.oldPath !== change.newPath) {
      out.push(line(` rename ${change.oldPath} => ${change.newPath} (100%)`));
    }
  }
  return ok(out);
}
