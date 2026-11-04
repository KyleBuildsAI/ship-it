import type { ReactNode } from 'react';
import { isActLoaded } from '../../game/play/catalog';
import {
  actsNeeded,
  pendingPlay,
  playWhenReady,
  samePlayRequest,
  type PlayRequest,
} from '../../game/play/playWhenReady';
import { useStore } from '../useStore';

/**
 * A menu's button that starts play through the loader (playWhenReady). While the Acts it
 * needs download, it says "Loading…" and can't be pressed again. Buttons inside an activity
 * call their starters directly instead: that activity's Act has loaded already.
 */
export function PlayButton({
  request,
  className = 'play-button',
  disabled = false,
  onStarted,
  children,
}: {
  request: PlayRequest;
  className?: string;
  disabled?: boolean;
  /** Runs once play has started, never after a failed download, so the menu can close. */
  onStarted?: () => void;
  children: ReactNode;
}) {
  const { waiting } = useStore(pendingPlay);
  const loading = samePlayRequest(waiting, request);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || loading}
      onClick={() => {
        void playWhenReady(request).then((outcome) => {
          if (outcome === 'started') onStarted?.();
        });
      }}
    >
      {loading ? 'Loading…' : children}
    </button>
  );
}

/**
 * The line a menu shows when a press's Act didn't download. The failed download is
 * forgotten, so that Act still counts as not loaded, and the next press tries again.
 */
export function LoadFailedAlert() {
  const { failed } = useStore(pendingPlay);
  if (failed === null) return null;
  // A review can need two Acts, so this names one still missing. If none is, it has loaded
  // since (another menu fetched it), and pressing again will work: nothing to warn about.
  const act = actsNeeded(failed, new Date()).find((needed) => !isActLoaded(needed));
  if (act === undefined) return null;
  return (
    <p className="play-panel__alert" role="alert">
      {`Act ${String(act)} didn't load. Check SHIP IT is still running, then try again. ` +
        'If it keeps failing, reload the page; your progress is saved.'}
    </p>
  );
}
