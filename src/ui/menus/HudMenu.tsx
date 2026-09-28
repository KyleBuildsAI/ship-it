import { toggleMusicMuted } from '../../game/audio/mute';
import { hud, openMenu, toggleActMenu } from '../../game/hud';
import { recommendedAct } from '../../game/play/catalog';
import { progress } from '../../game/progress';
import { releaseMouseFocus } from '../focus';
import { useStore } from '../useStore';
import { SettingsPanel } from './SettingsPanel';
import { StandupBoard } from './StandupBoard';
import { TrophyWall } from './TrophyWall';

/**
 * The Campus places (DESIGN.md section 4) as HUD buttons: the Act menus, the Standup
 * Board, the Trophy Wall, and Settings, reachable from anywhere in the world. Plus a
 * quick music switch, so silence is one click away.
 */
export function HudMenu() {
  const { menu, actMenu, terminalOpen } = useStore(hud);
  const musicOn = (useStore(progress).save?.settings.audioVolume ?? 0) > 0;
  return (
    <>
      <nav
        className={terminalOpen ? 'hud-menu hud-menu--above-terminal' : 'hud-menu'}
        aria-label="Menus"
      >
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={actMenu !== null}
          onClick={(event) => {
            toggleActMenu(recommendedAct(progress.get().save));
            releaseMouseFocus(event);
          }}
        >
          Acts
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
        <button
          type="button"
          className="glass hud-menu__button"
          aria-pressed={musicOn}
          title={musicOn ? 'Mute the music' : 'Play the music'}
          onClick={(event) => {
            toggleMusicMuted();
            releaseMouseFocus(event);
          }}
        >
          <span aria-hidden="true">♪ </span>Music
        </button>
      </nav>
      {menu === 'standup' ? <StandupBoard /> : null}
      {menu === 'trophies' ? <TrophyWall /> : null}
      {menu === 'settings' ? <SettingsPanel /> : null}
    </>
  );
}
