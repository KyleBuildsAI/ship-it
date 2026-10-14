import { describe, expect, it } from 'vitest';
import { findSecretLike } from './secretGuard';

// Built from parts so no whole secret-shaped string sits in the repo for a scanner to flag.
const fake = (prefix: string, length: number, char = 'a') => prefix + char.repeat(length);

describe('findSecretLike', () => {
  it.each([
    ['GitHub token', fake('ghp_', 36)],
    ['GitHub token', fake('github_pat_', 40)],
    ['Anthropic API key', fake('sk-ant-', 40)],
    ['API key', fake('sk-proj-', 40)],
    ['AWS access key', fake('AKIA', 16, 'A')],
    ['Slack token', fake('xoxb-', 20, '1')],
    ['private key', '-----BEGIN OPENSSH ' + 'PRIVATE KEY-----'],
    ['password in a connection string', 'postgres://quill:' + 'hunter2@localhost:5432/app'],
  ])('reports a %s by kind only', (kind, secret) => {
    expect(findSecretLike(`some output\n${secret}\nmore`)).toBe(kind);
  });

  it('reports a value assigned to a name that says it is secret', () => {
    expect(findSecretLike('PORT=3000\nAPI_KEY=abc123')).toBe('secret value');
    expect(findSecretLike('$env:GITHUB_TOKEN = "abc123"')).toBe('secret value');
    expect(findSecretLike('  "DB_PASSWORD": "abc123",')).toBe('secret value');
  });

  it('lets names without values, and placeholders, through', () => {
    const names = ['PORT=3000', 'API_KEY=', 'DB_PASSWORD=<value>', 'SECRET_KEY=changeme'];
    expect(findSecretLike(names.join('\n'))).toBeNull();
    expect(findSecretLike('postgres://quill:<password>@localhost:5432/app')).toBeNull();
  });

  it('leaves ordinary git output alone', () => {
    const output = [
      'On branch main',
      "Your branch is up to date with 'origin/main'.",
      '\tmodified:   src/secret-key.ts',
      'a1b2c3d (HEAD -> main) docs: add environment setup for agents',
      'b2c3d4e fix: rotate the token cache',
      '.env.example',
      'src/keys/README.md',
    ].join('\n');
    expect(findSecretLike(output)).toBeNull();
  });
});
