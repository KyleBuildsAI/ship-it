import { describe, expect, it } from 'vitest';

/**
 * Real PowerShell 7 output, captured by fixtures/capture-shell.ps1 on Kyle's machine. The
 * simulated shell's tests compare against these files; this test checks the files
 * themselves are there, stable, and free of anything personal.
 */
const captures = import.meta.glob<string>('./fixtures/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const byName = new Map(
  Object.entries(captures).map(([path, text]) => [path.replace(/^.*\/|\.txt$/g, ''), text]),
);

const read = (name: string): string => {
  const text = byName.get(name);
  if (text === undefined) throw new Error(`No capture named ${name}`);
  return text;
};

const EXPECTED = [
  'captured-with',
  'get-location',
  'ls',
  'ls-force',
  'ls-name',
  'ls-recurse',
  'ls-env-temp',
  'new-item-file',
  'new-item-folder',
  'error-not-recognized',
  'error-cd-missing',
  'error-cd-no-drive',
  'error-cd-positional',
  'error-dir-s',
  'error-rm-rf',
  'error-ls-ambiguous',
  'error-new-item-exists',
  'error-stop-process-missing-id',
  'error-stop-process-no-such',
  'error-get-process-missing',
  'error-tcp-missing',
  'get-command',
  'get-process-self',
  'tcp-listen',
  'netstat-listen',
  'where-missing',
  'version-node',
  'version-npm',
  'version-python',
  'version-pip',
  'version-winget',
  'npm-run-missing',
];

describe('captured PowerShell output', () => {
  it('has every capture the shell tests need', () => {
    expect([...byName.keys()].sort()).toEqual([...EXPECTED].sort());
  });

  it.each(EXPECTED)('%s is stable text with Unix line endings', (name) => {
    const text = read(name);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('\r');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('was captured on PowerShell 7.6, the version Act 1 simulates', () => {
    expect(read('captured-with')).toMatch(/^PowerShell 7\.6\.\d+\n/);
  });

  it('shows the simulated home folder, never the real one', () => {
    for (const [name, text] of byName) {
      expect({ name, leaks: /C:\\Users\\(?!kyle\b)[^\\\s]+\\/.test(text) }).toEqual({
        name,
        leaks: false,
      });
    }
    expect(read('ls')).toContain('    Directory: C:\\Users\\kyle\n');
  });

  it("hides this terminal's process id and npm's log time", () => {
    expect(read('get-process-self')).toContain('{PID}');
    expect(read('netstat-listen')).toContain('{PID}');
    expect(read('npm-run-missing')).toContain('{TIMESTAMP}');
  });

  it('records errors the way a typed command prints them: one line, no script position', () => {
    expect(read('error-cd-missing')).toBe(
      "Set-Location: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.\n",
    );
    expect(read('error-rm-rf')).toBe(
      "Remove-Item: A parameter cannot be found that matches parameter name 'rf'.\n",
    );
  });
});
