import { useLayoutEffect, useRef } from 'react';
import type { EvidenceEntry } from '../../../game/agent/evidence';
import type { Typist } from '../../../game/agent/feed';
import type { Tone } from '../../../engine/git/cli/output';
import { applyEvidenceScroll, evidenceScroll } from './evidenceScroll';

/**
 * Output colours by meaning, as the terminal's own (ui/terminal/tones.ts): what git calls
 * staged or added in green, unstaged, untracked, removed and errors in red.
 */
const TONE_CLASS: Readonly<Record<Tone, string | null>> = {
  plain: null,
  error: 'bad',
  hint: 'note',
  staged: 'good',
  unstaged: 'bad',
  untracked: 'bad',
  added: 'good',
  removed: 'bad',
  hunk: 'info',
  meta: 'strong',
  commit: 'note',
};

/** One action's lines: what it did in words, the prompt and what was typed, its output. */
function EntryLines({ entry }: { entry: EvidenceEntry }) {
  return (
    <>
      {entry.words === null ? null : (
        <span className="evidence__words">
          {entry.words}
          {'\n'}
        </span>
      )}
      {entry.prompt === null ? null : (
        <span>
          <span className="evidence__prompt">{entry.prompt}</span>
          {entry.typed === null ? null : <span className="evidence__typed">{entry.typed}</span>}
          {'\n'}
        </span>
      )}
      {entry.lines.map((line, index) => {
        const tone = TONE_CLASS[line.tone];
        return (
          <span
            key={String(index)}
            className={tone === null ? undefined : `evidence__out--${tone}`}
          >
            {line.text}
            {'\n'}
          </span>
        );
      })}
    </>
  );
}

const NO_ENTRIES: readonly EvidenceEntry[] = [];

/**
 * Terminal lines in the play panel, read-only: each typed line after its prompt, then its
 * output, in the terminal's monospace. The terminal stays put away while Kyle checks Otto
 * or answers a drill, so this is where he reads the evidence. Long output scrolls inside
 * the box. While lines arrive the newest comes into view, and a box whose output is all
 * new starts at the top (evidenceScroll.ts). `by` colours the typed lines: Kyle's looks in
 * the accent, Otto's lines in his magenta.
 */
export function TerminalEvidence({
  entries,
  caption,
  by,
}: {
  entries: readonly EvidenceEntry[];
  caption: string;
  by: Typist;
}) {
  const screen = useRef<HTMLPreElement>(null);
  // What the box showed before, to tell lines arriving from a whole new output.
  const shown = useRef(NO_ENTRIES);
  // Before paint, so the box never flashes at the wrong place first.
  useLayoutEffect(() => {
    const move = evidenceScroll(shown.current, entries);
    shown.current = entries;
    if (screen.current !== null) applyEvidenceScroll(screen.current, move);
  }, [entries]);
  if (entries.length === 0) return null;
  return (
    <figure className={`evidence evidence--${by}`}>
      <figcaption>{caption}</figcaption>
      <pre ref={screen} tabIndex={0}>
        {entries.map((entry, index) => (
          // One span per entry, so applyEvidenceScroll can find where the newest starts.
          <span key={String(index)}>
            <EntryLines entry={entry} />
          </span>
        ))}
      </pre>
    </figure>
  );
}
