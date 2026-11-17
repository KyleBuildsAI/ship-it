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

describe('a word kept whole in a Field Mission prompt or command', () => {
  it('moves to the next line as one piece, and wraps inside only if wider than a line', () => {
    // A box of its own takes the width its text needs, up to the line's: a word that fits
    // never breaks after its hyphen, and one that doesn't still can't run past the edge.
    const body = ruleBody('.whole-word');
    expect(body).toContain('display: inline-block;');
    expect(body).toContain('overflow-wrap: anywhere;');
  });
});

/** Every rule in theme.css, comments left out: its selector text and its declarations. */
const RULES = [...themeCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  ([, selector = '', body = '']) => ({ selector: selector.trim(), body }),
);

/** What each text size zooms: the selectors inside html[data-text-size='…'] :is(…). */
const TEXT_SIZE_ZOOMS = RULES.filter(
  ({ selector, body }) => selector.startsWith('html[data-text-size=') && body.includes('zoom:'),
).map(({ selector }) =>
  (/:is\(([^)]*)\)/.exec(selector)?.[1] ?? '').split(',').map((one) => one.trim()),
);

/**
 * A declaration that places a box on the screen or sizes it. Zoom scales each of these on
 * the element it is set on, vh and vw included, so a zoomed box moves and grows as a whole.
 */
const PLACES_OR_SIZES =
  /(?:^|[\s;])(?:position:\s*(?:absolute|fixed|sticky)|(?:top|right|bottom|left|inset|(?:min-|max-)?(?:width|height)|transform)\s*:)/;

/** Whether one selector in a list styles the element with `className` itself, not a child. */
function stylesItself(selector: string, className: string): boolean {
  // The last compound part names the element styled: `.overlay__content h2` is the h2.
  const parts = selector.trim().split(/[\s>+~]+/);
  const last = parts[parts.length - 1] ?? '';
  // `.overlay` must not match `.overlay__content`, so no name character may follow it.
  return new RegExp(`${className.replace(/[.-]/g, '\\$&')}(?![\\w-])`).test(last);
}

describe('larger text sizes', () => {
  it('have a zoom rule each, Large and Extra large', () => {
    expect(TEXT_SIZE_ZOOMS).toHaveLength(2);
  });

  it('zoom a content box inside each box placed on the screen, never the placed box', () => {
    for (const zoomed of TEXT_SIZE_ZOOMS) {
      for (const box of ['.play-panel', '.overlay', '.command-chip', '.title-card']) {
        expect(zoomed).toContain(`${box}__content`);
        expect(zoomed).not.toContain(box);
      }
    }
  });

  it('zoom nothing that theme.css places or sizes on the screen', () => {
    // At Extra large a zoomed Settings menu filled the window over the HUD buttons, and a
    // zoomed command chip floated a quarter higher. A box that is zoomed may only hold text.
    const placedAndZoomed = TEXT_SIZE_ZOOMS.flat().flatMap((className) =>
      RULES.filter(
        ({ selector, body }) =>
          selector.split(',').some((one) => stylesItself(one, className)) &&
          PLACES_OR_SIZES.test(body),
      ).map(({ selector }) => `${className} in ${selector}`),
    );
    expect(placedAndZoomed).toEqual([]);
  });
});

describe('the check for placed boxes', () => {
  it('sees .overlay as placed, so zooming it again would fail the test above', () => {
    // Without this, a typo in PLACES_OR_SIZES could make that test pass on anything.
    const overlay = RULES.filter(({ selector }) => stylesItself(selector, '.overlay'));
    expect(overlay.some(({ body }) => PLACES_OR_SIZES.test(body))).toBe(true);
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

describe('a code review diff', () => {
  it('wraps every row, so the end of a changed line never hides past the edge', () => {
    const body = ruleBody('.review-diff__code');
    expect(body).toContain('white-space: pre-wrap;');
    expect(body).toContain('overflow-wrap: anywhere;');
  });

  it('keeps every row inside the box, padding and flag bar included', () => {
    // A row is 100% wide. A context row is a plain block, which counts its padding and
    // left border on top of that width (only buttons count them inside), so it would
    // stick out past the box's right edge and draw its wrapped code over the border.
    const body = ruleBody('.review-diff__line');
    expect(body).toContain('width: 100%;');
    expect(body).toContain('box-sizing: border-box;');
  });
});
