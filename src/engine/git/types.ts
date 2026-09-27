/** A 40-character hex id for a blob or commit. */
export type ObjectId = string;

/** A repo-relative file path mapped to the blob that holds its content. */
export type FileSnapshot = ReadonlyMap<string, ObjectId>;

export interface Signature {
  readonly name: string;
  readonly email: string;
}

export interface Commit {
  readonly id: ObjectId;
  /** Zero parents for the first commit, one normally, two for a merge. */
  readonly parents: readonly ObjectId[];
  readonly message: string;
  readonly author: Signature;
  /** Milliseconds since the Unix epoch, from the injected clock. */
  readonly timestamp: number;
  /** Every tracked file at this commit. Real git stores trees; a flat map is enough here. */
  readonly files: FileSnapshot;
}

/**
 * Where HEAD points. Normally at a branch (which points at a commit). "Detached" means
 * HEAD points straight at a commit, so new commits belong to no branch.
 */
export type Head =
  | { readonly kind: 'branch'; readonly name: string }
  | { readonly kind: 'detached'; readonly commit: ObjectId };

/** One line of `git reflog`: HEAD moved from one commit to another, and why. */
export interface ReflogEntry {
  readonly from: ObjectId | null;
  readonly to: ObjectId;
  readonly message: string;
  readonly timestamp: number;
}
