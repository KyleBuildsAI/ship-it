import { describe, expect, it } from 'vitest';
import type { EngineEvent } from './workspace';
import { NotARepositoryError, Workspace } from './workspace';
import { testDeps } from './git/testDeps';

function recordEvents(ws: Workspace): EngineEvent[] {
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  return events;
}

describe('Workspace', () => {
  it('has no repository until git init', () => {
    const ws = new Workspace(testDeps());
    expect(ws.repo).toBeNull();
    expect(() => ws.requireRepo()).toThrow(NotARepositoryError);
    expect(() => ws.status()).toThrow('not a git repository');
  });

  it('initializes once and reports reinitialization after that', () => {
    const ws = new Workspace(testDeps());
    const events = recordEvents(ws);
    expect(ws.initRepo()).toEqual({ reinitialized: false });
    const repo = ws.repo;
    expect(ws.initRepo()).toEqual({ reinitialized: true });
    expect(ws.repo).toBe(repo);
    expect(events).toEqual([{ type: 'repoInitialized' }]);
  });

  it('announces file creations, edits, and deletions, but not no-op writes', () => {
    const ws = new Workspace(testDeps());
    const events = recordEvents(ws);
    ws.writeFile('app.ts', 'v1');
    ws.writeFile('app.ts', 'v1');
    ws.writeFile('app.ts', 'v2');
    ws.deleteFile('app.ts');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'app.ts', change: 'created' },
      { type: 'fileChanged', path: 'app.ts', change: 'modified' },
      { type: 'fileChanged', path: 'app.ts', change: 'deleted' },
    ]);
  });

  it('reads ignore rules from the root .gitignore', () => {
    const ws = new Workspace(testDeps());
    expect(ws.ignoreRules().isIgnored('.env')).toBe(false);
    ws.writeFile('.gitignore', '.env\n');
    expect(ws.ignoreRules().isIgnored('.env')).toBe(true);
  });
});
