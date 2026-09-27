import { describe, expect, it } from 'vitest';
import type { DevStatus } from '../game/devStatus';
import { statusRows } from './statusRows';

const base: DevStatus = {
  backend: 'none',
  threeRevision: null,
  mentor: 'offline',
  save: 'none',
  music: 'off',
};

describe('statusRows', () => {
  it('hides the three.js row until a revision is known', () => {
    expect(statusRows(base).map((row) => row.label)).toEqual(['Render', 'Sage', 'Save', 'Music']);
  });

  it('shows the three.js revision with an r prefix once known', () => {
    const rows = statusRows({ ...base, threeRevision: '184' });
    expect(rows).toContainEqual({ label: 'three.js', value: 'r184', tone: 'neutral' });
  });

  it('marks WebGPU as ok and the WebGL2 fallback as a warning', () => {
    expect(statusRows({ ...base, backend: 'webgpu' })[0]).toEqual({
      label: 'Render',
      value: 'WebGPU',
      tone: 'ok',
    });
    expect(statusRows({ ...base, backend: 'webgl2' })[0]).toEqual({
      label: 'Render',
      value: 'WebGL2 fallback',
      tone: 'warn',
    });
  });

  it('reports mentor and save states', () => {
    const rows = statusRows({ ...base, mentor: 'online', save: 'error' });
    expect(rows).toContainEqual({ label: 'Sage', value: 'online', tone: 'ok' });
    expect(rows).toContainEqual({ label: 'Save', value: 'error', tone: 'warn' });
  });

  it('tells the player how to start the music, and warns when it is offline', () => {
    expect(statusRows({ ...base, music: 'waiting' })).toContainEqual({
      label: 'Music',
      value: 'click to start',
      tone: 'neutral',
    });
    expect(statusRows({ ...base, music: 'unavailable' })).toContainEqual({
      label: 'Music',
      value: 'offline',
      tone: 'warn',
    });
  });
});
