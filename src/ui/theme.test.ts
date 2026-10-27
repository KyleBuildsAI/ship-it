import { describe, expect, it } from 'vitest';
import themeCss from './theme.css?raw';

/** The declarations of the first rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string {
  const start = themeCss.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`No rule for ${selector}`);
  return themeCss.slice(themeCss.indexOf('{', start) + 1, themeCss.indexOf('}', start));
}

describe('text in the mono font', () => {
  it('turns ligatures off, so === and => show every character', () => {
    // Every rule whose own declarations use the mono font, with its selector for the report.
    const withoutComments = themeCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) =>
      body?.includes('var(--font-mono)'),
    );
    expect(rules.length).toBeGreaterThan(0);
    const ligatured = rules
      .filter(([, , body = '']) => {
        const off = body.lastIndexOf('font-variant-ligatures: none;');
        // The font shorthand turns ligatures back on, so the switch must come after it.
        return off < 0 || off < body.indexOf('font:');
      })
      .map(([, selector]) => selector?.trim());
    expect(ligatured).toEqual([]);
  });
});

describe('a lesson artifact box', () => {
  it('shows 13 whole lines before it scrolls, and half a 14th to say there is more', () => {
    const lines = /max-height: ([\d.]+)lh;/.exec(ruleBody('.lesson-artifact pre'))?.[1];
    expect(Number(lines)).toBe(13.5);
  });

  it('wraps every line, breaking even a long path, so no word hides past the edge', () => {
    const body = ruleBody('.lesson-artifact pre');
    expect(body).toContain('white-space: pre-wrap;');
    expect(body).toContain('overflow-wrap: anywhere;');
    // Each line is a block of its own (LessonView.tsx), and an empty one keeps its height.
    expect(ruleBody('.lesson-artifact__line')).toContain('display: block;');
    expect(ruleBody('.lesson-artifact__line')).toContain('min-height: 1lh;');
  });
});
