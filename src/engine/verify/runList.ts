import { normalizePaste } from './normalize';

/**
 * One GitHub Actions run, as `gh run list` reports it. `status` is where the run is
 * (`queued`, `in_progress`, `completed`), and `conclusion` is how a completed run ended
 * (`success`, `failure`, `cancelled`, ...), empty while it's still going.
 */
export interface WorkflowRun {
  readonly status: string;
  readonly conclusion: string;
  /** The branch the run checked, when the paste says. The table view doesn't. */
  readonly branch: string | null;
}

// What `gh run list` puts first on a line when its output isn't a terminal, for example
// when an agent runs it: the columns are then separated by tabs and spelled out.
const RUN_STATUSES = new Set([
  'queued',
  'in_progress',
  'completed',
  'requested',
  'waiting',
  'pending',
  'action_required',
]);

// In a terminal, gh draws the status as one symbol at the start of each row instead.
// Windows fonts sometimes turn the tick into a square-root sign, so both count.
const TABLE_SYMBOLS: Record<string, { status: string; conclusion: string }> = {
  '✓': { status: 'completed', conclusion: 'success' },
  '✔': { status: 'completed', conclusion: 'success' },
  '√': { status: 'completed', conclusion: 'success' },
  X: { status: 'completed', conclusion: 'failure' },
  '✗': { status: 'completed', conclusion: 'failure' },
  '-': { status: 'completed', conclusion: 'cancelled' },
  '*': { status: 'in_progress', conclusion: '' },
};

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Runs from `gh run list --json status,conclusion,headBranch`, or null if it isn't JSON. */
function fromJson(text: string): WorkflowRun[] | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    // Brackets that aren't JSON, like "[skip ci]" in a run title: read it as a table.
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed
    .filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    )
    .map((entry) => ({
      status: textField(entry.status),
      conclusion: textField(entry.conclusion),
      branch: typeof entry.headBranch === 'string' ? entry.headBranch : null,
    }));
}

function fromLine(line: string): WorkflowRun | null {
  const columns = line.split('\t');
  const [first = '', conclusion = ''] = columns;
  if (columns.length > 2 && RUN_STATUSES.has(first)) {
    // status, conclusion, title, workflow, branch, event, id, elapsed, age
    return { status: first, conclusion, branch: columns[4] ?? null };
  }
  const symbol = TABLE_SYMBOLS[line.trim().split(/\s+/)[0] ?? ''];
  return symbol === undefined ? null : { ...symbol, branch: null };
}

/**
 * Reads a pasted `gh run list`, newest run first, in any of the shapes gh prints: JSON
 * (with --json), tab-separated columns (when piped, as an agent sees it), or the table a
 * terminal shows. Lines that are none of these, like the copied prompt or the table's
 * header, are skipped. An empty list means no run was pasted.
 */
export function parseRunList(text: string): WorkflowRun[] {
  const { lines } = normalizePaste(text);
  const json = fromJson(lines.join('\n'));
  if (json !== null) return json;
  return lines.map(fromLine).filter((run): run is WorkflowRun => run !== null);
}

/** True when a run finished and passed: the green check on GitHub. */
export function isGreenRun(run: WorkflowRun): boolean {
  return run.status === 'completed' && run.conclusion === 'success';
}
