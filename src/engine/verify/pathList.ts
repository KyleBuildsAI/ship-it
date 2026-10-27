import { detectPasteKind } from './detect';
import { normalizePaste } from './normalize';
import { closingQuote, unquotePath } from './quoting';

/**
 * Reads a paste with one path per line, like the output of `git ls-files`, which lists
 * every file git tracks. Git quotes unusual names, as in `"caf\303\251/.env"`, and they
 * come back decoded, so the secret and build-output checks see the real file names.
 *
 * An empty list means nothing was pasted, since a repository with commits always tracks
 * something. A mission should ask again then, not report "no secrets found".
 */
export function parsePathList(text: string): string[] {
  return normalizePaste(text)
    .lines.filter((line) => line.trim() !== '')
    .map((line) => unquotePath(line));
}

// Git's own messages and people's summaries put a colon before a space ("fatal: not a git
// repository", "Tracked: README.md"). Windows doesn't allow ':' in a file name at all.
const MESSAGE_COLON = /:(?:\s|$)/;

// A sentence ends in punctuation, and a file name almost never does: Windows drops a
// trailing dot from one and doesn't allow '?' at all.
const SENTENCE_END = /[.,;!?]$/;

// The last word is a file name with an extension, like the end of `docs/Meeting notes.md`.
// `No .env` doesn't count: a word that is only an extension reads as a sentence.
const NAME_WITH_EXTENSION = /[^\s.]\.[A-Za-z0-9]+$/;

/** Whether one pasted line could be a path exactly as `git ls-files` prints it. */
function looksLikePath(line: string): boolean {
  // Git quotes a name it can't print bare, so a quoted line is git's own spelling.
  if (closingQuote(line) === line.length - 1) return true;
  // ls-files never indents; `git status --short` and copied chat replies do.
  if (/^\s/.test(line)) return false;
  if (MESSAGE_COLON.test(line) || SENTENCE_END.test(line)) return false;
  // Real names can hold spaces (ls-files doesn't quote them), but a line of words with no
  // folder and no extension is a sentence, like "all clean".
  return !/\s/.test(line) || line.includes('/') || NAME_WITH_EXTENSION.test(line);
}

/**
 * Whether a paste reads like `git ls-files` output: one path per line, as git prints it.
 * A summary such as "all clean", git's own error, or another command's output fails, so
 * a check that finds no secret on the list can't pass on a list that was never pasted.
 *
 * It also needs one path with a folder or an extension in it. Every real project has one,
 * and a lone word like "hello" or "done" has neither.
 */
export function looksLikePathList(text: string): boolean {
  const lines = normalizePaste(text).lines.filter((line) => line.trim() !== '');
  if (lines.length === 0 || detectPasteKind(text) !== 'unknown') return false;
  if (!lines.every(looksLikePath)) return false;
  return lines.some((line) => /[./]/.test(unquotePath(line)));
}
