import { shortId } from '../hash';
import type { Repository } from '../repository';
import type { Commit, ObjectId } from '../types';
import { line, type OutputLine } from './output';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Git's default date format, in UTC so tests read the same everywhere: "Sat Sep 26 12:00:00 2026 +0000". */
export function gitDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return `${DAYS[date.getUTCDay()] ?? ''} ${MONTHS[date.getUTCMonth()] ?? ''} ${String(date.getUTCDate())} ${time} ${String(date.getUTCFullYear())} +0000`;
}

/** The "(HEAD -> main, feature)" labels git prints next to a commit. */
export function decorations(repo: Repository, id: ObjectId): string[] {
  const head = repo.getHead();
  const labels: string[] = [];
  if (head.kind === 'detached' && head.commit === id) labels.push('HEAD');
  for (const branch of repo.branchNames()) {
    if (repo.branchTip(branch) !== id) continue;
    if (head.kind === 'branch' && head.name === branch) labels.unshift(`HEAD -> ${branch}`);
    else labels.push(branch);
  }
  return labels;
}

export function subjectOf(commit: Commit): string {
  return commit.message.split('\n')[0] ?? '';
}

/** `abc1234 (HEAD -> main) feat: subject` */
export function onelineHeader(repo: Repository, commit: Commit): OutputLine {
  const labels = decorations(repo, commit.id);
  const decoration = labels.length > 0 ? `(${labels.join(', ')}) ` : '';
  return line(`${shortId(commit.id)} ${decoration}${subjectOf(commit)}`, 'commit');
}

/** The full `commit`, `Author`, `Date`, and indented message block of `git log` and `git show`. */
export function fullHeader(repo: Repository, commit: Commit): OutputLine[] {
  const labels = decorations(repo, commit.id);
  const decoration = labels.length > 0 ? ` (${labels.join(', ')})` : '';
  return [
    line(`commit ${commit.id}${decoration}`, 'commit'),
    line(`Author: ${commit.author.name} <${commit.author.email}>`),
    line(`Date:   ${gitDate(commit.timestamp)}`),
    line(''),
    ...commit.message.split('\n').map((text) => line(text === '' ? '' : `    ${text}`)),
  ];
}
