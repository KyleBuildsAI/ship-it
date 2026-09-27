import { creditFor, TRACKS } from '../../content/music';
import { music } from '../../game/audio/music';
import { progress, updateSave } from '../../game/progress';
import { describeMusic } from '../musicText';
import { useStore } from '../useStore';

const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/';

/** Settings' music section: the volume, what's playing, and a credit for every recording. */
export function MusicSettings() {
  const volume = useStore(progress).save?.settings.audioVolume ?? 0;
  const status = useStore(music);
  const percent = Math.round(volume * 100);

  return (
    <>
      <p className="play-panel__eyebrow">Music</p>
      <div className="settings-slider">
        <label htmlFor="music-volume">Music volume</label>
        <input
          id="music-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          aria-valuetext={`${String(percent)}%`}
          onChange={(event) => {
            const audioVolume = Number(event.target.value) / 100;
            updateSave((save) => ({ ...save, settings: { ...save.settings, audioVolume } }));
          }}
        />
        <output htmlFor="music-volume">{percent}%</output>
      </div>
      <p className="play-panel__muted" aria-live="polite">
        {describeMusic(status, volume)}
      </p>
      <details className="music-credits">
        <summary>Music credits</summary>
        <ul>
          {TRACKS.map((track) => (
            <li key={track.id}>
              {creditFor(track)}{' '}
              <a href={track.page} target="_blank" rel="noreferrer">
                Source
              </a>
              {track.license === 'CC BY 3.0' ? (
                <>
                  {' · '}
                  <a href={CC_BY_3} target="_blank" rel="noreferrer">
                    License
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
