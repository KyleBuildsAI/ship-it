import { line, type OutputLine } from '../../git/cli/output';
import type { ShellResult } from '../shell';

export type Choice = 'yes' | 'yesToAll' | 'no' | 'noToAll';

/**
 * A question a cmdlet asks before it goes on, like Remove-Item's "Are you sure?". The
 * next line typed answers it, and `answer` carries on from there (it may ask again).
 */
export interface ConfirmRequest {
  readonly message: string;
  readonly answer: (choice: Choice) => ShellResult;
}

/**
 * PowerShell's choice line, which takes the prompt's place while a question is open. It
 * can't be captured (a script runs non-interactive), so it's PowerShell's resource text.
 */
export const CHOICES =
  '[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): ';

const HELP: readonly OutputLine[] = [
  line('Y - Continue with only the next step of the operation.'),
  line('A - Continue with all the steps of the operation.'),
  line('N - Skip this operation and proceed with the next operation.'),
  line('L - Skip this operation and all subsequent operations.'),
  line(
    'S - Pause the current pipeline and return to the command prompt. Type "exit" to resume the pipeline.',
  ),
];

/** What prints when a question opens: its caption, then the question. */
export function question(request: ConfirmRequest): OutputLine[] {
  return [line('Confirm', 'meta'), line(request.message)];
}

const ANSWERS: Readonly<Record<string, Choice>> = {
  '': 'yes',
  y: 'yes',
  yes: 'yes',
  a: 'yesToAll',
  'yes to all': 'yesToAll',
  n: 'no',
  no: 'no',
  l: 'noToAll',
  'no to all': 'noToAll',
};

/**
 * Reads a typed answer: a letter or the whole label, in any case, and Enter for the
 * default (Y). Anything else keeps the question open, with help for `?` and a note for S.
 */
export function readAnswer(typed: string): { choice: Choice } | { again: OutputLine[] } {
  const text = typed.trim().toLowerCase();
  const choice = ANSWERS[text];
  if (choice !== undefined) return { choice };
  if (text === '?') return { again: [...HELP] };
  if (text === 's' || text === 'suspend')
    return { again: [line("This sandbox can't pause a command. Answer Y or N.", 'hint')] };
  return { again: [] };
}
