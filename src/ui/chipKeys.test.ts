import { describe, expect, it } from 'vitest';
import { chipKeyAction } from './chipKeys';

const press = (key: string, onWorld = true, repeat = false) =>
  chipKeyAction({ key, repeat, onWorld });

describe('chipKeyAction', () => {
  it('runs on Enter and dismisses on Escape while the world has the keyboard', () => {
    expect(press('Enter')).toBe('run');
    expect(press('Escape')).toBe('dismiss');
  });

  it('leaves Space to the world, so it jumps', () => {
    expect(press(' ')).toBeNull();
  });

  it('ignores keys meant for the terminal, the editor, or a button', () => {
    expect(press('Enter', false)).toBeNull();
    expect(press('Escape', false)).toBeNull();
  });

  it('runs once for a held Enter, not again on every repeat', () => {
    expect(press('Enter', true, true)).toBeNull();
  });
});
