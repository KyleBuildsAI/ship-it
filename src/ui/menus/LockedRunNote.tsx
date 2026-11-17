/**
 * What a menu shows instead of its stats while a locked placement test runs
 * (`lockedRunActive`): XP, drill accuracy and the review queue would each say whether a
 * locked answer was right.
 */
export function LockedRunNote() {
  return (
    <p className="play-panel__instruction">
      A placement test is running. This shows again when it ends.
    </p>
  );
}
