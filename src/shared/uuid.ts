/**
 * Pure-JS MD5 and Minecraft offline UUID derivation.
 *
 * Shared by the main process (persisted accounts) and the renderer (live UUID
 * preview while creating an account), so both sides always agree without
 * exposing Node crypto to the browser demo.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
]

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

function hex32(value: number): string {
  const bytes = [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** MD5 of a UTF-8 string as a lowercase hex digest. */
export function md5Hex(input: string): string {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8
  const length = (((bytes.length + 8) >>> 6) + 1) * 64
  const buffer = new Uint8Array(length)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80
  const view = new DataView(buffer.buffer)
  view.setUint32(length - 8, bitLength >>> 0, true)
  view.setUint32(length - 4, Math.floor(bitLength / 0x1_0000_0000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < length; offset += 64) {
    const words = new Uint32Array(16)
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + words[g]) >>> 0
      a = d
      d = c
      c = b
      b = (b + rotateLeft(f, S[i])) >>> 0
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return hex32(a0) + hex32(b0) + hex32(c0) + hex32(d0)
}

/** Formats 32 hex characters as a Minecraft-style UUID. */
export function formatUuid(hex: string): string {
  const value = hex.replace(/-/g, '').toLowerCase()
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

/** Vanilla-compatible UUID for an unlicensed (offline) player name. */
export function offlineUuid(name: string): string {
  const hash = md5Hex(`OfflinePlayer:${name}`)
  return formatUuid(`${hash.slice(0, 12)}3${hash.slice(13, 16)}8${hash.slice(17, 20)}${hash.slice(20, 32)}`)
}
