import { describe, expect, it, vi } from 'vitest';
import { folder, repo, windows } from '../../engine/fixtures';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { NotARepositoryError, Workspace } from '../../engine/workspace';
import { applySteps, createSandbox } from './sandbox';

/** Everything grading can see, so two sandboxes can be compared as a whole. */
function snapshot(ws: Workspace) {
  const q = gitQueries(ws);
  return {
    files: ws.fs.allFiles().map((path) => [path, q.workingFile(path)]),
    status: q.status(),
    history: q.log().map((commit) => commit.id),
    reflog: q.reflog(),
  };
}

// Uses every kind of fixture step, including staging a deleted file and appending to a
// file that doesn't exist yet.
const everyStep = repo()
  .commit('chore: init', { 'app.ts': 'v1\n', 'old.ts': 'old\n' })
  .modify('app.ts')
  .modify('notes.md')
  .write('.env', 'TOKEN=dev-only\n')
  .delete('old.ts')
  .stage('app.ts', 'old.ts')
  .commit('refactor: tidy')
  .toSpec();

describe('createSandbox', () => {
  it('replays a mission setup into a fresh workspace', () => {
    const q = gitQueries(createSandbox(everyStep, testDeps()));
    expect(q.log().map((commit) => commit.message)).toEqual(['refactor: tidy', 'chore: init']);
    expect(q.untrackedPaths()).toEqual(['.env', 'notes.md']);
  });

  it('uses the real clock when no test dependencies are given', () => {
    // testDeps() would stamp its own fixed start time, so seeing this date proves the
    // commit read the system clock. Only Date is faked; real timers keep running.
    const newYear2030 = Date.UTC(2030, 0, 1);
    vi.useFakeTimers({ now: newYear2030, toFake: ['Date'] });
    try {
      const ws = createSandbox(repo().commit('init', { 'a.ts': 'a' }).toSpec());
      expect(gitQueries(ws).headCommit()?.timestamp).toBe(newYear2030);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('applySteps', () => {
  it('builds exactly what buildWorkspace builds', () => {
    const replayed = new Workspace(testDeps());
    applySteps(replayed, everyStep);
    expect(snapshot(replayed)).toEqual(snapshot(createSandbox(everyStep, testDeps())));
  });

  it('adds to a sandbox the player is already working in', () => {
    const ws = createSandbox(repo().commit('init', { 'app.ts': 'a\n' }).toSpec(), testDeps());
    ws.writeFile('app.ts', 'player edit\n');
    applySteps(ws, folder().write('NOTES.md', 'from Marco\n').modify('app.ts').toSpec());
    const q = gitQueries(ws);
    expect(q.workingFile('app.ts')).toBe('player edit\n// work in progress\n');
    expect(q.untrackedPaths()).toEqual(['NOTES.md']);
  });

  it('announces what it changes, so the 3D world can follow a twist', () => {
    const ws = createSandbox(repo().commit('init', { 'app.ts': 'a\n' }).toSpec(), testDeps());
    const heard: string[] = [];
    ws.events.on((event) => heard.push(event.type));
    const twist = folder().write('NOTES.md', 'x\n').stage('NOTES.md').commit('docs: notes');
    applySteps(ws, twist.toSpec());
    expect(heard).toEqual(['fileChanged', 'staged', 'committed', 'branchMoved', 'headMoved']);
  });

  it('refuses to stage in a folder that has no repository', () => {
    const ws = createSandbox(folder().write('a.ts', 'a').toSpec(), testDeps());
    expect(() => {
      applySteps(ws, [{ op: 'stage', paths: ['a.ts'] }]);
    }).toThrow(NotARepositoryError);
  });
});

/** Everything about a laptop that grading or the world could see. */
function laptopSnapshot(ws: Workspace) {
  const machine = ws.machine;
  if (machine === null) throw new Error('expected a laptop');
  const scope = (table: typeof machine.saved.user) =>
    table.entries().map((entry) => ({ ...entry, expands: table.expands(entry.name) }));
  return {
    drive: machine.drive.allFiles().map((path) => [path, machine.drive.readFile(path)]),
    saved: { machine: scope(machine.saved.machine), user: scope(machine.saved.user) },
    tabs: machine.sessions().map((tab) => ({
      id: tab.id,
      cwd: tab.cwd,
      env: tab.env.entries(),
    })),
  };
}

describe('applySteps on a laptop', () => {
  // A twist uses every laptop step (everything after windows() and session()).
  const twist = windows()
    .session()
    .mkdir('Users/kyle/notes')
    .write('Users/kyle/notes/today.txt', 'ship it\n')
    .modify('Users/kyle/notes/today.txt')
    .env('user', 'EDITOR', 'code')
    .pathAdd('user', 'C:\\tools\\node16')
    .session()
    .cd('Users/kyle/notes')
    .env('session', 'PORT', '3000')
    .pathAdd('session', 'C:\\Program Files\\nodejs', 'start')
    .restartTerminals()
    .toSpec();

  it('changes a live laptop exactly as building it with those steps would', () => {
    const live = createSandbox(windows().session().toSpec(), testDeps());
    applySteps(live, twist.slice(2));

    expect(laptopSnapshot(live)).toEqual(laptopSnapshot(createSandbox(twist, testDeps())));
  });

  it('announces file changes by their drive path', () => {
    const live = createSandbox(windows().toSpec(), testDeps());
    const heard: unknown[] = [];
    live.events.on((event) => heard.push(event));
    applySteps(
      live,
      windows().write('Users/kyle/a.txt', 'x').delete('Users/kyle/a.txt').toSpec().slice(1),
    );

    expect(heard).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/a.txt', change: 'created' },
      { type: 'fileChanged', path: 'Users/kyle/a.txt', change: 'deleted' },
    ]);
  });

  it('refuses to start a laptop inside a running sandbox', () => {
    const live = createSandbox(windows().toSpec(), testDeps());
    expect(() => {
      applySteps(live, windows().toSpec());
    }).toThrow('windows() starts a sandbox; it cannot change one.');
  });

  it('refuses laptop steps in an Act 2 sandbox', () => {
    const ws = createSandbox(repo().toSpec(), testDeps());
    expect(() => {
      applySteps(ws, [{ op: 'session' }]);
    }).toThrow('The "session" step needs a windows() sandbox.');
  });
});
