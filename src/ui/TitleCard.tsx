import { worldState } from '../game/worldState';
import { useStore } from './useStore';

const HINT = 'WASD or click to walk · drag to look around';

export function TitleCard() {
  const { hasMoved } = useStore(worldState);
  // The big title greets the player, then steps aside once they start exploring.
  return (
    <header className={hasMoved ? 'title-card title-card--compact' : 'title-card'}>
      {hasMoved ? (
        <h1 className="title-card__zone">Campus</h1>
      ) : (
        <>
          <p className="title-card__eyebrow">Quillwork AI</p>
          <h1 className="title-card__title">SHIP IT</h1>
        </>
      )}
      <p className="title-card__tagline">{HINT}</p>
    </header>
  );
}
