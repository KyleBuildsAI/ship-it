import { normalizePaste } from './normalize';
import { unquotePath } from './quoting';

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
