import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { drive, type DriverAction } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import { transcriptEntry, transcriptQueries, type TranscriptEntry } from './transcript';

/** A laptop where Otto's actions are written into a transcript as they happen. */
function laptop() {
  const ws = windows().write('Users/kyle/api/package.json', '{}\n').build(testDeps());
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  const entries: TranscriptEntry[] = [];
  const act = (action: DriverAction) => {
    const entry = transcriptEntry(action, drive(shell, action));
    entries.push(entry);
    return entry;
  };
  return { act, printed: transcriptQueries(entries).printed };
}

describe('transcriptEntry', () => {
  it('keeps the action as driven, the tab, the text that came back, and the exit code', () => {
    const { act } = laptop();
    const action = { do: 'run', line: 'cd nowhere' } as const;
    expect(act(action)).toEqual({
      tab: 1,
      action,
      output: [
        "Set-Location: Cannot find path 'C:\\Users\\kyle\\nowhere' because it does not exist.",
      ],
      exitCode: 1,
    });
  });
});

describe('transcriptQueries', () => {
  it('finds text in what Otto typed, what he wrote, and the output, ignoring case', () => {
    const { act, printed } = laptop();
    act({ do: 'run', line: 'Get-ChildItem api' });
    act({
      do: 'write',
      path: 'Users/kyle/api/.env',
      content: 'QUILL_API_KEY=dev-key-for-the-game\n',
    });

    expect(printed('get-childitem API')).toBe(true);
    expect(printed('package.json')).toBe(true);
    expect(printed('DEV-KEY-FOR-THE-GAME')).toBe(true);
    expect(printed('DATABASE_URL')).toBe(false);
  });

  it('sees entries added after it was made, and nothing for a tab switch', () => {
    const { act, printed } = laptop();
    expect(printed('PS')).toBe(false);
    act({ do: 'newTerminal' });
    act({ do: 'useTerminal', tab: 1 });
    expect(printed('PS')).toBe(false);
    act({ do: 'run', line: 'Get-Location' });
    expect(printed('C:\\Users\\kyle')).toBe(true);
  });
});
