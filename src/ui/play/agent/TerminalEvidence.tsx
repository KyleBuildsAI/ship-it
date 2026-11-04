import { useEffect, useRef } from 'react';
import type { EvidenceEntry } from '../../../game/agent/evidence';
import type { Typist } from '../../../game/agent/feed';
import type { Tone } from '../../../engine/git/cli/output';

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

/**
 * Terminal lines in the play panel, read-only: each typed line after its prompt, then its
 * output, in the terminal's monospace. The terminal stays put away while Kyle checks Otto
 * or answers a drill, so this is where he reads the evidence. Long output scrolls inside
 * the box, and the newest line stays in view, as a terminal keeps it. `by` colours the
 * typed lines: Kyle's looks in the accent, Otto's lines in his magenta.
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
  useEffect(() => {
    const element = screen.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [entries]);
  if (entries.length === 0) return null;
  return (
    <figure className={`evidence evidence--${by}`}>
      <figcaption>{caption}</figcaption>
      <pre ref={screen} tabIndex={0}>
        {entries.map((entry, index) => (
          <EntryLines key={String(index)} entry={entry} />
        ))}
      </pre>
    </figure>
  );
}
