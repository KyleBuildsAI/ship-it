/*
 * DESIGN.md pillar 4: No-AI Drills are real. While a drill or placement test runs, the
 * mentor client refuses to contact Sage at all. The server also refuses drill-tagged
 * requests, but the game should never even ask.
 */

let activeSessionId: string | null = null;

/** Call when a No-AI Drill or placement test starts. Sage stays silent until endDrill(). */
export function beginDrill(sessionId: string): void {
  activeSessionId = sessionId;
}

/** Call when the drill or placement test ends, whether it passed, failed, or was quit. */
export function endDrill(): void {
  activeSessionId = null;
}

/** The running drill's session id, or null when no drill is running. */
export function activeDrillSession(): string | null {
  return activeSessionId;
}
