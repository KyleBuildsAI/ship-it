# Next ideas

Everything planned next, most important first. One line each. The full plan, with every PR, is in `docs/act1-directed.md` section 8. Every branch named below is pushed to GitHub, with no PR yet.

1. Merge the rest of Milestone A's first batch, one PR at a time in this order (each is built, reviewed, fixed and green): `feat/early-access-menu`, `refactor/schema-parts`, `feat/agent-actions-schema`, `feat/directed-steps-schema`, `feat/directed-steps-schema-2`, `feat/directed-steps-budgets`, `feat/judgment-drills-schema`, `feat/judgment-drills-schema-2`, `feat/folder-events`, `feat/agent-driver`, `feat/agent-driver-2`, `feat/machine-snapshots`, `feat/machine-snapshots-2`.
2. Then merge the finished part of the second batch (built, reviewed from three angles, fixed and green), after moving it onto the first batch with `git rebase --update-refs --onto <first batch's last branch> 9c84398 <track's last branch>`: A11 `feat/sandbox-log`, `-2`, `-3`; A15 `feat/agent-feed-pace`, `-2`; A24 `feat/queries-hidden-home`, `feat/terrace-layout`, `-2`.
3. Review A19 `feat/terminal-otto-feed` and `-2` (built and green, not yet reviewed), and finish A17a `wip/agent-effects` (stopped before its checks ran).
4. Build the rest of Milestone A so a new save starts in Act 1: A12 the agent step runner, A13 judgment drill grading, A14 Mission 1.1 behind `?preview=act1`, A16-A18 play, A20-A22 panels, A23 the machine island, A25-A26 terraces and ghosts, A27 Act 1 first.
5. Milestone B: say it your own way (free text, with Sage when a key exists), the first Field Mission checks, the second engine chain (Copy/Move/Rename, content cmdlets, redirects; reviewed and fixed, on `feat/drive-move` to `feat/machine-queries`), and Mission 1.2 "Deletes Are Forever".
6. Milestone C: Mission 1.3 "Secrets Stay Home" (the fence, Otto's memory cloud, you paste the key yourself).
7. Milestone D: Mission 1.4 "Every Terminal Is Its Own World" (`$env:`, setx, PATH lookup, lanterns and the corkboard).
8. Milestone E: Mission 1.5 "Dependencies Are Declared" (npm against an offline registry, the supply depot, the lookalike package).
9. Milestone F: Mission 1.6 "Running Isn't Working" (processes, ports, curl, the engine room).
10. Milestone G: the boss "Works on My Machine", the full Field Mission, the placement test, and Act 1 leaves early access.
11. Convert Act 2 (git) to the directed style: Otto commits, Kyle reviews and checks.
12. Resume a mission partway through (store the chosen plans and the sandbox log per step).
13. Issue #131: sort the in-game `dir` in PowerShell's English name order, as the grading queries now do.
14. Pass the real terminal width to the shell, so long `Env:` values are cut where Kyle's terminal cuts them (fixed at 120 columns now).
15. Common parameters (`-ErrorAction`, `-WhatIf`, `-Confirm`) on every cmdlet, if an authored line ever needs them.
16. Protect `C:\Windows` and `C:\Program Files` from a non-admin user with PowerShell's access-denied errors.
17. Match PowerShell's table order when a wildcard with `-Recurse` matches at several depths, and support wildcards mid-path.
18. Investigate issue #104: two tabs opened at once can leave one stuck loading.
19. Pin `%SystemRoot%\System32\timeout.exe` in `start-ship-it.bat` too, in case another `timeout` comes first on PATH.
20. Give `LAUNCH.bat` a `--no-browser` option for automated checks.
