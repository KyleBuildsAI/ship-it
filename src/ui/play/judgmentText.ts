import { display } from '../../engine/machine/winPath';
import type { BaseAction } from '../../game/missions/agentSchema';

/*
 * Words for a judgment drill's card (JudgmentDrillView.tsx). They live apart from the
 * components so that file only exports components, which React's fast refresh needs.
 */

/** What an action does, as Kyle reads it: a line as typed, anything else in words. */
export function actionText(action: BaseAction): string {
  switch (action.do) {
    case 'run':
      return action.line;
    case 'write':
      return `Write the file ${display(action.path)}`;
    case 'newTerminal':
      return 'Open a new terminal';
    case 'useTerminal':
      return `Switch to terminal ${String(action.tab)}`;
  }
}

/** How many times Kyle has answered this drill before: each attempt shuffles afresh. */
export function attemptsBefore(
  history: readonly { readonly drillId: string }[],
  drillId: string,
): number {
  return history.filter((entry) => entry.drillId === drillId).length;
}
