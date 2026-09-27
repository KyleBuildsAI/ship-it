import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, parsePort } from './port';

describe('parsePort', () => {
  it.each([undefined, '', '   '])('uses the default port for the blank value %j', (raw) => {
    expect(parsePort(raw)).toBe(DEFAULT_PORT);
  });

  it.each([
    ['9000', 9000],
    [' 9000 ', 9000],
    ['1', 1],
    ['65535', 65535],
  ])('reads %j as port %i', (raw, port) => {
    expect(parsePort(raw)).toBe(port);
  });

  it.each(['0', '65536', '-1', '80.5', '1e3', 'http', '8787abc'])(
    'returns null for the unusable value %j',
    (raw) => {
      expect(parsePort(raw)).toBeNull();
    },
  );
});
