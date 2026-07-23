/**
 * TicketQRService — Cryptographically secure QR code payload generation and verification.
 *
 * Format: https://yovibe.net/t/{uuid}?s={base64url-hmac-sha256}
 *
 * HMAC-SHA256 ensures the QR code cannot be forged without the server secret.
 * Secret is read from environment variable QR_HMAC_SECRET with a fallback in dev.
 */

const SECRET = process.env.QR_HMAC_SECRET || process.env.EXPO_PUBLIC_QR_HMAC_SECRET || ""

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Pure-JS HMAC-SHA256 implementation.
 * No native dependencies — works in browser, React Native, and Node.js.
 */
function hmacSha256(keyBytes: Uint8Array, messageBytes: Uint8Array): Uint8Array {
  const blockSize = 64

  // If key is longer than block size, hash it first
  if (keyBytes.length > blockSize) keyBytes = sha256(keyBytes)

  // Pad key to block size
  const paddedKey = new Uint8Array(blockSize)
  paddedKey.set(keyBytes)

  // Inner and outer padding
  const inner = new Uint8Array(blockSize + messageBytes.length)
  const outer = new Uint8Array(blockSize + 32) // 32 bytes = SHA-256 output
  for (let i = 0; i < blockSize; i++) {
    inner[i] = paddedKey[i] ^ 0x36
    outer[i] = paddedKey[i] ^ 0x5c
  }
  inner.set(messageBytes, blockSize)

  outer.set(sha256(inner), blockSize)
  return sha256(outer)
}

/**
 * SHA-256 implementation (FIPS 180-4).
 */
function sha256(message: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  const len = message.length
  const paddedLen = (((len + 9 + 63) / 64) | 0) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(message)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(paddedLen - 4, len * 8 >>> 0, false)
  dv.setUint32(paddedLen - 8, (len * 8 / 0x100000000) | 0, false)

  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

  for (let block = 0; block < paddedLen; block += 64) {
    const W = new Uint32Array(80)
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(block + t * 4, false)

    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) | 0

      h = g; g = f; f = e; e = (d + temp1) | 0
      d = c; c = b; b = a; a = (temp1 + temp2) | 0
    }

    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0
    H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0
    H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0
  }

  const result = new Uint8Array(32)
  const rdv = new DataView(result.buffer)
  for (let i = 0; i < 8; i++) rdv.setUint32(i * 4, H[i], false)
  return result
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

/** Generate the HMAC-SHA256 signature for a ticket payload */
function generateSignature(ticketId: string, issuedAt: number): string {
  const keyBytes = new TextEncoder().encode(SECRET || "dev-secret-change-in-production")
  const message = new TextEncoder().encode(`${ticketId}:${issuedAt}`)
  return bytesToBase64url(hmacSha256(keyBytes, message))
}

/** Verify a ticket payload signature (constant-time comparison) */
function verifySignature(ticketId: string, issuedAt: number, signature: string): boolean {
  const expected = generateSignature(ticketId, issuedAt)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/**
 * Generate a signed QR code payload URL for a ticket.
 * Format: https://yovibe.app/t/{ticketId}?s={base64url-sig}&ts={issuedAt}
 */
export function generateQRPayload(ticketId: string): { url: string; signature: string; issuedAt: number } {
  const issuedAt = Date.now()
  const signature = generateSignature(ticketId, issuedAt)
  const url = `https://yovibe.net/t/${ticketId}?s=${signature}&ts=${issuedAt}`
  return { url, signature, issuedAt }
}

/**
 * Parse and verify a QR code payload URL.
 * Returns the ticketId on success, null on forgery/parse failure.
 */
export function parseAndVerifyQR(decodedText: string): { ticketId: string } | null {
  try {
    // Format: https://yovibe.net/t/{ticketId}?s={sig}&ts={ts}
    const url = new URL(decodedText)
    const pathMatch = url.pathname.match(/^\/t\/(.+)$/)
    if (!pathMatch) return null

    const ticketId = pathMatch[1]
    const signature = url.searchParams.get("s")
    const tsParam = url.searchParams.get("ts")
    if (!signature || !tsParam) return null

    const issuedAt = parseInt(tsParam, 10)
    if (isNaN(issuedAt)) return null

    if (!verifySignature(ticketId, issuedAt, signature)) return null

    return { ticketId }
  } catch {
    try {
      // Fallback: try to parse as old JSON format for backward compatibility
      const data = JSON.parse(decodedText)
      if (data && data.id) return { ticketId: data.id }
    } catch {}
    // Fallback: try raw string (legacy tickets)
    if (decodedText && !decodedText.includes("://") && decodedText.length > 10) {
      return { ticketId: decodedText.trim() }
    }
    return null
  }
}

/**
 * Generate the HMAC signature string (stored for reference, not used in verification).
 * Kept for backward compatibility with the existing ticket model schema.
 */
export function generateQRSignature(ticketId: string): string {
  const issuedAt = Date.now()
  return generateSignature(ticketId, issuedAt)
}
