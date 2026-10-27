import type { ArtifactKind } from '../../game/missions/lessonSchema';

/*
 * How a lesson artifact's long lines wrap (LessonView.tsx). Only about 46 characters fit
 * across the box, so every line wraps rather than hide its end past the edge, where the
 * very words a card asks about used to sit (auth-check's `Boolean(doc.ownerId)`).
 */

/** Kinds written as prose, which wrap flush like any paragraph. */
const PROSE_KINDS: ReadonlySet<ArtifactKind> = new Set(['agent-message', 'issue', 'pull-request']);

/**
 * How far in, in characters, a long line carries on once it wraps: past the line's own
 * indent (and a diff's + or -), so the rest reads as that line going on, never as a new
 * one. In code and diffs, where a line ends is part of what it says. Prose wraps flush.
 */
export function hangingIndent(kind: ArtifactKind, line: string): number {
  if (PROSE_KINDS.has(kind)) return 0;
  const lead = kind === 'diff' ? /^[-+ ]?[ \t]*/ : /^[ \t]*/;
  return (lead.exec(line)?.[0].length ?? 0) + 2;
}
