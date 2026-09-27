import { normalizePaste } from './normalize';
import { splitRename, unquotePath } from './quoting';

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'typechange';

/** One file under "Changes to be committed" or "Changes not staged for commit". */
export interface StatusChange {
  readonly kind: ChangeKind;
  readonly path: string;
  /** For a rename, the name the file had before. */
  readonly from?: string;
}

/** How a file conflicts during a merge or rebase, in git's own words. */
export type ConflictKind =
  | 'both modified'
  | 'both added'
  | 'both deleted'
  | 'added by us'
  | 'added by them'
  | 'deleted by us'
  | 'deleted by them';

const CONFLICT_KINDS: readonly ConflictKind[] = [
  'both modified',
  'both added',
  'both deleted',
  'added by us',
  'added by them',
  'deleted by us',
  'deleted by them',
];

export interface ConflictEntry {
  readonly kind: ConflictKind;
  readonly path: string;
}

export type UpstreamState = 'up-to-date' | 'ahead' | 'behind' | 'diverged' | 'gone';

/** The "Your branch is ahead of 'origin/main' by 2 commits." line, as data. */
export interface UpstreamStatus {
  /** The remote branch this one tracks, like `origin/main`. */
  readonly name: string;
  readonly state: UpstreamState;
  /** Commits here that the upstream doesn't have yet (waiting to be pushed). */
  readonly ahead: number;
  /** Commits on the upstream that aren't here yet (waiting to be pulled). */
  readonly behind: number;
}

export interface ParsedStatusLong {
  readonly format: 'long';
  /** The checked-out branch, or null when HEAD is detached or the paste never said. */
  readonly branch: string | null;
  /** What `HEAD detached at abc1234` (or `detached from`) names, else null. */
  readonly detachedAt: string | null;
  readonly noCommitsYet: boolean;
  readonly upstream: UpstreamStatus | null;
  /** The Loading Dock: what the next commit will record. */
  readonly staged: readonly StatusChange[];
  /** The Workbench: edits to tracked files that aren't staged. */
  readonly unstaged: readonly StatusChange[];
  readonly untracked: readonly string[];
  /** Files with merge conflicts ("Unmerged paths"). */
  readonly unmerged: readonly ConflictEntry[];
  /** Files a .gitignore hides, listed only by `git status --ignored`. */
  readonly ignored: readonly string[];
  /**
   * True only when git said the tree is clean, no file was listed, and every line was
   * understood. A paste we can't fully read never counts as clean.
   */
  readonly clean: boolean;
  /**
   * Lines the parser didn't recognize, including merge and rebase progress messages.
   * They never crash the parser; the mission screen can show them instead.
   */
  readonly warnings: readonly string[];
}

type Section = 'staged' | 'unstaged' | 'untracked' | 'unmerged' | 'ignored';

/** The same shape as ParsedStatusLong, but writable while the lines are read. */
interface Draft {
  branch: string | null;
  detachedAt: string | null;
  noCommitsYet: boolean;
  upstream: UpstreamStatus | null;
  staged: StatusChange[];
  unstaged: StatusChange[];
  untracked: string[];
  unmerged: ConflictEntry[];
  ignored: string[];
  sawCleanSummary: boolean;
  warnings: string[];
}

const SECTION_HEADERS: ReadonlyMap<string, Section> = new Map([
  ['Changes to be committed:', 'staged'],
  ['Changes not staged for commit:', 'unstaged'],
  ['Untracked files:', 'untracked'],
  ['Unmerged paths:', 'unmerged'],
  ['Ignored files:', 'ignored'],
]);

const CHANGE_KINDS: Readonly<Record<string, ChangeKind>> = {
  'new file': 'added',
  modified: 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
  typechange: 'typechange',
};
const CHANGE_LINE = /^(new file|modified|deleted|renamed|typechange):\s+(.+)$/;

// Git's advice lines, like `  (use "git add <file>..." to update what will be committed)`.
// They are indented two spaces at most, while file lines start with a tab.
const HINT = /^ {0,2}\(.*\)$/;

// Summaries that prove there is nothing to commit. The bare form appears when hints are off.
const CLEAN_SUMMARIES = [
  /^nothing to commit, working (?:tree|directory) clean$/,
  /^nothing to commit \(create\/copy files and use "git add" to track\)$/,
  /^nothing to commit$/,
];

// Lines git prints that need no action here. "Untracked files not listed" is shown by
// `git status -uno`, which hides untracked files, so it must not count as clean.
const INFORMATIONAL = [
  /^nothing added to commit but untracked files present(?: \(use "git add" to track\))?$/,
  /^no changes added to commit(?: \(use "git add" and\/or "git commit -a"\))?$/,
  /^nothing to commit \(use -u to show untracked files\)$/,
  /^Untracked files not listed(?: \(use -u option to show untracked files\))?$/,
  /^Not currently on any branch\.$/,
];

const upstream = (
  name: string,
  state: UpstreamState,
  ahead: number,
  behind: number,
): UpstreamStatus => ({ name, state, ahead, behind });

