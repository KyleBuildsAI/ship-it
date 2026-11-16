/**
 * English language rules, ignoring case and accents. Naming the language pins the order:
 * a collator with no language follows the computer's own settings, so the same folder
 * could list differently on two machines.
 */
const ENGLISH = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * PowerShell's order for names: English rules, not character codes. So '_notes', '[x]'
 * and '~$plan.docx' come before 'api' (a character compare puts '[' before '_' and '~'
 * after every letter), and 'api' comes before 'Zeta' whatever the case.
 *
 * English rules call 'resume' and 'résumé' equal, so a plain character compare settles
 * the tie, unaccented first, as PowerShell prints them. Every listing of the sandbox
 * (dir, Env:, the grading queries and the terraces that follow them) sorts with this one
 * function, so they can never disagree.
 */
export function compareNames(left: string, right: string): number {
  const english = ENGLISH.compare(left, right);
  if (english !== 0) return english;
  return left < right ? -1 : left > right ? 1 : 0;
}
