/**
 * PowerShell 7's built-in aliases on Windows, for the cmdlets this sandbox has, keyed in
 * lower case. They're why cd, pwd and ls work in PowerShell at all: each is another name
 * for a cmdlet with a longer one.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  cd: 'Set-Location',
  chdir: 'Set-Location',
  del: 'Remove-Item',
  dir: 'Get-ChildItem',
  erase: 'Remove-Item',
  gci: 'Get-ChildItem',
  gl: 'Get-Location',
  ls: 'Get-ChildItem',
  md: 'mkdir',
  ni: 'New-Item',
  pwd: 'Get-Location',
  rd: 'Remove-Item',
  ri: 'Remove-Item',
  rm: 'Remove-Item',
  rmdir: 'Remove-Item',
  sl: 'Set-Location',
};
