/**
 * What a pasted secret looks like. Only the kind is ever reported, never the text, so the
 * game can say what leaked without showing it again.
 */
export type SecretKind =
  | 'GitHub token'
  | 'Anthropic API key'
  | 'API key'
  | 'AWS access key'
  | 'Slack token'
  | 'private key'
  | 'password in a connection string'
  | 'secret value';

// Each pattern is a shape real secrets have, not a guess: a vendor prefix followed by a
// long run of key characters, or a value assigned to a name that says it is secret.
const SECRET_PATTERNS: readonly (readonly [SecretKind, RegExp])[] = [
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['API key', /\b(?:sk|rk)[-_](?:live|proj|test)?[-_]?[A-Za-z0-9]{20,}/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  // scheme://user:password@host. A placeholder like <password> doesn't count.
  ['password in a connection string', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@<>]+@/i],
];

// A line like API_KEY=abc123 or "DB_PASSWORD": "abc123". The name has to say it's secret,
// so PORT=3000 is fine.
const SECRET_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIALS?)$/i;
const ASSIGNMENT = /^\s*(?:export\s+|\$env:)?["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*[=:]\s*(.*)$/;
// Values that say "fill this in" rather than holding anything.
const PLACEHOLDER = /^(?:["']?\s*["']?|<[^>]*>|\.\.\.|x+|\*+|changeme|your[-_a-z]*)$/i;

function secretAssignment(line: string): boolean {
  const match = ASSIGNMENT.exec(line);
  if (!match) return false;
  const [, name = '', value = ''] = match;
  return SECRET_NAME.test(name) && !PLACEHOLDER.test(value.trim().replace(/[,;]$/, ''));
}

/**
 * The kind of secret a paste seems to hold, or null. It runs before any parser reads a
 * paste: a secret pasted into the game has left the file it belongs in, so the game
 * clears it and says to rotate it, and never checks or keeps it.
 */
export function findSecretLike(text: string): SecretKind | null {
  for (const [kind, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return text.split(/\r?\n/).some(secretAssignment) ? 'secret value' : null;
}
