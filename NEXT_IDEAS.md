# Next ideas

Everything planned next, most important first. One line each. The full plan, with every PR, is in `docs/act1-directed.md` section 8.

1. Land the rest of the reviewed laptop engine (location through Remove-Item), split into PRs of about 400 lines or less.
2. Milestone A: Mission 1.1 "Where Things Live" playable as the starting Act from a new save, with Otto, judgment drills, the machine island and its Question Round, offline.
3. Milestone B: say it your own way (free text, with Sage when a key exists), the first Field Mission checks, the second engine chain (Copy/Move/Rename, content cmdlets, redirects; review fixes in progress), and Mission 1.2 "Deletes Are Forever".
4. Milestone C: Mission 1.3 "Secrets Stay Home" (the fence, Otto's memory cloud, you paste the key yourself).
5. Milestone D: Mission 1.4 "Every Terminal Is Its Own World" (`$env:`, setx, PATH lookup, lanterns and the corkboard).
6. Milestone E: Mission 1.5 "Dependencies Are Declared" (npm against an offline registry, the supply depot, the lookalike package).
7. Milestone F: Mission 1.6 "Running Isn't Working" (processes, ports, curl, the engine room).
8. Milestone G: the boss "Works on My Machine", the full Field Mission, the placement test, and Act 1 leaves early access.
9. Convert Act 2 (git) to the directed style: Otto commits, Kyle reviews and checks.
10. Resume a mission partway through (store the chosen plans and the sandbox log per step).
11. Pass the real terminal width to the shell, so long `Env:` values are cut where Kyle's terminal cuts them (fixed at 120 columns now).
12. Common parameters (`-ErrorAction`, `-WhatIf`, `-Confirm`) on every cmdlet, if an authored line ever needs them.
13. Protect `C:\Windows` and `C:\Program Files` from a non-admin user with PowerShell's access-denied errors.
14. Match PowerShell's table order when a wildcard with `-Recurse` matches at several depths, and support wildcards mid-path.
15. Investigate issue #104: two tabs opened at once can leave one stuck loading.
16. Pin `%SystemRoot%\System32\timeout.exe` in `start-ship-it.bat` too, in case another `timeout` comes first on PATH.
17. Give `LAUNCH.bat` a `--no-browser` option for automated checks.
