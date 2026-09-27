import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/**
 * A second of silence as a WAV file, built in memory: 8-bit mono samples at the midpoint
 * value 128, behind the standard 44-byte header. No audio file lives in the repo.
 */
function silentWav(seconds = 1, sampleRate = 8000): Buffer {
  const samples = seconds * sampleRate;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + samples, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); // format chunk size
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28); // bytes per second: one byte per sample
  wav.writeUInt16LE(1, 32); // bytes per frame
  wav.writeUInt16LE(8, 34); // bits per sample
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(samples, 40);
  return wav;
}

const SILENCE = silentWav();

/**
 * Every test gets a browser context whose music requests are answered with silence, so
 * tests never depend on (or add load to) Wikimedia's servers, and CI works offline.
 */
export const test = base.extend({
  // Playwright calls the second argument `use`; a different name keeps React's lint rule quiet.
  context: async ({ context }, provide) => {
    await context.route('https://upload.wikimedia.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/wav', body: SILENCE }),
    );
    await provide(context);
  },
});
