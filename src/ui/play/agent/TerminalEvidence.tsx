import { useLayoutEffect, useRef } from 'react';
import type { EvidenceEntry } from '../../../game/agent/evidence';
import type { Typist } from '../../../game/agent/feed';
import type { Tone } from '../../../engine/git/cli/output';
import { evidenceScroll } from './evidenceScroll';

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
 * Scrolls `box` so its newest entry starts where its first one does, in sight from its
 * typed line on. The box can't scroll past its end, so a short newest entry just brings
 * the bottom into view, as a terminal does.
 */
function scrollToNewest(box: HTMLElement): void {
  const first = box.firstElementChild;
  const newest = box.lastElementChild;
  if (first instanceof HTMLElement && newest instanceof HTMLElement) {
    box.scrollTop = newest.offsetTop - first.offsetTop;
  }
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
    const box = screen.current;
    if (box === null) return;
    if (move === 'top') box.scrollTop = 0;
    if (move === 'newest') scrollToNewest(box);
  }, [entries]);
  if (entries.length === 0) return null;
  return (
    <figure className={`evidence evidence--${by}`}>
      <figcaption>{caption}</figcaption>
      <pre ref={screen} tabIndex={0}>
        {entries.map((entry, index) => (
          // One span per entry, so scrollToNewest can find where the newest starts.
          <span key={String(index)}>
            <EntryLines entry={entry} />
          </span>
        ))}
      </pre>
    </figure>
  );
}
