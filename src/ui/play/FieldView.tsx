import { useState } from 'react';
import { getAct } from '../../game/play/catalog';
import type { FieldVerdict } from '../../game/play/fieldCheck';
import { submitFieldPaste } from '../../game/play/fieldPlay';
import { leavePlay } from '../../game/play/play';
import type { FieldActivity } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { useStore } from '../useStore';

/**
 * The Field Mission (DESIGN.md section 8): a checklist of real work on SandCastles, then
 * paste checks that verify it. Passed checks are saved, so it can be done over days.
 */
export function FieldView({ activity }: { activity: FieldActivity }) {
  const field = getAct(activity.act).act.fieldMission;
  const { save } = useStore(progress);
  const [pastes, setPastes] = useState<Record<string, string>>({});
  const [verdicts, setVerdicts] = useState<Record<string, FieldVerdict>>({});
  const saved = save?.fieldMissions[field.id];

  return (
    <>
      <header className="play-panel__header">
        <h2>Field Mission: {field.title}</h2>
        <button type="button" className="play-panel__close" aria-label="Leave" onClick={leavePlay}>
          ×
        </button>
      </header>
      <p className="play-panel__eyebrow">On your real {field.repoName} repo</p>
      {field.briefing.map((line) => (
        <p key={line} className="play-panel__instruction">
          {line}
        </p>
      ))}
      <ul className="field-tasks">
        {field.checklist.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
      {saved?.verifiedAt ? (
        <p className="drill-result drill-result--pass">Verified. Real work, really done.</p>
      ) : null}
      {field.verifications.map((check) => {
        const done = saved?.checklist[check.id] === true;
        const verdict = verdicts[check.id];
        return (
          <div key={check.id} className="field-check">
            <p className="play-panel__instruction">
              <span className={done ? 'checklist__done' : ''}>{done ? '✓ ' : ''}</span>
              {check.instruction}
            </p>
            <code className="field-check__command">{check.command}</code>
            <textarea
              aria-label={`Output of ${check.command}`}
              placeholder="Paste the output here"
              rows={4}
              value={pastes[check.id] ?? ''}
              onChange={(event) => {
                setPastes({ ...pastes, [check.id]: event.target.value });
              }}
            />
            <div className="play-panel__actions">
              <button
                type="button"
                className="play-button"
                onClick={() => {
                  setVerdicts({
                    ...verdicts,
                    [check.id]: submitFieldPaste(check.id, pastes[check.id] ?? ''),
                  });
                }}
              >
                Check
              </button>
              {verdict ? (
                <span
                  className={verdict.passed ? 'drill-result drill-result--pass' : 'drill-result'}
                >
                  {verdict.message}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
