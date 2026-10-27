import { describe, expect, it } from 'vitest';
import themeCss from './theme.css?raw';

/** The declarations of the first rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string {
  const start = themeCss.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector}`);
  return themeCss.slice(themeCss.indexOf('{', start) + 1, themeCss.indexOf('}', start));
}

describe('a lesson artifact box', () => {
  it('shows 13 lines before it scrolls', () => {
    const lines = /max-height: calc\((\d+)lh\b/.exec(ruleBody('.lesson-artifact pre'))?.[1];
    expect(Number(lines)).toBeGreaterThanOrEqual(13);
  });

  it('wraps prose, breaking even a long path, so no word hides past the edge', () => {
    const body = ruleBody('.lesson-artifact--wrap pre');
    expect(body).toContain('white-space: pre-wrap;');
    expect(body).toContain('overflow-wrap: anywhere;');
  });
});
