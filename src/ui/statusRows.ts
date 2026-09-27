import type { DevStatus, MentorState, RenderBackend, SaveState } from '../game/devStatus';

export type Tone = 'ok' | 'warn' | 'neutral';

export interface StatusRow {
  label: string;
  value: string;
  tone: Tone;
}

const BACKEND: Record<RenderBackend, Omit<StatusRow, 'label'>> = {
  none: { value: 'none', tone: 'neutral' },
  starting: { value: 'starting', tone: 'neutral' },
  webgpu: { value: 'WebGPU', tone: 'ok' },
  webgl2: { value: 'WebGL2 fallback', tone: 'warn' },
  failed: { value: 'unavailable', tone: 'warn' },
};

const MENTOR: Record<MentorState, Omit<StatusRow, 'label'>> = {
  offline: { value: 'offline', tone: 'neutral' },
  online: { value: 'online', tone: 'ok' },
};

const SAVE: Record<SaveState, Omit<StatusRow, 'label'>> = {
  none: { value: 'none', tone: 'neutral' },
  saved: { value: 'saved', tone: 'ok' },
  error: { value: 'error', tone: 'warn' },
};

/** Turns raw dev status into the labeled rows the badge displays. */
export function statusRows(status: DevStatus): StatusRow[] {
  const rows: StatusRow[] = [{ label: 'Render', ...BACKEND[status.backend] }];
  if (status.threeRevision !== null) {
    rows.push({ label: 'three.js', value: `r${status.threeRevision}`, tone: 'neutral' });
  }
  rows.push({ label: 'Sage', ...MENTOR[status.mentor] });
  rows.push({ label: 'Save', ...SAVE[status.save] });
  return rows;
}
