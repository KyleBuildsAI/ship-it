import { describe, expect, it } from 'vitest';
import { chooseBackend, clampPixelRatio, MAX_PIXEL_RATIO, readForcedBackend } from './backend';

describe('readForcedBackend', () => {
  it('forces WebGL2 when the URL asks for it', () => {
    expect(readForcedBackend('?backend=webgl2')).toBe('webgl2');
    expect(readForcedBackend('?debug=1&backend=webgl2')).toBe('webgl2');
  });

  it('ignores missing or unknown values', () => {
    expect(readForcedBackend('')).toBeNull();
    expect(readForcedBackend('?backend=webgl1')).toBeNull();
    expect(readForcedBackend('?backend=WEBGL2')).toBeNull();
  });
});

describe('chooseBackend', () => {
  it('uses WebGPU when an adapter is available', () => {
    expect(chooseBackend(null, true)).toBe('webgpu');
  });

  it('falls back to WebGL2 without an adapter', () => {
    expect(chooseBackend(null, false)).toBe('webgl2');
  });

  it('lets a forced backend win over the probe', () => {
    expect(chooseBackend('webgl2', true)).toBe('webgl2');
  });
});

describe('clampPixelRatio', () => {
  it('caps high-density screens at the maximum', () => {
    expect(clampPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
  });

  it('keeps normal ratios and never drops below 1', () => {
    expect(clampPixelRatio(1.5)).toBe(1.5);
    expect(clampPixelRatio(0.5)).toBe(1);
  });
});
