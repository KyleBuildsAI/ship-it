# Next ideas

Everything planned next, most important first. One line each. None of it is built yet.

1. Open and merge the 10 reviewed, pushed branches in order: `feat/powershell-lexer`, `feat/powershell-variables`, `feat/powershell-binder`, `feat/binder-hints`, `feat/number-parameters`, `feat/location-cmdlets`, `feat/get-childitem`, `feat/get-childitem-cmdlet`, `feat/new-item`, `feat/remove-item` (PR bodies drafted).
2. Rebase the second chain (`feat/drive-move`, `feat/copy-move-rename`, `feat/content-cmdlets`, `feat/redirects`, `feat/machine-queries`) onto the fixed `feat/remove-item`, then merge it.
3. Run the same real-PowerShell review on that second chain that found 17 fidelity bugs in the first.
4. Make Move-Item's "in use" rule match Remove-Item's fix: only this tab's folder and home lock a folder, not other tabs.
5. Finish the machine grading predicates (`currentDirectory`, `driveFolder`, `driveFile`, `envVar`), saved in `git stash` on `feat/machine-queries`: add tests and the validateAct windows() rule.
6. Play runs machine sandboxes: `sandboxControl` passes machine queries, the sandbox store keeps tabs, free play on the laptop.
7. The machine island behind a `?preview=act1` flag, with its own portal and camera.
8. Folder Terraces that follow `cd` and the file cmdlets in the 3D world.
9. Act 1 content: the shared laptop, then missions 1.1 "Where Am I?" and 1.2 "Files by Hand" (first playable preview).
10. Environment variables in the shell: `$env:X = ...`, `+=`, `[Environment]::`, `setx`, admin denial, and redacting values sent to Sage.
11. Terminal sessions in the shell: Ctrl+C, `exit`, and the "last tab" rule.
12. Terminal tabs and PowerShell tab completion in the UI (`PS 1 · PS 2 · +`).
13. PATH lookup: `Get-Command`, `where.exe`, program marker files, `.ps1` scripts, and the Store python stub.
14. The Windows Environment Variables editor, driven through real commands.
15. Processes, pipes and member access: `Get-Process`, `Stop-Process`, `| Stop-Process`, `(...).Id`, tasklist and taskkill.
16. Ports: `Get-NetTCPConnection`, `netstat`, and bind conflicts.
17. Simulated apps that start, fail (missing module, missing env, port in use) and answer `curl`.
18. `npm install`, npm scripts and Vite; then winget, pip and Python venvs.
19. World districts: Session Pods and Corkboard, PATH Lamp Line, Engine Room, Supply Depot, and `help` by district.
20. Act 1 missions 1.3 to 1.6, then the boss "Works on My Machine".
21. Field parsers (runtimes, ports, env names, README) with the secret guard, then the Act 1 Field Mission.
22. Sage hints that know the machine (names only, never values).
23. Make Act 1 the starting Act: portal, title card, tutorial text, README "How to play".
24. Pass the real terminal width to the shell, so long `Env:` values are cut where Kyle's terminal cuts them (fixed at 120 columns now).
25. Common parameters (`-ErrorAction`, `-WhatIf`, `-Confirm`) on every cmdlet.
26. Protect `C:\Windows` and `C:\Program Files` from a non-admin user with PowerShell's access-denied errors.
27. Match PowerShell's table order when a wildcard with `-Recurse` matches at several depths, and support wildcards mid-path.
28. Investigate issue #104: two tabs opened at once can leave one stuck loading.
29. Pin `%SystemRoot%\System32\timeout.exe` in `start-ship-it.bat` too, in case another `timeout` comes first on PATH.
30. Give `LAUNCH.bat` a `--no-browser` option for automated checks.
