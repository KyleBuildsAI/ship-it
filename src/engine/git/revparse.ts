import type { Commit, ObjectId, ReflogEntry } from './types';

export type RevisionErrorKind = 'unknown' | 'unborn' | 'ambiguous' | 'no-such-parent';

/** Why a revision like `HEAD~3` couldn't be resolved. The CLI turns this into git's wording. */
export class RevisionError extends Error {
  readonly kind: RevisionErrorKind;
  readonly revision: string;

  constructor(kind: RevisionErrorKind, revision: string) {
    super(`${kind}: ${revision}`);
    this.name = 'RevisionError';
    this.kind = kind;
    this.revision = revision;
  }
}

/** The read-only view of a repository that revision parsing needs. */
export interface RevisionContext {
  headCommitId: () => ObjectId | null;
  branchTip: (name: string) => ObjectId | undefined;
  getCommit: (id: ObjectId) => Commit | undefined;
  allCommitIds: () => Iterable<ObjectId>;
  /** Newest first, like `git reflog`. */
  reflog: () => readonly ReflogEntry[];
}

const MIN_SHORT_ID = 4;

/**
 * Resolves the revision syntax the curriculum teaches: HEAD, @, branch names, full or
 * short ids, `~N` (N first-parents back), `^N` (Nth parent), and `HEAD@{N}` (reflog).
 */
export function resolveRevision(context: RevisionContext, revision: string): ObjectId {
  const match = /^(.*?)((?:[~^]\d*)*)$/.exec(revision);
  const base = match?.[1] ?? revision;
  const suffixes = match?.[2] ?? '';
  let id = resolveBase(context, base, revision);

  for (const [, operator, digits] of suffixes.matchAll(/([~^])(\d*)/g)) {
    const count = digits === undefined || digits === '' ? 1 : Number(digits);
    if (operator === '~') {
      for (let step = 0; step < count; step++) id = parentOf(context, id, 0, revision);
    } else if (count > 0) {
      id = parentOf(context, id, count - 1, revision);
    }
  }
  return id;
}

function resolveBase(context: RevisionContext, base: string, revision: string): ObjectId {
  if (base === 'HEAD' || base === '@') {
    const head = context.headCommitId();
    if (head === null) throw new RevisionError('unborn', revision);
    return head;
  }

  const reflogMatch = /^(?:HEAD|@)@\{(\d+)\}$/.exec(base);
  if (reflogMatch) {
    const entry = context.reflog()[Number(reflogMatch[1])];
    if (!entry) throw new RevisionError('unknown', revision);
    return entry.to;
  }

  const branch = context.branchTip(base);
  if (branch !== undefined) return branch;

  if (/^[0-9a-f]+$/i.test(base) && base.length >= MIN_SHORT_ID) {
    const prefix = base.toLowerCase();
    const matches = [...context.allCommitIds()].filter((id) => id.startsWith(prefix));
    if (matches.length > 1) throw new RevisionError('ambiguous', revision);
    if (matches[0] !== undefined) return matches[0];
  }
  throw new RevisionError('unknown', revision);
}

function parentOf(
  context: RevisionContext,
  id: ObjectId,
  index: number,
  revision: string,
): ObjectId {
  const parent = context.getCommit(id)?.parents[index];
  if (parent === undefined) throw new RevisionError('no-such-parent', revision);
  return parent;
}
