import { line } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Cmdlet } from '../registry';

const ok = (): ShellResult => ({ lines: [], exitCode: 0 });

const fail = (message: string, ...hints: string[]): ShellResult => ({
  lines: [line(`Set-Location: ${message}`, 'error'), ...hints.map((hint) => line(hint, 'hint'))],
  exitCode: 1,
});

/**
 * PowerShell drives that aren't folders. Real PowerShell can cd into them; this sandbox
 * keeps the player on C: and points at the tool that shows the same thing.
 */
const OTHER_DRIVES: Readonly<Record<string, string>> = {
  env: 'Env: holds your environment variables, not files. List them with: Get-ChildItem Env:',
  hkcu: 'Change saved variables in the Environment Variables editor: rundll32 sysdm.cpl,EditEnvironmentVariables',
  hklm: 'Change saved variables in the Environment Variables editor: rundll32 sysdm.cpl,EditEnvironmentVariables',
};

/** Get-Location (pwd): the folder this tab stands in, as PowerShell's one-column table. */
export const GET_LOCATION: Cmdlet = {
  spec: { name: 'Get-Location', parameters: [] },
  run: ({ session }) => ({
    lines: [
      line(''),
      line('Path', 'meta'),
      line('----', 'meta'),
      line(display(session.cwd)),
      line(''),
    ],
    exitCode: 0,
  }),
};

/**
 * Set-Location (cd): moves this tab. With no path (or an empty one) it goes home; `-` and `+` step back and
 * forward through the tab's history, and print nothing when there's none (as PowerShell
 * 7.6 does). Folder names match in any case and keep the casing they were made with.
 */
export const SET_LOCATION: Cmdlet = {
  spec: { name: 'Set-Location', parameters: [{ name: 'Path', type: 'string', position: 0 }] },
  run: ({ machine, session }, bound) => {
    const typed = bound.text('Path');
    // No path, or an empty one (cd $nothing), goes home, as in PowerShell 7.6.
    if (typed === null || typed === '') {
      machine.setLocation(session.id, machine.home, 'home');
      return ok();
    }
    if (typed === '-') {
      machine.goBack(session.id);
      return ok();
    }
    if (typed === '+') {
      machine.goForward(session.id);
      return ok();
    }
    const target = toCanonical(typed, { cwd: session.cwd, home: machine.home });
    if (!target.ok) {
      if (!('drive' in target))
        return fail(
          `Cannot find path '${target.network}' because it does not exist.`,
          'This laptop has no network drives.',
        );
      const pointer = OTHER_DRIVES[target.drive.toLowerCase()];
      return pointer === undefined
        ? fail(`Cannot find drive. A drive with the name '${target.drive}' does not exist.`)
        : fail(`This sandbox keeps you on the C: drive.`, pointer);
    }
    const found = resolveExisting(machine.drive, target.path);
    if (found === null)
      return fail(`Cannot find path '${display(target.path)}' because it does not exist.`);
    // A file isn't a place to stand. PowerShell 7.6 names it as typed here (verified).
    if (!machine.drive.isDir(found))
      return fail(`Cannot find path '${typed}' because it does not exist.`);
    machine.setLocation(session.id, found, route(typed));
    return ok();
  },
};

/** How the player named the folder, so the world can light the route they took. */
function route(typed: string): 'home' | 'absolute' | 'relative' {
  if (typed.startsWith('~')) return 'home';
  return /^([A-Za-z]:|[\\/])/.test(typed) ? 'absolute' : 'relative';
}
