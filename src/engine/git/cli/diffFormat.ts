import { buildHunks, countChanges, diffLines, splitLines, type Hunk } from '../diff';
import { shortId } from '../hash';
import type { ObjectId } from '../types';
import { line, type OutputLine } from './output';

/** One side of a file comparison: its content and blob id, or null if the file doesn't exist there. */
export interface Side {
  readonly id: ObjectId;
  readonly content: string;
}

export interface FileChange {
  readonly oldPath: string;
  readonly newPath: string;
  readonly before: Side | null;
  readonly after: Side | null;
}

const NULL_ID = '0000000';
const MODE = '100644';

/** Pairs up files that differ between two snapshots, detecting exact-content renames. */
export function compareSides(
  before: ReadonlyMap<string, Side>,
  after: ReadonlyMap<string, Side>,
  detectRenames: boolean,
): FileChange[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: FileChange[] = [];
  for (const path of paths) {
    const oldSide = before.get(path) ?? null;
    const newSide = after.get(path) ?? null;
    if (oldSide?.id !== newSide?.id) {
      changes.push({ oldPath: path, newPath: path, before: oldSide, after: newSide });
    }
  }
  if (!detectRenames) return changes;

  const deleted = changes.filter((change) => change.after === null);
  const added = changes.filter((change) => change.before === null);
  const renamed: FileChange[] = [];
  const used = new Set<FileChange>();
  for (const gone of deleted) {
    const match = added.find(
      (arrival) => !used.has(arrival) && arrival.after?.id === gone.before?.id,
    );
    if (!match) continue;
    used.add(match).add(gone);
    renamed.push({
      oldPath: gone.oldPath,
      newPath: match.newPath,
      before: gone.before,
      after: match.after,
    });
  }
  return [...changes.filter((change) => !used.has(change)), ...renamed].sort((a, b) =>
    a.newPath < b.newPath ? -1 : 1,
  );
}

function range(start: number, count: number): string {
  return count === 1 ? String(start) : `${String(start)},${String(count)}`;
}

function hunkLines(hunk: Hunk): OutputLine[] {
  const out = [
    line(
      `@@ -${range(hunk.oldStart, hunk.oldCount)} +${range(hunk.newStart, hunk.newCount)} @@`,
      'hunk',
    ),
  ];
  for (const diffLine of hunk.lines) {
    const tone = diffLine.kind === '+' ? 'added' : diffLine.kind === '-' ? 'removed' : 'plain';
    const endsLine = diffLine.text.endsWith('\n');
    out.push(
      line(`${diffLine.kind}${endsLine ? diffLine.text.slice(0, -1) : diffLine.text}`, tone),
    );
    if (!endsLine) out.push(line('\\ No newline at end of file', 'meta'));
  }
  return out;
}

/** The full `diff --git` block for one file, exactly as git prints it. */
export function formatFileChange(change: FileChange): OutputLine[] {
  const { oldPath, newPath, before, after } = change;
  const out = [line(`diff --git a/${oldPath} b/${newPath}`, 'meta')];

  if (before && after && oldPath !== newPath) {
    out.push(line('similarity index 100%', 'meta'));
    out.push(line(`rename from ${oldPath}`, 'meta'), line(`rename to ${newPath}`, 'meta'));
    if (before.id === after.id) return out;
  }
  if (!before) out.push(line(`new file mode ${MODE}`, 'meta'));
  if (!after) out.push(line(`deleted file mode ${MODE}`, 'meta'));
  const oldId = before ? shortId(before.id) : NULL_ID;
  const newId = after ? shortId(after.id) : NULL_ID;
  out.push(line(`index ${oldId}..${newId}${before && after ? ` ${MODE}` : ''}`, 'meta'));
  out.push(line(before ? `--- a/${oldPath}` : '--- /dev/null', 'meta'));
  out.push(line(after ? `+++ b/${newPath}` : '+++ /dev/null', 'meta'));

  const script = diffLines(splitLines(before?.content ?? ''), splitLines(after?.content ?? ''));
  buildHunks(script).forEach((hunk) => out.push(...hunkLines(hunk)));
  return out;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** " 2 files changed, 3 insertions(+), 1 deletion(-)" with git's rules for omitting zeros. */
export function changeSummary(files: number, insertions: number, deletions: number): string {
  const parts = [` ${plural(files, 'file')} changed`];
  if (insertions > 0 || deletions === 0) parts.push(`${plural(insertions, 'insertion')}(+)`);
  if (deletions > 0 || insertions === 0) parts.push(`${plural(deletions, 'deletion')}(-)`);
  return parts.join(', ');
}

export function lineCounts(change: FileChange): { insertions: number; deletions: number } {
  return countChanges(change.before?.content ?? '', change.after?.content ?? '');
}

/** `--stat`: one line per file with a +/- bar, then the summary line. */
export function formatStat(changes: readonly FileChange[]): OutputLine[] {
  if (changes.length === 0) return [];
  const rows = changes.map((change) => {
    const counts = lineCounts(change);
    const name =
      change.oldPath === change.newPath ? change.newPath : `${change.oldPath} => ${change.newPath}`;
    return { name, ...counts, total: counts.insertions + counts.deletions };
  });
  const nameWidth = Math.max(...rows.map((row) => row.name.length));
  const countWidth = Math.max(...rows.map((row) => String(row.total).length));
  const out = rows.map((row) =>
    line(
      ` ${row.name.padEnd(nameWidth)} | ${String(row.total).padStart(countWidth)} ${'+'.repeat(Math.min(row.insertions, 50))}${'-'.repeat(Math.min(row.deletions, 50))}`.trimEnd(),
    ),
  );
  const insertions = rows.reduce((sum, row) => sum + row.insertions, 0);
  const deletions = rows.reduce((sum, row) => sum + row.deletions, 0);
  out.push(line(changeSummary(rows.length, insertions, deletions)));
  return out;
}
