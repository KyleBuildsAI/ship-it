import { tutorial } from '../game/tutorial';
import { perActIsland } from '../game/world/zones';
import { worldState, type ZoneId } from '../game/worldState';
import { useStore } from './useStore';

const HINTS: Record<ZoneId, string> = {
  campus:
    'WASD or click to walk · Space to jump · drag to look around · step through a glowing portal',
  gitworld: 'Workbench · Loading Dock · Vault. Try git status in the terminal.',
  machine: 'Folders are terraces, terminals are lanterns. Try cd and mkdir in the terminal.',
  // Each Act island's line lives with its other data in zones.ts.
  ...perActIsland((island) => island.hint),
};

const ZONE_NAMES: Record<ZoneId, string> = {
  campus: 'Campus',
  gitworld: 'Git World',
  machine: 'The Machine',
  ...perActIsland((island) => island.title),
};

export function TitleCard() {
  const { zone, hasMoved } = useStore(worldState);
  const { step, finished } = useStore(tutorial);
  // The tutorial card teaches the same controls one at a time, so the hint steps aside for it.
  const showHint = step === null && !finished;
  // The big title greets the player, then steps aside once they start exploring.
  const showTitle = zone === 'campus' && !hasMoved;
  return (
    <header className={showTitle ? 'title-card' : 'title-card title-card--compact'}>
      {showTitle ? (
        <>
          <p className="title-card__eyebrow">Quillwork AI</p>
          <h1 className="title-card__title">SHIP IT</h1>
        </>
      ) : (
        <h1 className="title-card__zone">{ZONE_NAMES[zone]}</h1>
      )}
      {showHint ? <p className="title-card__tagline">{HINTS[zone]}</p> : null}
    </header>
  );
}
