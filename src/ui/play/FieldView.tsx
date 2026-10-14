import { useState } from 'react';
import { requireFieldMission } from '../../game/missions/schema';
import { getAct } from '../../game/play/catalog';
import type { FieldVerdict } from '../../game/play/fieldCheck';
import { checkFieldOnGitHub, submitFieldPaste } from '../../game/play/fieldPlay';
import { leavePlay } from '../../game/play/play';
import type { FieldActivity } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { useStore } from '../useStore';

/**
 * The Field Mission (DESIGN.md section 8): a checklist of real work on one of Kyle's real
 * repos, then paste checks that verify it. Any Act can have one. Passed checks are saved,
 * so it can be done over days. Checking a paste happens here in the browser, so it needs
 * no GitHub token or API key, and the panel says so before anyone goes looking for one.
 * A mission can add an opt-in GitHub check below them, for a public repo, also tokenless.
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
                  const next = submitFieldPaste(check.id, pastes[check.id] ?? '');
                  // A secret-like paste is dropped from the page at once, not left to linger.
                  if (next.clearPaste === true) setPastes({ ...pastes, [check.id]: '' });
                  setVerdicts({ ...verdicts, [check.id]: next });
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
      {field.github ? (
        <GitHubCheck
          instruction={field.github.instruction}
          savedRepo={saved?.githubRepo ?? ''}
          verified={saved?.githubVerifiedAt !== undefined}
        />
      ) : null}
    </>
  );
}

interface GitHubCheckProps {
  readonly instruction: string;
  readonly savedRepo: string;
  readonly verified: boolean;
}

/** The opt-in check: Kyle names his public repo, and GitHub's API confirms the PR. */
function GitHubCheck({ instruction, savedRepo, verified }: GitHubCheckProps) {
  const [repo, setRepo] = useState(savedRepo);
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState<FieldVerdict | null>(null);

  async function check(): Promise<void> {
    setChecking(true);
    try {
      setVerdict(await checkFieldOnGitHub(repo));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="field-check">
      <p className="play-panel__instruction">
        <span className={verified ? 'checklist__done' : ''}>{verified ? '✓ ' : ''}</span>
        {instruction}
      </p>
      <p className="play-panel__muted">
        No sign-in or token: the game asks api.github.com about this repo name and nothing else.
      </p>
      <input
        type="text"
        className="field-check__repo"
        aria-label="Your GitHub repo, as owner/repo"
        placeholder="owner/repo"
        spellCheck={false}
        value={repo}
        onChange={(event) => {
          setRepo(event.target.value);
        }}
      />
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button"
          disabled={checking || repo.trim() === ''}
          onClick={() => {
            void check();
          }}
        >
          {checking ? 'Checking…' : 'Check on GitHub'}
        </button>
        {verdict ? (
          <span className={verdict.passed ? 'drill-result drill-result--pass' : 'drill-result'}>
            {verdict.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
