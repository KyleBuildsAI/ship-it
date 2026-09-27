import { createStore } from './store';

/** Which GPU API three.js is drawing with. 'none' means no renderer is running. */
export type RenderBackend = 'none' | 'starting' | 'webgpu' | 'webgl2' | 'failed';

/** Whether Sage, the AI mentor, can be reached. */
export type MentorState = 'offline' | 'online';

/** Whether player progress is being persisted. */
/** 'elsewhere': another tab holds the save, so this one doesn't write it. */
export type SaveState = 'none' | 'saved' | 'error' | 'elsewhere';

export interface DevStatus {
  backend: RenderBackend;
  threeRevision: string | null;
  mentor: MentorState;
  save: SaveState;
}

/**
 * Status shown in the corner dev badge. The game layer (renderer, mentor client,
 * save system) writes to it; the React HUD reads it.
 */
export const devStatus = createStore<DevStatus>({
  backend: 'none',
  threeRevision: null,
  mentor: 'offline',
  save: 'none',
});
