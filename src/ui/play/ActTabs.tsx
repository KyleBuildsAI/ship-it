import { ROADMAP } from '../../content/roadmap';
import { openActMenu } from '../../game/hud';
import { getCatalog } from '../../game/play/catalog';
import { isUnlocked } from '../../game/play/unlock';
import { progress } from '../../game/progress';
import { useStore } from '../useStore';

/**
 * Tabs across the top of the Act menu, one per Act, once there's more than one. Preview
 * mode shows every Act on the roadmap, built or not; otherwise only the Acts that ship.
 */
export function ActTabs({ current }: { current: number }) {
  const { save } = useStore(progress);
  const acts = isUnlocked(save)
    ? ROADMAP.map((entry) => entry.act)
    : getCatalog().acts.map(({ act }) => act.act);
  if (acts.length < 2) return null;
  return (
    <div className="act-tabs" role="tablist" aria-label="Acts">
      {acts.map((act) => (
        <button
          key={act}
          type="button"
          role="tab"
          aria-selected={act === current}
          className="act-tabs__tab"
          onClick={() => {
            openActMenu(act);
          }}
        >
          Act {act}
        </button>
      ))}
    </div>
  );
}
