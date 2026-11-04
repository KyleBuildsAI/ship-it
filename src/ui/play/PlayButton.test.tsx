import type { ReactElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sampleAct, sampleMission } from '../../game/missions/sample.test-mission';
import { summarizeAct } from '../../game/play/actSummary';
import { setCatalog, setLazyCatalog } from '../../game/play/catalog';
import { leavePlay } from '../../game/play/play';
import { play } from '../../game/play/playStore';
import { cancelPendingPlay, pendingPlay, type PlayRequest } from '../../game/play/playWhenReady';
import { flushProgress, startProgress } from '../../game/progress';
import { createDefaultSave } from '../../game/save/schema';
import type { Store } from '../../game/store';
import { PlayButton } from './PlayButton';

// No browser runs these tests, so the hook just reads the store (as in ActMenu.test.tsx),
// and a press calls the button's click handler itself.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

const actTwo = { act: sampleAct, missions: [sampleMission] };
const playMission: PlayRequest = { kind: 'mission', id: sampleMission.id };

function press(request: PlayRequest, onStarted: () => void): void {
  const button: ReactElement = PlayButton({
    request,
    from: 'act-menu',
    onStarted,
    children: 'Play',
  });
  (button.props as { onClick: () => void }).onClick();
}

/** Waits until every promise the press set off has settled. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  const save = createDefaultSave(new Date());
  await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() });
});

afterEach(async () => {
  cancelPendingPlay();
  leavePlay();
  await flushProgress();
  vi.restoreAllMocks();
});

it('starts play during the press when its Act has loaded, then runs onStarted', async () => {
  setCatalog({ acts: [actTwo] });
  const onStarted = vi.fn();
  press(playMission, onStarted);
  expect(play.get().activity?.kind).toBe('mission');
  await settle();
  expect(onStarted).toHaveBeenCalledOnce();
});

it("leaves onStarted unrun when the Act doesn't download, so the menu stays to say so", async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const load = () => Promise.reject(new Error('offline'));
  setLazyCatalog([{ summary: summarizeAct(actTwo), load }]);
  const onStarted = vi.fn();
  press(playMission, onStarted);
  expect(pendingPlay.get().waiting).toEqual(playMission);
  await settle();
  expect(pendingPlay.get().failed).toEqual(playMission);
  expect(onStarted).not.toHaveBeenCalled();
  expect(play.get().activity).toBeNull();
});
