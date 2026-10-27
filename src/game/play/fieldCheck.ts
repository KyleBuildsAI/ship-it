import {
  buildOutputToIgnore,
  commitType,
  conventionalRatio,
  detectPasteKind,
  documentedRequest,
  findSecretLike,
  firstTracked,
  headingProblems,
  isCleanStatus,
  isConventionalSubject,
  isFromFile,
  isGreenRun,
  isPullRequestSubject,
  isSquashMergedSubject,
  isTypedBranchName,
  looksLikePathList,
  matchesPathPattern,
  newestWrittenCommit,
  normalizePaste,
  parseLogGraph,
  parseLogOneline,
  parseMarkdownHeadings,
  parsePathList,
  parseRunList,
  parseSelectString,
  parseStatusLong,
  parseStatusShort,
  readTopMerge,
  searchesAllHistoryFor,
  statusPosition,
  trackedSecretPaths,
  unpushedCommits,
  type ParsedStatus,
  type UpstreamState,
} from '../../engine/verify';
import type { FieldCheck, FieldMission } from '../missions/schema';

/** One paste check from a Field Mission (DESIGN.md section 8). */
export type Verification = FieldMission['verifications'][number];

export interface FieldVerdict {
  readonly passed: boolean;
  /** What the game tells the player, pass or fail, in plain words. */
  readonly message: string;
  /** True when the paste held something secret-like, so the view must clear it. */
  readonly clearPaste?: boolean;
}

const PARSER_NAMES = {
  'status-short': 'git status --short',
  'status-long': 'git status',
  'log-oneline': 'git log --oneline',
  'ls-files': 'git ls-files',
  'select-string': 'Select-String',
} as const;

// A tracked secret may already be on GitHub, and lessons 5.4 and 6.2 teach that a pushed
// secret counts as stolen, so untracking alone is never the whole fix.
const UNTRACK_SECRETS =
  'Untrack with git rm --cached, then commit. If a secret file was ever pushed, change every key in it first: a pushed secret counts as stolen.';

function fail(message: string): FieldVerdict {
  return { passed: false, message };
}

/** True when `path` is one of `patterns`, or sits inside one that names a folder (`dist/`). */
function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('/') ? path.startsWith(pattern) : matchesPathPattern(path, pattern),
  );
}

function parseStatus(text: string): ParsedStatus | null {
  const kind = detectPasteKind(text);
  if (kind === 'status-short') return parseStatusShort(text);
  if (kind === 'status-long') return parseStatusLong(text);
  return null;
}

/** Visible paths in a status paste that match one of the ignore patterns, like `dist/`. */
function unignored(status: ParsedStatus, patterns: readonly string[]): string[] {
  const paths =
    status.format === 'short'
      ? // `!!` marks a file git ignores, which is exactly what this check wants to see.
        status.entries.filter((entry) => entry.index !== '!').map((entry) => entry.path)
      : [...status.untracked, ...status.staged.map((change) => change.path)];
  return paths.filter((path) =>
    patterns.some((pattern) =>
      pattern.endsWith('/')
        ? path === pattern || path.startsWith(pattern) || `${path}/` === pattern
        : path === pattern || path.endsWith(`/${pattern}`),
    ),
  );
}

