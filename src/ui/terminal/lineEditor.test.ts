import { describe, expect, it } from 'vitest';
import { LineEditor } from './lineEditor';

function editor(history: string[] = [], complete?: (before: string) => string | null) {
  return new LineEditor({
    prompt: () => '> ',
    history: () => history,
    ...(complete ? { complete } : {}),
  });
}

describe('LineEditor', () => {
  it('draws typed text after the prompt', () => {
    const line = editor();
    expect(line.handle('git').output).toBe('\r\x1b[K> git');
    expect(line.line).toBe('git');
  });

  it('submits on Enter and starts a fresh line', () => {
    const line = editor();
    const result = line.handle('git status\r');
    expect(result.submitted).toEqual(['git status']);
    expect(result.output).toBe('\r\x1b[K> git status\r\n');
    expect(line.line).toBe('');
  });

  it('submits every line of a multi-line paste, ignoring \\n after \\r', () => {
    const result = editor().handle('git add .\r\ngit commit -m "x"\r\n');
    expect(result.submitted).toEqual(['git add .', 'git commit -m "x"']);
  });

  it('fixes a typo in the middle with the arrow keys and backspace', () => {
    const line = editor();
    line.handle('gti');
    line.handle('\x1b[D');
    line.handle('\x7f');
    expect(line.line).toBe('gi');
    line.handle('\x1b[C');
    line.handle('t');
    expect(line.line).toBe('git');
  });

  it('deletes the character under the cursor with Delete', () => {
    const line = editor();
    line.handle('gitx\x1b[D\x1b[3~');
    expect(line.line).toBe('git');
    expect(line.render()).toBe('\r\x1b[K> git');
  });
  it('draws the cursor back when it is not at the end', () => {
    const line = editor();
    line.handle('abc\x1b[D');
    expect(line.render()).toBe('\r\x1b[K> abc\x1b[1D');
  });

  it('jumps to the start and end of the line', () => {
    const line = editor();
    line.handle('it');
    line.handle('\x1b[H');
    line.handle('g');
    line.handle('\x05');
    line.handle('!');
    expect(line.line).toBe('git!');
  });

  it('ignores backspace at the start and arrows past the ends', () => {
    const line = editor();
    line.handle('\x7f\x1b[D');
    line.handle('a\x1b[C\x1b[C');
    expect(line.line).toBe('a');
  });

  it('walks history with up and down, keeping the unfinished line', () => {
    const line = editor(['git status', 'git log']);
    line.handle('draft');
    line.handle('\x1b[A');
    expect(line.line).toBe('git log');
    line.handle('\x1b[A');
    expect(line.line).toBe('git status');
    line.handle('\x1b[A');
    expect(line.line).toBe('git status');
    line.handle('\x1b[B');
    expect(line.line).toBe('git log');
    line.handle('\x1b[B');
    expect(line.line).toBe('draft');
  });

  it('does nothing with history keys when there is no history', () => {
    const line = editor();
    line.handle('x\x1b[A\x1b[B');
    expect(line.line).toBe('x');
    const withHistory = editor(['a']);
    withHistory.handle('\x1b[B');
    expect(withHistory.line).toBe('');
  });

  it('cancels the line with Ctrl+C and clears the screen with Ctrl+L', () => {
    const line = editor();
    line.handle('oops');
    const cancelled = line.handle('\x03');
    expect(cancelled.output).toBe('\r\x1b[K> oops^C\r\n');
    expect(line.line).toBe('');
    expect(line.handle('\x0c').clear).toBe(true);
  });

  it('replaces the last word with the completion on Tab', () => {
    const line = editor([], (before) => (before.endsWith('sta') ? 'status' : null));
    line.handle('git sta\t');
    expect(line.line).toBe('git status');
    line.handle(' --x\t');
    expect(line.line).toBe('git status --x');
    expect(editor().handle('\t').output).toBe('\r\x1b[K> ');
  });

  it('replaces the whole line and places the cursor from the end', () => {
    const line = editor(['old']);
    line.handle('draft\x1b[A');
    expect(line.replaceLine('git commit -m ""', 1)).toBe('\r\x1b[K> git commit -m ""\x1b[1D');
    line.handle('feat: x');
    expect(line.line).toBe('git commit -m "feat: x"');
  });

  it('ignores other control characters', () => {
    const line = editor();
    line.handle('a\x07b');
    expect(line.line).toBe('ab');
  });
});
