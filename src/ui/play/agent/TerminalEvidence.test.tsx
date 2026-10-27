import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EvidenceEntry } from '../../../game/agent/evidence';
import { TerminalEvidence } from './TerminalEvidence';

const STATUS: EvidenceEntry = {
  tab: 1,
  prompt: 'quillwork $ ',
  typed: 'git status',
  words: null,
  lines: [
    { text: 'Changes to be committed:', tone: 'plain' },
    { text: '        modified:   app.ts', tone: 'staged' },
    { text: 'Untracked files:', tone: 'plain' },
    { text: '        todo.txt', tone: 'untracked' },
  ],
};

const WRITE: EvidenceEntry = {
  tab: 1,
  prompt: null,
  typed: null,
  words: 'Wrote .gitignore',
  lines: [],
};

function markup(entries: readonly EvidenceEntry[]): string {
  return renderToStaticMarkup(
    <TerminalEvidence entries={entries} caption="What Otto ran" by="otto" />,
  );
}

/** What a reader sees: the markup without its tags, line breaks kept. */
function text(html: string): string {
  return html.replace(/<[^>]+>/g, '').replaceAll('&gt;', '>');
}

describe('terminal evidence in the panel', () => {
  it('shows each typed line after its prompt, then its output, line by line', () => {
    const shown = text(markup([WRITE, STATUS]));
    expect(shown).toBe(
      'What Otto ran' +
        'Wrote .gitignore\n' +
        'quillwork $ git status\n' +
        'Changes to be committed:\n' +
        '        modified:   app.ts\n' +
        'Untracked files:\n' +
        '        todo.txt\n',
    );
  });

  it("colours output by meaning, as the terminal does, and the typist's lines as theirs", () => {
    const html = markup([STATUS]);
    expect(html).toContain('class="evidence evidence--otto"');
    expect(html).toContain('<span class="evidence__out--good">        modified:   app.ts');
    expect(html).toContain('<span class="evidence__out--bad">        todo.txt');
    // A box that scrolls takes the keyboard too, so long output can be read without a mouse.
    expect(html).toContain('<pre tabindex="0">');
  });

  it('shows nothing until there is something to show', () => {
    expect(markup([])).toBe('');
  });
});
