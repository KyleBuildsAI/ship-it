import { describe, expect, it } from 'vitest';
import { colorize } from './tones';

describe('colorize', () => {
  it('leaves plain lines alone', () => {
    expect(colorize('On branch main', 'plain')).toBe('On branch main');
  });

  it('wraps colored lines and resets afterwards', () => {
    expect(colorize('\tmodified:   app.ts', 'staged')).toBe('\x1b[32m\tmodified:   app.ts\x1b[0m');
    expect(colorize('fatal: nope', 'error')).toBe('\x1b[31mfatal: nope\x1b[0m');
  });

  it('turns embedded newlines into terminal line breaks', () => {
    expect(colorize('a\nb', 'plain')).toBe('a\r\nb');
  });
});
