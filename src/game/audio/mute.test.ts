import { beforeEach, describe, expect, it } from 'vitest';
import { progress } from '../progress';
import { createDefaultSave } from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { toggleMusicMuted } from './mute';

function withVolume(audioVolume: number) {
  const save = createDefaultSave(TEST_NOW);
  progress.update({
    status: 'ready',
    save: { ...save, settings: { ...save.settings, audioVolume } },
    problem: null,
  });
}

const volume = () => progress.get().save?.settings.audioVolume;

describe('toggleMusicMuted', () => {
  beforeEach(() => {
    withVolume(0.4);
  });

  it('mutes, then brings back the volume the player chose', () => {
    toggleMusicMuted();
    expect(volume()).toBe(0);

    toggleMusicMuted();
    expect(volume()).toBe(0.4);
  });

  it('unmutes a save that was already silent to a sensible volume', () => {
    withVolume(0);
    toggleMusicMuted();

    // Whatever this page last heard, never 0: unmuting must make a sound.
    expect(volume()).toBeGreaterThan(0);
  });
});
