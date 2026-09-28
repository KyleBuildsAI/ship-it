import { Machine } from './machine';

/**
 * A fresh Windows 11 laptop, as Act 1's sandboxes start: the usual folders and the saved
 * variables a new install has. Programs arrive with command lookup; this is the empty
 * shell of the machine.
 */

/** The saved Machine-scope variables of a Windows 11 install with PowerShell 7 and Git. */
export const STOCK_MACHINE_ENV: Readonly<Record<string, string>> = {
  Path: [
    'C:\\Windows\\system32',
    'C:\\Windows',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\',
    'C:\\Program Files\\PowerShell\\7\\',
    'C:\\Program Files\\Git\\cmd',
  ].join(';'),
  PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.CPL',
  OS: 'Windows_NT',
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
};

/** The saved User-scope variables a new Windows 11 user starts with. */
export const STOCK_USER_ENV: Readonly<Record<string, string>> = {
  Path: '%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps',
  TEMP: '%USERPROFILE%\\AppData\\Local\\Temp',
  TMP: '%USERPROFILE%\\AppData\\Local\\Temp',
};

/** Folders every laptop has, relative to the root of C: (home folders use `~`). */
const STOCK_FOLDERS = [
  'Windows/system32',
  'Program Files/PowerShell/7',
  'Program Files/Git/cmd',
  '~/Desktop',
  '~/Documents',
  '~/Downloads',
  '~/AppData/Local/Microsoft/WindowsApps',
  '~/AppData/Local/Temp',
  '~/AppData/Roaming',
];

/** A stock laptop for one user. */
export function stockMachine(user: string, computer: string): Machine {
  const machine = new Machine({
    user,
    computer,
    saved: { machine: STOCK_MACHINE_ENV, user: STOCK_USER_ENV },
  });
  for (const folder of STOCK_FOLDERS) {
    machine.drive.makeDir(folder.replace(/^~/, machine.home));
  }
  machine.drive.hide(`${machine.home}/AppData`);
  return machine;
}
