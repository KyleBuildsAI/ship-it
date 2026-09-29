import { describe, expect, it } from 'vitest';
import type { Reveal } from './pace';
import { onTerminalFeed, showInTerminal } from './terminalFeed';

const PROMPT: Reveal = { kind: 'beat', beat: { kind: 'prompt', tab: 1, text: 'PS C:\\> ' } };
const KEYS: Reveal = { kind: 'keys', tab: 1, by: 'otto', text: 'dir', from: 0 };

describe('the terminal feed', () => {
  it('hands every frame to the terminal, in order, until it stops listening', () => {
    const frames: (readonly Reveal[])[] = [];
    const stop = onTerminalFeed((reveals) => frames.push(reveals));
    showInTerminal([PROMPT]);
    showInTerminal([]);
    showInTerminal([KEYS]);
    stop();
    showInTerminal([KEYS]);
    expect(frames).toEqual([[PROMPT], [KEYS]]);
  });
});
