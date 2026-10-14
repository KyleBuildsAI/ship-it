import { describe, expect, it } from 'vitest';
import { copyText, type ClipboardWriter } from './clipboard';

describe('copying text for the player', () => {
  it('writes the text and says it worked', async () => {
    const written: string[] = [];
    const clipboard: ClipboardWriter = {
      writeText: (text) => {
        written.push(text);
        return Promise.resolve();
      },
    };
    expect(await copyText('git ls-files', clipboard)).toBe(true);
    expect(written).toEqual(['git ls-files']);
  });

  it('says it failed when the browser refuses, instead of throwing', async () => {
    const refusing: ClipboardWriter = {
      writeText: () => Promise.reject(new Error('Document is not focused.')),
    };
    expect(await copyText('git ls-files', refusing)).toBe(false);
  });

  it('says it failed when the page has no clipboard at all', async () => {
    expect(await copyText('git ls-files', null)).toBe(false);
  });
});
