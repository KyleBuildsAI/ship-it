import { describe, expect, it } from 'vitest';
import { blobId, sha1, shortId, utf8Bytes } from './hash';

describe('sha1', () => {
  it('matches the published test vectors', () => {
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    );
  });

  it('handles inputs longer than one 64-byte block', () => {
    expect(sha1('a'.repeat(1000))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
  });
});

describe('utf8Bytes', () => {
  it('encodes one- to four-byte characters', () => {
    expect(utf8Bytes('A')).toEqual([0x41]);
    expect(utf8Bytes('é')).toEqual([0xc3, 0xa9]);
    expect(utf8Bytes('€')).toEqual([0xe2, 0x82, 0xac]);
    expect(utf8Bytes('🚀')).toEqual([0xf0, 0x9f, 0x9a, 0x80]);
  });
});

describe('blobId', () => {
  it('produces the same id as `git hash-object`', () => {
    // echo hello | git hash-object --stdin
    expect(blobId('hello\n', sha1)).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    // An empty file has a well-known id in every git repository.
    expect(blobId('', sha1)).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });

  it('counts bytes, not characters, in the header', () => {
    expect(blobId('é', (data) => data)).toBe('blob 2\0é');
  });
});

describe('shortId', () => {
  it('keeps the first seven characters', () => {
    expect(shortId('ce013625030ba8dba906f756967f9e9ca394464a')).toBe('ce01362');
  });
});
