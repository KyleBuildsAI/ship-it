import { shortId } from '../../engine/git/hash';
import type { Repository } from '../../engine/git/repository';
import type { ObjectId } from '../../engine/git/types';

export interface PlatformSpec {
  readonly id: ObjectId;
  readonly label: string;
  /** Steps from the first commit along first parents: how far along the path it floats. */
  readonly depth: number;
  /** 0 for history a branch or HEAD can reach; 1 for commits only the reflog remembers. */
  readonly lane: 0 | 1;
  readonly parent: ObjectId | null;
}

export interface HistorySpec {
  readonly platforms: readonly PlatformSpec[];
  readonly banners: readonly { readonly branch: string; readonly commit: ObjectId }[];
  readonly head: { readonly commit: ObjectId | null; readonly detached: boolean };
  /** Commits HEAD has visited, newest first, without repeats: the reflog as footprints. */
  readonly footprints: readonly ObjectId[];
}

const MAX_SUBJECT = 26;

function subject(message: string): string {
  const first = message.split('\n')[0] ?? '';
  return first.length > MAX_SUBJECT ? `${first.slice(0, MAX_SUBJECT - 1)}…` : first;
}

/** Every commit reachable from `starts` through parents. */
function reachable(repo: Repository, starts: Iterable<ObjectId>): Set<ObjectId> {
  const seen = new Set<ObjectId>();
  const queue = [...starts];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(repo.getCommit(id)?.parents ?? []));
  }
  return seen;
}

/**
 * Turns the repository into what the commit path shows: one platform per commit, banners
 * on branch tips, where HEAD stands, and the reflog's footprints. Commits that no branch
 * or HEAD can reach (after a `reset --hard`) drift to a side lane: still there, still
 * recoverable, just no longer on the main road.
 */
export function describeHistory(repo: Repository): HistorySpec {
  const headCommit = repo.headCommitId();
  const tips = repo.branchNames().flatMap((branch) => {
    const tip = repo.branchTip(branch);
    return tip === undefined ? [] : [tip];
  });
  const mainRoad = reachable(repo, headCommit === null ? tips : [...tips, headCommit]);

  const depthCache = new Map<ObjectId, number>();
  const depthOf = (id: ObjectId): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const parent = repo.getCommit(id)?.parents[0];
    const depth = parent === undefined ? 0 : depthOf(parent) + 1;
    depthCache.set(id, depth);
    return depth;
  };

  const platforms = [...repo.allCommitIds()]
    .map((id): PlatformSpec => {
      const commit = repo.getCommit(id);
      return {
        id,
        label: `${shortId(id)} ${subject(commit?.message ?? '')}`,
        depth: depthOf(id),
        lane: mainRoad.has(id) ? 0 : 1,
        parent: commit?.parents[0] ?? null,
      };
    })
    .sort((a, b) => a.depth - b.depth || a.lane - b.lane || (a.id < b.id ? -1 : 1));

  const banners = repo.branchNames().flatMap((branch) => {
    const commit = repo.branchTip(branch);
    return commit === undefined ? [] : [{ branch, commit }];
  });

  const footprints: ObjectId[] = [];
  for (const entry of repo.reflog()) {
    if (!footprints.includes(entry.to)) footprints.push(entry.to);
  }

  return {
    platforms,
    banners,
    head: { commit: headCommit, detached: repo.getHead().kind === 'detached' },
    footprints,
  };
}
