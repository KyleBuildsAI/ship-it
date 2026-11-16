/**
 * English language rules: letters first, then accents, ignoring case. That is how .NET's
 * ignore-case culture compare ranks names, so 'resume' comes before 'Résumé' and 'úa'
 * before 'ùa'. Naming the language pins the order: a collator with no language follows
 * the computer's own settings, so the same folder could list differently on two machines.
 */
const ENGLISH = new Intl.Collator('en', { sensitivity: 'accent' });

/**
 * PowerShell's order for names: English rules, not character codes. So '_notes', '[x]'
 * and '~$plan.docx' come before 'api' (a character compare puts '[' before '_' and '~'
 * after every letter), and 'api' comes before 'Zeta' whatever the case.
 *
 * English rules ignoring case call 'README.md' and 'readme.md' equal. A Windows folder
 * can't hold both, but the sandbox's file tree can, so a plain character compare settles
 * that tie in one fixed order. Every listing of the sandbox (VirtualFs.listDir, dir, Env:,
 * the grading queries and the terraces that follow them) sorts with this one function, so
 * they can never disagree.
 */
export function compareNames(left: string, right: string): number {
  const english = ENGLISH.compare(left, right);
  if (english !== 0) return english;
  return byCharacterCode(left, right);
}

/**
 * The order NTFS keeps a folder's names in on disk: each name in capitals, compared by
 * character code. So '_build' and '~tmp' come after 'Zeta'. PowerShell sorts what it
 * prints, but `Get-ChildItem -Recurse` still opens subfolders in this order in its table
 * view, so the sandbox needs it too.
 */
export function compareDiskNames(left: string, right: string): number {
  return byCharacterCode(diskCapitals(left), diskCapitals(right));
}

/**
 * Capitals the way NTFS makes them: one character at a time, from a table that never
 * turns one letter into two. JavaScript's toUpperCase turns 'ß' into 'SS', which would
 * move 'ßa' ahead of 'Sz', so a letter like that stays as it is.
 */
function diskCapitals(name: string): string {
  let capitals = '';
  for (const character of name.split('')) {
    const capital = character.toUpperCase();
    capitals += capital.length === 1 ? capital : character;
  }
  return capitals;
}

function byCharacterCode(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
