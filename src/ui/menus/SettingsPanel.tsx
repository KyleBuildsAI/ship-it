import { useEffect, useRef, useState } from 'react';
import { getMentorStatus, type MentorStatus } from '../../mentor/client';
import { openMenu } from '../../game/hud';
import { leavePlay } from '../../game/play/play';
import {
  flushProgress,
  isSavingHere,
  progress,
  replaceSave,
  updateSave,
} from '../../game/progress';
import { exportSave, ImportError, importSave } from '../../game/save/exportImport';
import { createDefaultSave, type Settings } from '../../game/save/schema';
import { replayTutorial } from '../../game/tutorial';
import { download, saveFileName } from '../download';
import { useStore } from '../useStore';
import { MusicSettings } from './MusicSettings';
import { Overlay } from './Overlay';

function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  updateSave((save) => ({ ...save, settings: { ...save.settings, [key]: value } }));
}

function SageUsage() {
  const [status, setStatus] = useState<MentorStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getMentorStatus().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (status === null) return <p className="play-panel__muted">Checking Sage…</p>;
  if (status.offline) return <p className="play-panel__muted">Sage is offline: {status.message}</p>;
  const { calls, cap } = status.usage;
  return (
    <p className="play-panel__muted">
      Sage is {status.keyConfigured ? 'online' : 'running without a key'} · {calls} of {cap} calls
      used today
    </p>
  );
}

const ELSEWHERE = "SHIP IT is open in another tab, so this tab can't change your save.";

/** Settings (DESIGN.md section 6): how the game looks and behaves, and the save file. */
export function SettingsPanel() {
  const { save, status } = useStore(progress);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const settings = save?.settings;

  const exportFile = async () => {
    if (save === null) return;
    await flushProgress();
    const now = new Date();
    download(saveFileName(now), exportSave(save, now));
    setMessage('Save downloaded. Keep it somewhere safe.');
  };

  const importFile = async (file: File) => {
    try {
      const imported = importSave(await file.text());
      if (!isSavingHere()) {
        setMessage(ELSEWHERE);
        return;
      }
      leavePlay();
      setMessage((await replaceSave(imported)) ? 'Save imported.' : ELSEWHERE);
    } catch (error) {
      setMessage(error instanceof ImportError ? error.message : 'That file could not be imported.');
    }
  };

  const startOver = async () => {
    setConfirmReset(false);
    if (!isSavingHere()) {
      setMessage(ELSEWHERE);
      return;
    }
    leavePlay();
    const reset = await replaceSave(createDefaultSave(new Date()));
    setMessage(reset ? 'Progress reset. A fresh start.' : ELSEWHERE);
  };

  return (
    <Overlay title="Settings">
      {settings ? (
        <div className="settings-grid">
          <label>
            <span>Sage hints and grading</span>
            <input
              type="checkbox"
              checked={settings.mentorEnabled}
              onChange={(event) => {
                changeSetting('mentorEnabled', event.target.checked);
              }}
            />
          </label>
          <label>
            <span>Text size</span>
            <select
              value={settings.textSize}
              onChange={(event) => {
                changeSetting('textSize', event.target.value as Settings['textSize']);
              }}
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="x-large">Extra large</option>
            </select>
          </label>
          <label>
            <span>Reduced motion</span>
            <select
              value={settings.reducedMotion}
              onChange={(event) => {
                changeSetting('reducedMotion', event.target.value as Settings['reducedMotion']);
              }}
            >
              <option value="system">Follow Windows</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label>
            <span>Graphics quality</span>
            <select
              value={settings.graphicsQuality}
              onChange={(event) => {
                changeSetting('graphicsQuality', event.target.value as Settings['graphicsQuality']);
              }}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
      ) : null}
      <p className="play-panel__muted">
        Reduced motion and graphics apply to the 3D world when the game next loads.
      </p>
      <SageUsage />

      <MusicSettings />

      <p className="play-panel__eyebrow">Tutorial</p>
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button"
          onClick={() => {
            // Close Settings so the world is in view and gets the keys for the first step.
            openMenu(null);
            replayTutorial();
          }}
        >
          Replay tutorial
        </button>
      </div>

      <p className="play-panel__eyebrow">Save file</p>
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button"
          disabled={save === null}
          onClick={() => {
            void exportFile();
          }}
        >
          Export save
        </button>
        <button
          type="button"
          className="play-button"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Import save
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
        {confirmReset ? (
          <button
            type="button"
            className="play-button play-button--danger"
            onClick={() => {
              void startOver();
            }}
          >
            Yes, erase my progress
          </button>
        ) : (
          <button
            type="button"
            className="play-button"
            disabled={status === 'loading'}
            onClick={() => {
              setConfirmReset(true);
            }}
          >
            Start over
          </button>
        )}
      </div>
      {message ? (
        <p className="play-panel__muted" aria-live="polite">
          {message}
        </p>
      ) : null}
    </Overlay>
  );
}
