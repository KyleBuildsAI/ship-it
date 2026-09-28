import { beforeEach, describe, expect, it } from 'vitest';
import { closeActMenu, hud, openActMenu, toggleActMenu } from './hud';

describe('the Act menu from the HUD', () => {
  beforeEach(() => {
    closeActMenu();
  });

  it('opens on the Act it is given, and the same button closes it', () => {
    toggleActMenu(2);
    expect(hud.get().actMenu).toBe(2);

    toggleActMenu(2);
    expect(hud.get().actMenu).toBeNull();
  });

  it('switches Act from a tab without closing', () => {
    toggleActMenu(2);
    openActMenu(1);

    expect(hud.get().actMenu).toBe(1);
  });

  it('closes when the player travels, so the island shows its own Act', () => {
    openActMenu(1);
    closeActMenu();

    expect(hud.get().actMenu).toBeNull();
  });
});
