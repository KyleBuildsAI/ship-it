/** Turns text into a hex object id. Injected so tests can use short, predictable ids. */
export type HashFunction = (data: string) => string;

/** UTF-8 bytes of a string, written out by hand because the engine can't rely on browser APIs. */
export function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

const rotateLeft = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));

/**
 * SHA-1, the hash real git uses for object ids. Implemented here (instead of the async
 * browser crypto API) so hashing stays synchronous and works identically in tests.
 */
export function sha1(text: string): string {
  const message = utf8Bytes(text);
  // Pad to a multiple of 64 bytes: a 1 bit, zeros, then the length in bits (big-endian).
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const input = new DataView(padded.buffer);
  // Strings here are far below 2^32 bits, so the high half of the 64-bit length stays 0.
  input.setUint32(paddedLength - 4, message.length * 8);

  const schedule = new DataView(new ArrayBuffer(80 * 4));
  const word = (index: number) => schedule.getUint32(index * 4);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let chunk = 0; chunk < paddedLength; chunk += 64) {
    for (let i = 0; i < 16; i++) schedule.setUint32(i * 4, input.getUint32(chunk + i * 4));
    for (let i = 16; i < 80; i++) {
      schedule.setUint32(
        i * 4,
        rotateLeft(word(i - 3) ^ word(i - 8) ^ word(i - 14) ^ word(i - 16), 1),
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let mix: number;
      let constant: number;
      if (i < 20) {
        mix = (b & c) | (~b & d);
        constant = 0x5a827999;
      } else if (i < 40) {
        mix = b ^ c ^ d;
        constant = 0x6ed9eba1;
      } else if (i < 60) {
        mix = (b & c) | (b & d) | (c & d);
        constant = 0x8f1bbcdc;
      } else {
        mix = b ^ c ^ d;
        constant = 0xca62c1d6;
      }
      const next = (rotateLeft(a, 5) + mix + e + constant + word(i)) | 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return [h0, h1, h2, h3, h4].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

/**
 * A blob id computed exactly like `git hash-object`: the hash of a "blob <size>\0"
 * header plus the content. The same file gets the same id here as in real git.
 */
export function blobId(content: string, hash: HashFunction): string {
  return hash(`blob ${String(utf8Bytes(content).length)}\0${content}`);
}

/** Git shows the first 7 characters of an id wherever a human reads it. */
export function shortId(id: string): string {
  return id.slice(0, 7);
}
