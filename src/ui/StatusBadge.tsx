import { devStatus } from '../game/devStatus';
import { statusRows } from './statusRows';
import { useStore } from './useStore';

export function StatusBadge() {
  const rows = statusRows(useStore(devStatus));

  return (
    <dl className="glass status-badge" aria-label="Developer status">
      {rows.map((row) => (
        <div key={row.label} className="status-badge__row">
          <dt>{row.label}</dt>
          <dd data-tone={row.tone}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
