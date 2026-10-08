import { CHOICES } from '../../engine/shell/machine/confirm';
import type { Reveal } from './pace';

/*
 * Otto's run log (docs/act1-directed.md section 1.2): one row per action, with how it
 * ended, beside his speech bubble. It is built from the same reveals the terminal prints,
 * so a row appears the moment its result shows on screen, never ahead of the typing.
 */

/**
 * How an action ended. `asked`: it ran and PowerShell's Confirm question is open, so the
 * next row is Otto's answer. `denied`: Kyle denied it, so it never ran.
 */
export type RowStatus = 'ok' | 'failed' | 'asked' | 'denied';

export interface RunRow {
  /**
   * The line Otto typed, or his answer's letter. An action that types nothing (a file
   * write, a new or switched terminal) has words saying what it did instead.
   */
  readonly text: string;
  /** Otto typed `text` at a prompt, so the panel shows it as code. */
  readonly typed: boolean;
  /** The row answers PowerShell's Confirm question. */
  readonly answer: boolean;
  readonly status: RowStatus;
}

export interface RunLog {
  readonly rows: readonly RunRow[];
  /** What Otto has typed so far of the line in progress, or null between lines. */
  readonly typing: string | null;
  /** PowerShell's choice line is the open prompt, so whatever is typed next answers it. */
  readonly atChoices: boolean;
  /** The line in progress was typed at the choice line: it answers the question. */
  readonly answering: boolean;
  /** Kyle typed the line in progress (a look chip): it gets no row, as it isn't Otto's. */
  readonly kyle: boolean;
}

export const EMPTY_RUN_LOG: RunLog = {
  rows: [],
  typing: null,
  atChoices: false,
  answering: false,
  kyle: false,
};

/** The log once one drawn frame's reveals have shown. */
export function logReveals(log: RunLog, reveals: readonly Reveal[]): RunLog {
  return reveals.reduce(logReveal, log);
}

function logReveal(log: RunLog, reveal: Reveal): RunLog {
  if (reveal.kind === 'keys') {
    // The first keys of a line start it; the rest carry on what is already typed.
    if (reveal.from > 0) return { ...log, typing: (log.typing ?? '') + reveal.text };
    return { ...log, typing: reveal.text, answering: log.atChoices, kyle: reveal.by === 'kyle' };
  }
  const { beat } = reveal;
  switch (beat.kind) {
    case 'prompt':
      return { ...log, atChoices: beat.text === CHOICES };
    case 'enter':
      return { ...log, atChoices: false };
    case 'cancel':
      return endLine(log, 'denied');
    case 'result':
      if (beat.asking) return endLine(log, 'asked', beat.label);
      return endLine(log, beat.exitCode === 0 ? 'ok' : 'failed', beat.label);
    case 'divider':
    case 'type':
    case 'output':
    case 'world':
      return log;
  }
}

/** A row's words when an untyped action came with no label: never empty, never a guess. */
export const UNLABELLED = 'Did a step without typing';

/** `label` names an action that typed nothing; a typed line always shows itself. */
function endLine(log: RunLog, status: RowStatus, label?: string): RunLog {
  const done = { typing: null, answering: false, kyle: false };
  if (log.kyle) return { ...log, ...done };
  const row: RunRow =
    log.typing === null
      ? { text: label ?? UNLABELLED, typed: false, answer: false, status }
      : { text: log.typing, typed: true, answer: log.answering, status };
  return { ...log, rows: [...log.rows, row], ...done };
}

/**
 * Kyle denied an action that types nothing, like a file write: no typed line ends in the
 * terminal, so its row is added here, the moment he decides.
 */
export function logDenied(log: RunLog, label: string): RunLog {
  const row: RunRow = { text: label, typed: false, answer: false, status: 'denied' };
  return { ...log, rows: [...log.rows, row] };
}
