import { normalizePaste } from './normalize';
import { unquotePath } from './quoting';

/**
 * Reads a paste with one path per line, like the output of `git ls-files`, which lists
 * every file git tracks. Git quotes unusual names, as in `"caf\303\251/.env"`, and they
 * come back decoded, so the secret and build-output checks see the real file names.
 */
export function parsePathList(text: string): string[] {
  return normalizePaste(text)
    .lines.filter((line) => line.trim() !== '')
    .map((line) => unquotePath(line));
}
