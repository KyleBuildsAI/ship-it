/**
 * PowerShell 7's built-in aliases on Windows, for the cmdlets this sandbox has, keyed in
 * lower case. They're why cd, pwd and ls work in PowerShell at all: each is another name
 * for a cmdlet with a longer one.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  cd: 'Set-Location',
  dir: 'Get-ChildItem',
  gci: 'Get-ChildItem',
  ls: 'Get-ChildItem',
  chdir: 'Set-Location',
  sl: 'Set-Location',
  gl: 'Get-Location',
  pwd: 'Get-Location',
};
