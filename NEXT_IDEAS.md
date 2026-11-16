# Next ideas

Everything planned next, most important first. One line each. Bugs and work in progress live in GitHub issues; this list is the plan around them.

1. #190: give each Act its own download, the last step of splitting the game's first download by Act.
2. #198: a tab that loses the save lock can still write the save.
3. #199: check the editor dock against the HUD row at Extra large text in narrow windows.
4. Skill tree (`DESIGN.md` section 6): one node per concept, lit when mastered. `masteredConcept` in `src/game/progression/stats.ts` already decides mastery; nothing shows it yet.
5. Code Review mini-game (`DESIGN.md` section 11, cross-Act features): read a diff, click the lines with bugs, name the kind of issue and write the comment, including AI-written diffs with plausible mistakes.
6. Private repos for the GitHub check (`DESIGN.md` section 8): a read-only fine-grained token kept in IndexedDB on Kyle's machine and sent only to `api.github.com`.
7. Experience Vault and Sage's interview mode (M5): write STAR stories, let Sage push on them, and keep the scores over time.
8. Python Arena (M5): practical Python problems in Pyodide with hidden tests. Last, because the game now leans toward directing AI over typing code.
9. Pass the real terminal width to the shell, so long `Env:` values are cut where Kyle's terminal cuts them (fixed at 120 columns now).
10. Common parameters (`-ErrorAction`, `-WhatIf`, `-Confirm`) on every cmdlet, if an authored line ever needs them.
11. Protect `C:\Windows` and `C:\Program Files` from a non-admin user with PowerShell's access-denied errors.
12. Match PowerShell's table order when a wildcard with `-Recurse` matches at several depths, and support wildcards mid-path.
13. Pin `%SystemRoot%\System32\timeout.exe` in `start-ship-it.bat` too, as `STOP.bat` does, in case another `timeout` comes first on PATH.
14. Give `LAUNCH.bat` a `--no-browser` option for automated checks.
