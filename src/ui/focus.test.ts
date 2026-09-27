import { describe, expect, it, vi } from 'vitest';
import { releaseMouseFocus } from './focus';

describe('releaseMouseFocus', () => {
  it('gives the keyboard back to the world after a mouse click', () => {
    const blur = vi.fn();
    releaseMouseFocus({ detail: 1, currentTarget: { blur } });

    expect(blur).toHaveBeenCalledOnce();
  });

  it('keeps focus on a button pressed from the keyboard', () => {
    const blur = vi.fn();
    releaseMouseFocus({ detail: 0, currentTarget: { blur } });

    expect(blur).not.toHaveBeenCalled();
  });
});
