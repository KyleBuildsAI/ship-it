import type { Stars as StarSet } from '../../../game/missions/agentRunner';

/** The three skills a step rewards (docs/act1-directed.md section 1.4), in reading order. */
const SKILLS = [
  { key: 'plan', label: 'Plan' },
  { key: 'safety', label: 'Safety' },
  { key: 'check', label: 'Check' },
] as const;

/**
 * A step's stars, each named, so Kyle sees which skill he earned and which he lost. A
 * screen reader hears "earned" or "not earned" instead of the star shapes.
 */
export function Stars({ earned }: { earned: StarSet }) {
  return (
    <ul className="stars" aria-label="Stars">
      {SKILLS.map(({ key, label }) => (
        <li key={key} className={earned[key] ? 'stars__star stars__star--earned' : 'stars__star'}>
          <span aria-hidden="true">{earned[key] ? '★' : '☆'}</span> {label}
          <span className="visually-hidden">{earned[key] ? ' (earned)' : ' (not earned)'}</span>
        </li>
      ))}
    </ul>
  );
}
