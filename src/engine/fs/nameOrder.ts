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

function byCharacterCode(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
