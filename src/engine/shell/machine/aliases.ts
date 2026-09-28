/**
 * PowerShell 7's built-in aliases on Windows, for the cmdlets this sandbox has, keyed in
 * lower case. They're why cd, pwd and ls work in PowerShell at all: each is another name
 * for a cmdlet with a longer one.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  cd: 'Set-Location',
  chdir: 'Set-Location',
  copy: 'Copy-Item',
  cp: 'Copy-Item',
  cpi: 'Copy-Item',
  del: 'Remove-Item',
  dir: 'Get-ChildItem',
  erase: 'Remove-Item',
  gci: 'Get-ChildItem',
  gl: 'Get-Location',
  ls: 'Get-ChildItem',
  md: 'mkdir',
  mi: 'Move-Item',
  move: 'Move-Item',
  mv: 'Move-Item',
  ni: 'New-Item',
  pwd: 'Get-Location',
  rd: 'Remove-Item',
  ren: 'Rename-Item',
  ri: 'Remove-Item',
  rm: 'Remove-Item',
  rmdir: 'Remove-Item',
  rni: 'Rename-Item',
  sl: 'Set-Location',
};
