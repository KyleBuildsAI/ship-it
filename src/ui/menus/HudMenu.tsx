import { hud, openMenu, toggleActMenu } from '../../game/hud';
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
          onClick={toggleActMenu}
        >
          Act 2
        </button>
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={menu === 'standup'}
          onClick={() => {
            openMenu(menu === 'standup' ? null : 'standup');
          }}
        >
          Standup
        </button>
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={menu === 'trophies'}
          onClick={() => {
            openMenu(menu === 'trophies' ? null : 'trophies');
          }}
        >
          Trophies
        </button>
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={menu === 'settings'}
          onClick={() => {
            openMenu(menu === 'settings' ? null : 'settings');
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