/** Top-level lines that set a fact about the branch, each with what it means. */
const BRANCH_FACTS: readonly {
  readonly pattern: RegExp;
  readonly apply: (match: RegExpExecArray, draft: Draft, line: string) => void;
}[] = [
  {
    pattern: /^On branch (.+)$/,
    apply: ([, name = ''], draft) => {
      draft.branch = name;
    },
  },
  {
    pattern: /^HEAD detached (?:at|from) (.+)$/,
    apply: ([, target = ''], draft) => {
      draft.detachedAt = target;
    },
  },
  {
    // "Initial commit" is how git before 2.17 said "No commits yet".
    pattern: /^(?:No commits yet|Initial commit)$/,
    apply: (_match, draft) => {
      draft.noCommitsYet = true;
    },
  },
  {
    // Git before 2.15 spelled it "up-to-date".
    pattern: /^Your branch is up[ -]to[ -]date with '(.+)'\.$/,
    apply: ([, name = ''], draft) => {
      draft.upstream = upstream(name, 'up-to-date', 0, 0);
    },
  },
  {
    pattern: /^Your branch is ahead of '(.+)' by (\d+) commits?\.$/,
    apply: ([, name = '', count], draft) => {
      draft.upstream = upstream(name, 'ahead', Number(count), 0);
    },
  },
  {
    pattern: /^Your branch is behind '(.+)' by (\d+) commits?, and can be fast-forwarded\.$/,
    apply: ([, name = '', count], draft) => {
      draft.upstream = upstream(name, 'behind', 0, Number(count));
    },
  },
  {
    pattern: /^Your branch is based on '(.+)', but the upstream is gone\.$/,
    apply: ([, name = ''], draft) => {
      draft.upstream = upstream(name, 'gone', 0, 0);
    },
  },
  {
    // Diverging takes two lines. This first one names the upstream...
    pattern: /^Your branch and '(.+)' have diverged,$/,
    apply: ([, name = ''], draft) => {
      draft.upstream = upstream(name, 'diverged', 0, 0);
    },
  },
  {
    // ...and this second one gives the counts.
    pattern: /^and have (\d+) and (\d+) different commits each, respectively\.$/,
    apply: ([, ahead, behind], draft, line) => {
      if (draft.upstream?.state === 'diverged') {
        draft.upstream = upstream(draft.upstream.name, 'diverged', Number(ahead), Number(behind));
      } else {
        draft.warnings.push(line);
      }
    },
  },
];

/** Applies the first branch fact that matches `line`. False if none did. */
function applyBranchFact(draft: Draft, line: string): boolean {
  for (const fact of BRANCH_FACTS) {
    const match = fact.pattern.exec(line);
    if (match) {
      fact.apply(match, draft, line);
      return true;
    }
  }
  return false;
}

/** Reads `modified:   app.ts` or `renamed:    old -> new`. */
function parseChange(text: string): StatusChange | null {
  const match = CHANGE_LINE.exec(text);
  const kind = CHANGE_KINDS[match?.[1] ?? ''];
  const rest = match?.[2];
  if (kind === undefined || rest === undefined) return null;
  const pair = kind === 'renamed' ? splitRename(rest) : null;
  return pair ? { kind, path: pair.to, from: pair.from } : { kind, path: unquotePath(rest) };
}

/** Reads `both modified:   app.ts` and git's other conflict labels. */
function parseConflict(text: string): ConflictEntry | null {
  const kind = CONFLICT_KINDS.find((label) => text.startsWith(`${label}:`));
  const path = kind === undefined ? '' : text.slice(kind.length + 1).trim();
  return kind === undefined || path === '' ? null : { kind, path: unquotePath(path) };
}

function addEntry(draft: Draft, section: Section, line: string): void {
  const text = line.trim();
  switch (section) {
    case 'untracked':
    case 'ignored':
      draft[section].push(unquotePath(text));
      return;
    case 'unmerged': {
      const conflict = parseConflict(text);
      if (conflict) draft.unmerged.push(conflict);
      else draft.warnings.push(line);
      return;
    }
    case 'staged':
    case 'unstaged': {
      const change = parseChange(text);
      if (change) draft[section].push(change);
      else draft.warnings.push(line);
      return;
    }
  }
}

/** True for any line that only the long `git status` format prints. */
export function isStatusLongLine(line: string): boolean {
  return (
    SECTION_HEADERS.has(line) ||
    BRANCH_FACTS.some((fact) => fact.pattern.test(line)) ||
    [...CLEAN_SUMMARIES, ...INFORMATIONAL].some((pattern) => pattern.test(line))
  );
}

/**
 * Parses the default `git status` output. Pasted terminal noise (prompt, colors, CRLF,
 * tabs turned into spaces) is removed first; see normalizePaste.
 */
export function parseStatusLong(text: string): ParsedStatusLong {
  const draft: Draft = {
    branch: null,
    detachedAt: null,
    noCommitsYet: false,
    upstream: null,
    staged: [],
    unstaged: [],
    untracked: [],
    unmerged: [],
    ignored: [],
    sawCleanSummary: false,
    warnings: [],
  };
  let section: Section | null = null;

  for (const line of normalizePaste(text).lines) {
    if (line === '') {
      // A blank line always ends a section.
      section = null;
      continue;
    }
    // Advice for humans, not state.
    if (HINT.test(line)) continue;
    if (section !== null && /^\s/.test(line)) {
      addEntry(draft, section, line);
      continue;
    }
    const header = SECTION_HEADERS.get(line);
    if (header !== undefined) {
      section = header;
      continue;
    }
    if (CLEAN_SUMMARIES.some((pattern) => pattern.test(line))) {
      draft.sawCleanSummary = true;
      continue;
    }
    if (applyBranchFact(draft, line)) continue;
    if (INFORMATIONAL.some((pattern) => pattern.test(line))) continue;
    // Some copies lose the tab in front of file lines, so an unindented line inside a
    // section is still read as a file. Anywhere else, it's a line we don't know.
    if (section !== null) addEntry(draft, section, line);
    else draft.warnings.push(line);
  }

  const { sawCleanSummary, ...facts } = draft;
  const listed =
    facts.staged.length + facts.unstaged.length + facts.untracked.length + facts.unmerged.length;
  return {
    format: 'long',
    ...facts,
    clean: sawCleanSummary && listed === 0 && facts.warnings.length === 0,
  };
}
