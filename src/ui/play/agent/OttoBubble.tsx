/**
 * How Otto's screen face looks (docs/act1-directed.md section 1.2): typing, waiting for
 * Kyle with an amber pulse, or a red flash when a line failed.
 */
export type OttoMood = 'typing' | 'waiting' | 'failed';

const FACE: Readonly<Record<OttoMood, string>> = { typing: '›_', waiting: '•', failed: '!' };

/**
 * Otto's speech bubble. It is a polite live region, so a screen reader reads each new line
 * once Kyle is between actions, without cutting off what it is reading now. `flash` changes
 * when a new line fails, which restarts the red flash.
 */
export function OttoBubble({ line, mood, flash }: { line: string; mood: OttoMood; flash: number }) {
  return (
    <div className="otto">
      <span key={flash} className={`otto__face otto__face--${mood}`} aria-hidden="true">
        {FACE[mood]}
      </span>
      <p className="otto__bubble" aria-live="polite">
        <span className="visually-hidden">Otto: </span>
        {line}
      </p>
    </div>
  );
}
