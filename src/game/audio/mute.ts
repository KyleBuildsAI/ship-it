import { updateSave } from '../progress';

/** The volume a first unmute brings back: the save's default. */
const DEFAULT_VOLUME = 0.7;

// Remembered for this page only, so unmuting returns to the volume the player chose.
let lastAudible = DEFAULT_VOLUME;

/** The HUD's ♪ button: mute sets the music volume to 0, unmute restores the last volume. */
export function toggleMusicMuted(): void {
  updateSave((save) => {
    const { audioVolume } = save.settings;
    if (audioVolume > 0) lastAudible = audioVolume;
    const next = audioVolume > 0 ? 0 : lastAudible;
    return { ...save, settings: { ...save.settings, audioVolume: next } };
  });
}
