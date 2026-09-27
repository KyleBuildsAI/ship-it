import { worldState } from '../game/worldState';
import { useStore } from './useStore';

const HINTS = {
  campus:
    'WASD or click to walk · Space to jump · drag to look around · step through the glowing Act 2 portal',
  gitworld: 'Workbench · Loading Dock · Vault. Try git status in the terminal.',
} as const;

export function TitleCard() {
  const { zone, hasMoved } = useStore(worldState);
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
        <h1 className="title-card__zone">{zone === 'campus' ? 'Campus' : 'Git World'}</h1>
      )}
      <p className="title-card__tagline">{HINTS[zone]}</p>
    </header>
  );
}
