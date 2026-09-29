import { useCallback, useSyncExternalStore } from 'react';
import { machineQueries } from '../../engine/machine/queries';
import type { Workspace } from '../../engine/workspace';
import { tabLabel } from './feedText';

/**
 * Every open tab and the folder it stands in, as one string. React compares snapshots
 * with ===, so a string that's equal whenever the tabs are lets it skip the renders that
 * a new array on every engine event would cause.
 */
function tabsKey(ws: Workspace): string {
  if (ws.machine === null) return '';
  return machineQueries(ws.machine)
    .tabs()
    .map(({ tab, cwd, active }) => `${String(tab)}${active ? '*' : ''}:${cwd}`)
    .join('|');
}

/**
 * The strip above the terminal on a laptop: `PS 1 · PS 2`, the active tab lit, each
 * tab's folder on hover. It's read-only, and it follows the machine's own events, as the
 * lanterns in the world do. Act 2's sandboxes have no laptop, so it draws nothing there.
 */
export function TerminalTabs({ ws, readOnly }: { ws: Workspace; readOnly: boolean }) {
  const subscribe = useCallback((onChange: () => void) => ws.events.on(onChange), [ws]);
  const snapshot = useCallback(() => tabsKey(ws), [ws]);
  // The key only tells React when to draw again; the tabs are read fresh below.
  useSyncExternalStore(subscribe, snapshot, snapshot);
  if (ws.machine === null) return null;
  const queries = machineQueries(ws.machine);
  return (
    <div className="terminal-tabs">
      <ol aria-label="Terminal tabs">
        {queries.tabs().map(({ tab, cwd, active }) => (
          <li key={tab} title={queries.display(cwd)} aria-current={active ? 'true' : undefined}>
            {tabLabel(tab)}
          </li>
        ))}
      </ol>
      {readOnly ? <span className="terminal-tabs__note">Read-only while Otto works</span> : null}
    </div>
  );
}
