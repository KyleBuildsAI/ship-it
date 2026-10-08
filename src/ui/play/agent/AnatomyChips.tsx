import { ANATOMY, type AnatomyPart } from '../../../game/missions/agentSchema';

const LABELS: Readonly<Record<AnatomyPart, string>> = {
  goal: 'Goal',
  place: 'Place',
  limits: 'Limits',
  check: 'Check',
};

/**
 * The four parts of a good request (goal · place · limits · check), with the ones the
 * chosen card had lit. Seeing the gaps after the step is how Kyle learns to direct
 * better: a card with no place is how Otto ends up in the wrong folder.
 */
export function AnatomyChips({ covers }: { covers: readonly AnatomyPart[] }) {
  return (
    <ul className="anatomy" aria-label="What your request had">
      {ANATOMY.map((part) => {
        const has = covers.includes(part);
        return (
          <li key={part} className={has ? 'anatomy__chip anatomy__chip--lit' : 'anatomy__chip'}>
            {LABELS[part]}
            <span className="visually-hidden">{has ? ' (had it)' : ' (missing)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
