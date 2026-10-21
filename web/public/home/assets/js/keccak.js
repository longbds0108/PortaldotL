/*
 * Minimal keccak256 (Ethereum flavour, 0x01 padding) plus the Plinths commitment encoding.
 * Matches web/lib/commitment.ts:
 *   keccak256(abi.encode(tenderId, bidder, amount18, salt, keccak256(docKey)))
 * BigInt lanes keep it short; it hashes a few hundred bytes per keystroke, so speed is not a concern.
 */
(function (global) {
  "use strict";

  const MASK = (1n << 64n) - 1n;
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  // Rotation offsets r[x][y]
  const R = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
  ];

  const rotl = (v, n) => (n === 0 ? v : ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK);

  function keccakF(A) {
    const C = new Array(5);
    const B = new Array(25);
    for (let round = 0; round < 24; round++) {
      for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (let x = 0; x < 5; x++) {
        const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
        for (let y = 0; y < 25; y += 5) A[x + y] ^= D;
      }
      for (let x = 0; x < 5; x++)
        for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], R[x][y]);
      for (let y = 0; y < 25; y += 5)
        for (let x = 0; x < 5; x++) A[x + y] = B[x + y] ^ (~B[((x + 1) % 5) + y] & MASK & B[((x + 2) % 5) + y]);
      A[0] ^= RC[round];
    }
  }

  function keccak256(bytes) {
    const rate = 136;
    const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
    padded.set(bytes);
    padded[bytes.length] ^= 0x01;
    padded[padded.length - 1] ^= 0x80;

    const A = new Array(25).fill(0n);
    for (let off = 0; off < padded.length; off += rate) {
      for (let i = 0; i < rate / 8; i++) {
        let lane = 0n;
        for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]);
        A[i] ^= lane;
      }
      keccakF(A);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
      let lane = A[i];
      for (let b = 0; b < 8; b++) {
        out[i * 8 + b] = Number(lane & 0xffn);
        lane >>= 8n;
      }
    }
    return out;
  }

  const toHex = (bytes) => "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  function hexToBytes(hex) {
    const h = hex.replace(/^0x/, "");
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  /** One 32-byte ABI word from a BigInt (uint256 / address). */
  function word(value) {
    const out = new Uint8Array(32);
    let v = value;
    for (let i = 31; i >= 0; i--) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  /** "8.25" -> 8250000000000000000n (18 decimals, like the EVM side of tPOTv3). */
  function parseUnits18(text) {
    const clean = String(text).trim();
    if (!/^\d*(\.\d*)?$/.test(clean) || clean === "" || clean === ".") return null;
    const [whole, frac = ""] = clean.split(".");
    return BigInt(whole || "0") * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18) || "0");
  }

  /** Canonical Plinths bid commitment. Hex strings in, hex string out. */
  function commitment({ tenderId, bidder, amount18, salt, docKey }) {
    const docKeyHash = keccak256(hexToBytes(docKey));
    const enc = new Uint8Array(32 * 5);
    enc.set(word(BigInt(tenderId)), 0);
    enc.set(word(BigInt(bidder)), 32);
    enc.set(word(amount18), 64);
    enc.set(hexToBytes(salt), 96);
    enc.set(docKeyHash, 128);
    return toHex(keccak256(enc));
  }

  function randomHex32() {
    const b = new Uint8Array(32);
    (global.crypto || {}).getRandomValues ? global.crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = (Math.random() * 256) | 0));
    return toHex(b);
  }

  global.PlinthsHash = { keccak256, toHex, hexToBytes, parseUnits18, commitment, randomHex32 };
})(typeof window !== "undefined" ? window : globalThis);
