import type { ReactNode } from 'react';
import {
  pendingPlay,
  playWhenReady,
  samePlayRequest,
  type PlayMenu,
  type PlayRequest,
} from '../../game/play/playWhenReady';
import { useStore } from '../useStore';

/**
 * A menu's button that starts play through the loader (playWhenReady). While the Acts it
 * needs download, it says "Loading…" and can't be pressed again. Buttons inside an activity
 * start at once through playAgain instead: that activity's Act has loaded already.
 */
export function PlayButton({
  request,
  from,
  className = 'play-button',
  disabled = false,
  onStarted,
  children,
}: {
  request: PlayRequest;
  /** The menu the button is in, so only this menu's button says "Loading…" for the press. */
  from: PlayMenu;
  className?: string;
  disabled?: boolean;
  /** Runs once play has started, never after a failed download, so the menu can close. */
  onStarted?: () => void;
  children: ReactNode;
}) {
  const pending = useStore(pendingPlay);
  const loading = pending.from === from && samePlayRequest(pending.waiting, request);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || loading}
      onClick={() => {
        void playWhenReady(request, from).then((outcome) => {
          if (outcome === 'started') onStarted?.();
        });
      }}
    >
      {loading ? 'Loading…' : children}
    </button>
  );
}

/**
 * The line a menu shows when its own press's Act didn't download, until the next press or
 * until the menu closes. The failed download is forgotten, so the next press tries again.
 */
export function LoadFailedAlert({ from }: { from: PlayMenu }) {
  const { from: pressedIn, failed } = useStore(pendingPlay);
  // The other menu's failed press is for that menu to report.
  if (failed === null || pressedIn !== from) return null;
  return (
    <p className="play-panel__alert" role="alert">
      {`Act ${String(failed.act)} didn't load. Check SHIP IT is still running, then try again. ` +
        'If it keeps failing, reload the page; your progress is saved.'}
    </p>
  );
}
