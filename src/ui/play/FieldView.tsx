import { useState } from 'react';
import { requireFieldMission } from '../../game/missions/schema';
import { getAct } from '../../game/play/catalog';
import type { FieldVerdict } from '../../game/play/fieldCheck';
import { setFieldTaskDone, submitFieldPaste } from '../../game/play/fieldPlay';
import { leavePlay } from '../../game/play/play';
import type { FieldActivity } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { useStore } from '../useStore';
import { CopyButton } from './CopyButton';

/**
 * The Field Mission (DESIGN.md section 8): a checklist of real work on one of Kyle's real
 * repos, then paste checks that verify it. Any Act can have one. Passed checks are saved,
 * so it can be done over days. Checking a paste happens here in the browser, so it needs
 * no GitHub token or API key, and the panel says so before anyone goes looking for one.
 * DESIGN.md section 8's planned GitHub API checks (M3+) would be opt-in, beside these.
 *
 * It's made for vibe coders: a brief for Kyle's AI agent and every command have a Copy
 * button, so nothing long is selected by hand, and the tasks are checkboxes he can tick
 * as he goes, saved with the rest of the mission.
 */
export function FieldView({ activity }: { activity: FieldActivity }) {
  const field = requireFieldMission(getAct(activity.act).act);
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
      <p className="play-panel__muted">
        No GitHub token or API key needed: run each command in your own PowerShell and paste what it
        prints. The game checks it on this computer.
      </p>
      {field.briefing.map((line) => (
        <p key={line} className="play-panel__instruction">
          {line}
        </p>
      ))}
      <ul className="field-tasks">
        {field.checklist.map((item, index) => {
          const ticked = saved?.checklist[item.id] === true;
          return (
            <li key={item.id} className={ticked ? 'field-task field-task--done' : 'field-task'}>
              <label className="field-task__label">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={(event) => {
                    setFieldTaskDone(item.id, event.target.checked);
                  }}
                />
                <span>{item.text}</span>
              </label>
              {item.prompt === undefined ? null : (
                <div className="field-task__prompt">
                  <p>{item.prompt}</p>
                  <CopyButton
                    text={item.prompt}
                    label={`Copy the agent brief for step ${String(index + 1)}`}
                  />
                </div>
              )}
            </li>
          );
        })}
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
            <div className="field-check__run">
              <code className="field-check__command">{check.command}</code>
              <CopyButton text={check.command} label={`Copy the command ${check.command}`} />
            </div>
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
