import { hud, openMenu, toggleActMenu } from '../../game/hud';
import { releaseMouseFocus } from '../focus';
import { useStore } from '../useStore';
import { SettingsPanel } from './SettingsPanel';
import { StandupBoard } from './StandupBoard';
import { TrophyWall } from './TrophyWall';

/**
 * The Campus places (DESIGN.md section 4) as HUD buttons: Act 2's menu, the Standup
 * Board, the Trophy Wall, and Settings, reachable from anywhere in the world.
 */
export function HudMenu() {
  const { menu, actMenuOpen, terminalOpen } = useStore(hud);
  return (
    <>
      <nav
        className={terminalOpen ? 'hud-menu hud-menu--above-terminal' : 'hud-menu'}
        aria-label="Menus"
      >
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={actMenuOpen}
          onClick={(event) => {
            toggleActMenu();
            releaseMouseFocus(event);
          }}
        >
          Act 2
        </button>
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={menu === 'standup'}
          onClick={(event) => {
            openMenu(menu === 'standup' ? null : 'standup');
            releaseMouseFocus(event);
          }}
        >
          Standup
        </button>
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={menu === 'trophies'}
          onClick={(event) => {
            openMenu(menu === 'trophies' ? null : 'trophies');
            releaseMouseFocus(event);
          }}
        >
          Trophies
        </button>
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={menu === 'settings'}
          onClick={(event) => {
            openMenu(menu === 'settings' ? null : 'settings');
            releaseMouseFocus(event);
          }}
        >
          Settings
        </button>
      </nav>
      {menu === 'standup' ? <StandupBoard /> : null}
      {menu === 'trophies' ? <TrophyWall /> : null}
      {menu === 'settings' ? <SettingsPanel /> : null}
    </>
  );
}
