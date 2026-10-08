import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { INSTANT_PACE, NORMAL_PACE } from '../agent/pace';
import { onTerminalFeed } from '../agent/terminalFeed';
import { evaluate } from '../missions/predicates';
import { JudgmentDrillSchema, type JudgmentDrill } from '../missions/schema';
import { currentLog, currentQueries, loadSandbox } from './sandboxControl';
import { beginScene, endScene, frameScene, scenePace } from './scenePlay';

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';

/** A diagnose drill whose scene has a line that asks PowerShell's Confirm question. */
function askingDrill(): JudgmentDrill {
  return JudgmentDrillSchema.parse({
    kind: 'diagnose',
    id: 'scene-asks',
    prompt: 'Where did the notes go?',
    concept: 'approvals',
    setup: windows({ mount: API })
      .session()
      .write(`${API}/package.json`, '{}\n')
      .write(`${HOME}/notes/a.md`, 'a\n')
      .toSpec(),
    history: [
      { do: 'run', line: 'Remove-Item notes', answer: 'A' },
      { do: 'run', line: 'Get-ChildItem' },
    ],
    options: [
      {
        id: 'gone',
        text: 'Otto said Yes to All',
        truth: { kind: 'driveFolder', path: `${HOME}/notes`, exists: false },
      },
      { id: 'kept', text: 'The notes are still there' },
      { id: 'moved', text: 'Otto moved the notes' },
    ],
    explain: 'The folder had a file, so PowerShell asked, and Otto answered A.',
  });
}

describe('a drill scene', () => {
  it("plays each line, then Otto's answer to the question it asked, then the next line", () => {
    const drill = askingDrill();
    loadSandbox(drill.setup, 'scene', testDeps);
    expect(beginScene(drill)).toBe(true);

    expect(frameScene(drill.id, 16, INSTANT_PACE)).toEqual({ index: 2, done: true });
    const gone = { kind: 'driveFolder', path: `${HOME}/notes`, exists: false } as const;
    expect(evaluate(gone, currentQueries())).toBe(true);
    // The answer is logged as its own action, right after the line that asked.
    expect(currentLog().entries.map((entry) => entry.kind === 'action' && entry.action.do)).toEqual(
      ['run', 'answer', 'run'],
    );
    // Once done, the scene is gone: another frame plays nothing.
    expect(frameScene(drill.id, 16, INSTANT_PACE)).toBeNull();
  });

  it("drives each line and answer only once Otto's typing of it has shown", () => {
    const drill = askingDrill();
    loadSandbox(drill.setup, 'scene', testDeps);
    beginScene(drill);
    let keys = '';
    const stop = onTerminalFeed((reveals) => {
      for (const shown of reveals) if (shown.kind === 'keys') keys += shown.text;
    });
    const notesGone = { kind: 'driveFolder', path: `${HOME}/notes`, exists: false } as const;
    try {
      // One frame types nothing whole, so nothing has run and the notes are still there.
      expect(frameScene(drill.id, 16, NORMAL_PACE)).toEqual({ index: 1, done: false });
      expect(currentLog().entries).toHaveLength(0);
      expect(evaluate(notesGone, currentQueries())).toBe(false);
      // Frame by frame, everything that has run was typed in full first: the line, then
      // Otto's answer, then the next line. The world never runs ahead of the terminal.
      const echoes = ['Remove-Item notes', 'A', 'Get-ChildItem'];
      for (let frame = 0; frame < 1000; frame++) {
        const ran = currentLog().entries.length;
        expect(keys.startsWith(echoes.slice(0, ran).join(''))).toBe(true);
        if (evaluate(notesGone, currentQueries())) expect(keys).toContain('Remove-Item notesA');
        if (frameScene(drill.id, 16, NORMAL_PACE)?.done !== false) break;
      }
    } finally {
      stop();
    }
    expect(keys).toBe('Remove-Item notesAGet-ChildItem');
    expect(evaluate(notesGone, currentQueries())).toBe(true);
  });

  it("plays only the scene of the drill it was started for, and none after it's dropped", () => {
    const drill = askingDrill();
    loadSandbox(drill.setup, 'scene', testDeps);
    beginScene(drill);
    expect(frameScene('another-drill', 16, INSTANT_PACE)).toBeNull();
    endScene();
    expect(frameScene(drill.id, 16, INSTANT_PACE)).toBeNull();
  });

  it('runs three times faster than Otto, and a drill with no history has no scene', () => {
    expect(scenePace(NORMAL_PACE)).toEqual({
      charMs: NORMAL_PACE.charMs / 3,
      thinkMs: NORMAL_PACE.thinkMs / 3,
      settleMs: NORMAL_PACE.settleMs / 3,
    });
    expect(scenePace(INSTANT_PACE)).toEqual(INSTANT_PACE);
    const drill = { ...askingDrill(), history: [] };
    expect(beginScene(drill)).toBe(false);
    expect(frameScene(drill.id, 16, INSTANT_PACE)).toBeNull();
  });
});