/** Whether the `pushed` half of a clean check passes: nothing waits to go to GitHub. */
function checkPushed(status: ParsedStatus): FieldVerdict {
  const waiting = unpushedCommits(status);
  if (waiting === null) {
    return fail(
      'Committed, but this paste can’t show the push. Run the command exactly as shown, with -sb, on a branch that tracks GitHub.',
    );
  }
  return waiting === 0
    ? { passed: true, message: 'Committed and pushed: GitHub has it.' }
    : fail(
        `Committed, not pushed: ${String(waiting)} commit${waiting === 1 ? '' : 's'} still only on this computer. Ask your agent to push.`,
      );
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** A Select-String paste: which lines of the file name a request and a status code. */
function verifySelectString(verification: Verification, text: string): FieldVerdict {
  const { check } = verification;
  if (check.kind === 'headings') return verifyHeadings(verification, text);
  if (check.kind !== 'documentsRequest') return fail(`Run ${verification.command} and paste that.`);
  const matches = parseSelectString(text).filter((match) => isFromFile(match, check.file));
  if (matches.length === 0) {
    return fail(
      `No lines from ${check.file} in that paste. Run ${verification.command}, or ask your agent to run it and show you the exact output.`,
    );
  }
  const { request, statusCode } = documentedRequest(matches.map((match) => match.text));
  if (request === null) return fail(`${check.file} doesn't name a request like GET /health yet.`);
  if (statusCode === null) return fail(`${check.file} names ${request}, but not its status code.`);
  return { passed: true, message: `${check.file} documents ${request} and its ${statusCode}.` };
}

/** Paths as git prints them, so `docs\story.md` and `docs/story.md` are the same file. */
function samePath(a: string, b: string): boolean {
  return a.replaceAll('\\', '/') === b.replaceAll('\\', '/');
}

/** Every file a status paste lists as changed, staged, untracked or conflicted. */
function changedPaths(status: ParsedStatus): string[] {
  if (status.format === 'short') {
    return status.entries
      .filter((entry) => entry.index !== '!')
      .flatMap((entry) => [entry.path, ...(entry.originalPath ? [entry.originalPath] : [])]);
  }
  const changes = [...status.staged, ...status.unstaged];
  return [
    ...changes.flatMap((change) => [change.path, ...(change.from ? [change.from] : [])]),
    ...status.untracked,
    ...status.unmerged.map((entry) => entry.path),
  ];
}

interface LoggedTarget {
  /** The branch or commit the log starts from, like `origin/main`, when the command names one. */
  readonly revision: string | undefined;
  readonly path: string | undefined;
}

/**
 * What a `git log [<revision>] [-- <path>]` command names, for saying what an empty log
 * means. Everything after `--` is a path; before it, a word is the revision. Without
 * `--`, a lone word in these missions' commands is the file.
 */
function loggedTarget(command: string): LoggedTarget {
  const [program, subcommand, ...rest] = command.split(/\s+/);
  if (program !== 'git' || subcommand !== 'log') return { revision: undefined, path: undefined };
  const named = (words: readonly string[]) =>
    words.filter((word) => word !== '' && !word.startsWith('-'));
  const separator = rest.indexOf('--');
  if (separator === -1) return { revision: undefined, path: named(rest)[0] };
  return {
    revision: named(rest.slice(0, separator))[0],
    path: named(rest.slice(separator + 1))[0],
  };
}

/** What a paste with no output in it means for this check: sometimes a pass, usually a nudge. */
function verifyEmptyPaste(verification: Verification): FieldVerdict {
  const { check, command } = verification;
  // Some commands print nothing until the work exists, so a mission can say so itself.
  if (verification.whenEmpty !== undefined) return fail(verification.whenEmpty);
  // A status limited to some files prints nothing when those files have nothing left to
  // commit, so for a check scoped to paths, no output is the clean answer.
  if (check.kind === 'clean' && check.paths !== undefined) {
    return {
      passed: true,
      message: `Nothing printed: ${check.paths.join(' and ')} have nothing left to commit.`,
    };
  }
  const { revision, path } = loggedTarget(command);
  if (verification.parser === 'log-oneline' && path !== undefined) {
    // A log of GitHub's main (origin/main) gets its commits from a merged pull request, so
    // "commit it" would send the player straight to main.
    return fail(
      revision === undefined
        ? `No line means no commit has touched ${path} yet. Ask your agent to commit it, then run it again.`
        : `No line means ${revision} has no commit that touched ${path} yet. Merge it through a pull request, run git fetch, then run this again.`,
    );
  }
  // A clean short status prints nothing, so only the copied command line shows what ran.
  if (verification.parser === 'status-short') {
    return fail(`Copy the line where you typed ${command} along with its output.`);
  }
  return fail(`Paste the output of ${command} first.`);
}

/** The headings check: a Select-String paste shows the wanted `##` headings, in order. */
function verifyHeadings(verification: Verification, text: string): FieldVerdict {
  const { check } = verification;
  if (check.kind !== 'headings') return fail(`Run ${verification.command} and paste that.`);
  const found = parseMarkdownHeadings(text);
  if (found.length === 0) {
    return fail('No ## headings in that paste. Is the file committed, and did you copy it all?');
  }
  const { missing, outOfOrder } = headingProblems(found, check.headings);
  if (missing.length > 0) {
    return fail(`Missing: ${missing.join(', ')}. Ask your agent to add only that, and commit.`);
  }
  if (outOfOrder.length > 0) {
    return fail(
      `Out of order: ${outOfOrder.join(', ')}. The order is ${check.headings.join(', ')}.`,
    );
  }
  return { passed: true, message: `All ${String(check.headings.length)} headings, in order.` };
}

/**
 * Judges a `git log --oneline --graph` paste for a landed branch. Each failure names the
 * likely cause in plain words, since the usual one is a merge that went the wrong way
 * (a squash, a rebase, or a commit straight on main), not a typo.
 */
function verifyMerge(command: string, text: string): FieldVerdict {
  const merge = readTopMerge(parseLogGraph(text));
  switch (merge.kind) {
    case 'empty':
      return fail(`That paste shows no commits. Run ${command}.`);
    case 'not-a-merge':
      return fail(
        'The newest commit on main isn’t a merge commit. A squashed or rebased pull request leaves none, so merge with "Create a merge commit". Not merged yet? Merge it on GitHub, then git pull.',
      );
    case 'no-graph':
      return fail(
        `That paste has no graph, so the branch's commits can't be told apart. Run ${command}, with --graph.`,
      );
    case 'no-branch-commit':
      return fail(
        'That merge brought in no commit the paste shows. Paste all five lines, and make sure the branch had its own commit.',
      );
    case 'merged':
      break;
  }
  const { branch, branchCommit } = merge;
  if (branch === null) {
    return fail('That merge commit doesn’t name its branch. Merge the pull request on GitHub.');
  }
  if (!isTypedBranchName(branch)) {
    return fail(`The merged branch is "${branch}". Name branches by type, like feat/readme-fix.`);
  }
  if (!isConventionalSubject(branchCommit.subject)) {
    return fail(
      `The branch's commit "${branchCommit.subject}" isn't a Conventional Commit. Start it with a type like feat: or docs:.`,
    );
  }
  return { passed: true, message: `Main has a merge commit from ${branch}.` };
}

type CleanCheck = Extract<FieldCheck, { kind: 'clean' }>;

// What to do about each way a branch can be out of step with GitHub, in plain words.
const UPSTREAM_ADVICE: Record<UpstreamState, string> = {
  'up-to-date': '',
  behind: 'GitHub has commits you don’t have yet. Run git pull, then git status again.',
  ahead:
    'Your copy has commits GitHub doesn’t. Main should only change through merged PRs, so ask your agent to move them onto a branch.',
  diverged:
    'Your copy and GitHub’s have both moved. Ask your agent to bring them together without force, then check again.',
  gone: 'The branch this tracks is gone from GitHub. Run git fetch, then git status again.',
};

/** A short status run without -b has no `##` line, so it can't say which branch it is. */
function hidesBranch(status: ParsedStatus): boolean {
  return status.format === 'short' && status.branch === null;
}

/**
 * Clean, and, when the check asks, on the right branch, pushed, or fully in step with
 * GitHub. The branch and upstream options need the branch line, which plain `git status`
 * and `git status -sb` print but `-s` doesn't.
 */
function verifyClean(check: CleanCheck, status: ParsedStatus): FieldVerdict {
  const { paths } = check;
  if (paths !== undefined) {
    // Only the named files count, so unrelated work in progress never has to be
    // stashed, reverted or swept into a commit just to pass.
    const left = changedPaths(status).filter((path) =>
      paths.some((wanted) => samePath(path, wanted)),
    );
    return left.length === 0
      ? { passed: true, message: `${paths.join(' and ')} have nothing left to commit.` }
      : fail(`Not committed yet: ${left.join(', ')}. Ask your agent to commit only those.`);
  }
  if (!isCleanStatus(status)) {
    return fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
  }
  const needsBranch = check.branch !== undefined || check.upstream !== undefined;
  if (needsBranch && hidesBranch(status)) {
    return fail('That paste doesn’t show the branch. Paste everything plain git status prints.');
  }
  const position = statusPosition(status);
  if (check.branch !== undefined && position.branch !== check.branch) {
    const where = position.branch === null ? 'not on a branch' : `on ${position.branch}`;
    return fail(
      `Clean, but you’re ${where}. Run git switch ${check.branch}, then git pull, and check again.`,
    );
  }
  if (check.pushed === true) return checkPushed(status);
  if (check.upstream === 'up-to-date') {
    if (position.upstream === 'up-to-date') {
      return { passed: true, message: 'Clean, and in step with GitHub.' };
    }
    return fail(
      position.upstream === null
        ? 'This paste doesn’t say whether you match GitHub. Run git fetch, then git status (not -s), and paste all of it.'
        : UPSTREAM_ADVICE[position.upstream],
    );
  }
  return { passed: true, message: 'Clean: nothing left to commit.' };
}

/**
 * A history search prints nothing when it finds nothing, so an empty paste passes only
 * when the copied command line shows the right search ran.
 */
function verifyNoCommits(verification: Verification, path: string, text: string): FieldVerdict {
  const commits = parseLogOneline(text);
  if (commits.length > 0) {
    const count = commits.length === 1 ? 'A commit' : `${String(commits.length)} commits`;
    return fail(
      `${count} touched ${path}, so it is still in the history and a push would publish it. Don’t push. Change every key that file held, then ask for help removing it from history.`,
    );
  }
  const { lines, command } = normalizePaste(text);
  if (lines.some((line) => line.trim() !== '')) {
    return fail(`That doesn’t look like git log output. Run ${verification.command}.`);
  }
  if (command === null || !searchesAllHistoryFor(command, path)) {
    return fail(
      `It prints nothing when ${path} was never committed, so copy the line where you typed ${verification.command} along with it.`,
    );
  }
  return { passed: true, message: `No commit on any branch ever held ${path}. Safe to push.` };
}

/** The newest commit should be a squash-merged PR, whose title GitHub ends with (#N). */
function verifySquashMerge(subject: string): FieldVerdict {
  if (isSquashMergedSubject(subject)) {
    return { passed: true, message: `Squash-merged: “${subject}”.` };
  }
  return fail(
    subject.startsWith('Merge pull request')
      ? 'That PR was merged with a merge commit. Next time pick “Squash and merge”.'
      : 'The newest commit should be your squash-merged PR: a Conventional title ending in its number, like “fix: round tide heights (#12)”. Pull main first if you haven’t.',
  );
}

/** Checks a `git ls-files` paste, which lists every tracked file. */
function checkTrackedFiles(verification: Verification, text: string): FieldVerdict {
  const paths = parsePathList(text);
  if (paths.length === 0) return fail(`That paste lists no files. Run ${verification.command}.`);
  // Finding no secret on a list proves nothing unless the list is git's, so a summary
  // like "all clean" must fail here, before the secret check could pass it.
  if (!looksLikePathList(text)) {
    return fail(
      `That doesn't look like ${PARSER_NAMES['ls-files']} output, which is one file per line. Run ${verification.command}, or have your agent run it, and paste exactly what it prints.`,
    );
  }
  const { check } = verification;
  if (check.kind === 'tracksAny') {
    const found = firstTracked(paths, check.paths);
    return found === null
      ? fail(`Git doesn’t track ${check.paths.join(' or ')} yet. Commit it first.`)
      : { passed: true, message: `Git tracks ${found}.` };
  }
  if (check.kind === 'tracked') {
    const untracked = check.paths.filter((wanted) => !paths.some((path) => samePath(path, wanted)));
    if (untracked.length > 0) {
      return fail(`Git doesn’t track ${untracked.join(', ')} yet. Ask your agent to commit it.`);
    }
  }
  const secrets = trackedSecretPaths(paths);
  if (secrets.length > 0) {
    return fail(`Still tracked: ${secrets.join(', ')}. ${verification.advice ?? UNTRACK_SECRETS}`);
  }
  if (check.kind === 'tracksPath') {
    // Any other file on the list, even an older workflow, doesn't prove the new one exists.
    const found = paths.filter((path) => matchesAny(path, check.patterns));
    return found.length > 0
      ? { passed: true, message: `Git tracks ${found.join(', ')}.` }
      : fail(
          `${check.patterns.join(' or ')} isn't on that list yet. Commit it, then run ${verification.command} again.`,
        );
  }
  return check.kind === 'tracked'
    ? { passed: true, message: `Git tracks ${check.paths.join(' and ')}, and no secret files.` }
    : { passed: true, message: 'No secret files are tracked.' };
}

/** Checks a `gh run list` paste: GitHub's own word on whether the newest CI run went green. */
function checkRunList(verification: Verification, text: string): FieldVerdict {
  const [newest] = parseRunList(text);
  if (newest === undefined) {
    return fail(`No run in that paste. Push the workflow first, then run ${verification.command}.`);
  }
  if (isGreenRun(newest)) return { passed: true, message: 'Green on GitHub. The gate is live.' };
  return newest.status === 'completed'
    ? fail(
        `The newest run didn't go green (${newest.conclusion || 'no result'}). Open it in the Actions tab, copy the first error, and brief your agent to fix the cause.`,
      )
    : fail('That run is still going. Give it a minute, then run the command again.');
}

/** Checks a `git log --oneline` paste, with `--graph` for a merge check. */
function checkLog(verification: Verification, text: string): FieldVerdict {
  if (detectPasteKind(text) !== 'log-oneline') {
    return fail(`That doesn't look like ${PARSER_NAMES['log-oneline']} output.`);
  }
  const { check } = verification;
  if (check.kind === 'mergeCommit') return verifyMerge(verification.command, text);
  const commits = parseLogOneline(text);
  switch (check.kind) {
    case 'minCommits':
      return commits.length >= check.count
        ? { passed: true, message: `${plural(commits.length, 'commit')}. Nice.` }
        : fail(`Only ${plural(commits.length, 'commit')}; this needs ${String(check.count)}.`);
    case 'squashMergedPr':
      return verifySquashMerge(commits[0]?.subject ?? '');
    case 'conventionalRatio': {
      const ratio = conventionalRatio(commits.slice(0, check.last), check.types);
      const percent = Math.round(ratio * 100);
      if (check.types !== undefined) {
        // A typed check is about one kind of change, so it speaks of that type, not a share.
        const wanted = check.types.map((type) => `${type}:`).join(' or ');
        return ratio >= check.min
          ? { passed: true, message: `Pushed, with a ${wanted} message.` }
          : fail(
              `That commit doesn't start with ${wanted}. Make sure your change is the newest one on GitHub's main.`,
            );
      }
      return ratio >= check.min
        ? { passed: true, message: `${String(percent)}% of recent commits are Conventional.` }
        : fail(
            `${String(percent)}% are Conventional Commits; aim for ${String(Math.round(check.min * 100))}%. ${verification.advice ?? 'New commits count, so keep going.'}`,
          );
    }
    case 'viaPullRequest': {
      const newest = commits[0];
      if (newest !== undefined && isPullRequestSubject(newest.subject)) {
        return { passed: true, message: 'It landed through a pull request.' };
      }
      return fail(
        verification.advice ??
          'That commit doesn’t show a PR number, so it looks pushed straight to main. Land the next change through a PR.',
      );
    }
    case 'newestCommitType': {
      const newest = newestWrittenCommit(commits);
      const type = newest === null ? null : commitType(newest.subject);
      if (type === check.type) {
        return { passed: true, message: `Your newest commit is a ${check.type}: commit.` };
      }
      // Naming the commit found shows whether the merge simply hasn't been pulled yet.
      const found =
        newest === null ? 'There is no commit there' : `The newest is "${newest.subject}"`;
      const example = check.example === undefined ? '' : `, like "${check.example}"`;
      return fail(
        `${found}. It should start with ${check.type}:${example}. Merged on GitHub? Pull first.`,
      );
    }
    default:
      return fail(`Run ${verification.command} and paste that.`);
  }
}

/**
 * Checks one pasted output against a Field Mission verification. Never throws: a paste
 * that isn't what was asked for gets a message saying which command to run instead.
 * A paste that looks like it holds a secret is never parsed, only reported by kind.
 */
export function verifyPaste(verification: Verification, text: string): FieldVerdict {
  const secret = findSecretLike(text);
  if (secret !== null) {
    return {
      passed: false,
      clearPaste: true,
      message: `That paste looked like it held a ${secret}, so it was cleared and not checked. Treat it as leaked: rotate it (make a new one and delete the old), then paste only what the command prints.`,
    };
  }
  // A history search that finds nothing prints nothing, so it judges an empty paste itself.
  if (verification.check.kind === 'noCommits') {
    return verifyNoCommits(verification, verification.check.path, text);
  }
  // A copied `git status --short` line with nothing under it is a clean tree, not nothing.
  const typedShortStatus = detectPasteKind(text) === 'status-short';
  if (normalizePaste(text).lines.length === 0 && !typedShortStatus) {
    return verifyEmptyPaste(verification);
  }
  if (verification.parser === 'ls-files') return checkTrackedFiles(verification, text);
  if (verification.parser === 'log-oneline') return checkLog(verification, text);
  if (verification.parser === 'gh-run-list') return checkRunList(verification, text);
  if (verification.parser === 'select-string') return verifySelectString(verification, text);

  const { check } = verification;
  const status = parseStatus(text);
  if (status === null) {
    return fail(`That doesn't look like git status output. Run ${verification.command}.`);
  }
  switch (check.kind) {
    case 'clean':
      return verifyClean(check, status);
    case 'noTrackedSecrets': {
      const secrets = trackedSecretPaths(status);
      return secrets.length === 0
        ? { passed: true, message: 'No secret files show up as tracked.' }
        : fail(`Tracked secrets: ${secrets.join(', ')}. ${verification.advice ?? UNTRACK_SECRETS}`);
    }
    case 'ignores': {
      const visible = [...unignored(status, check.patterns), ...buildOutputToIgnore(status)];
      const unique = [...new Set(visible)];
      // A pass names only what was checked, so a check without .env can't claim secrets are safe.
      return unique.length === 0
        ? { passed: true, message: `Git ignores ${check.patterns.join(', ')}.` }
        : fail(`Git still sees ${unique.join(', ')}. Add them to .gitignore.`);
    }
    default:
      return fail(`Run ${verification.command} and paste that.`);
  }
}
