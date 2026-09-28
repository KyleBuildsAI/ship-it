import type { MachineEvent } from './events';
import { Machine, type MachineOptions } from './machine';

/**
 * A small laptop for tests: user kyle, with a saved Machine Path and User Path shaped like
 * a fresh Windows 11 install (the User Path holds the WindowsApps folder).
 */
export function testMachine(saved: MachineOptions['saved'] = STOCK_SAVED): Machine {
  return new Machine({ user: 'kyle', computer: 'QUILL-LT-7', saved });
}

export const STOCK_SAVED: MachineOptions['saved'] = {
  machine: {
    Path: 'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\PowerShell\\7\\',
    OS: 'Windows_NT',
  },
  user: {
    Path: '%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps',
    TEMP: '%USERPROFILE%\\AppData\\Local\\Temp',
  },
};

/** Every event the machine announces from now on. */
export function recordMachineEvents(machine: Machine): MachineEvent[] {
  const events: MachineEvent[] = [];
  machine.events.on((event) => events.push(event));
  return events;
}
