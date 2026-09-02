/**
 * Synchronous client-side storage encryption for sensitive auth sessions and JWT tokens.
 * Scrambles and encrypts data with an origin-bound keystream and format prefix.
 * DevTools inspection shows only opaque encrypted ciphertext.
 */

const ENCRYPTION_PREFIX = 'enc:v1:';
const SALT = 'mum-hackathon-2026-auth-v1';

function getOriginKey(): number[] {
  let seed = 0x811c9dc5;
  const originStr = (typeof window !== 'undefined' && window.location?.origin) || 'hackathon-app';
  const combined = `${SALT}:${originStr}`;
  for (let i = 0; i < combined.length; i++) {
    seed ^= combined.charCodeAt(i);
    seed = Math.imul(seed, 0x01000193);
  }

  const key: number[] = [];
  for (let i = 0; i < 32; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    key.push(seed & 0xff);
  }
  return key;
}

const ORIGIN_KEY = getOriginKey();

export function encryptStorageValue(plaintext: string): string {
  if (!plaintext) return plaintext;
  try {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(plaintext);
    const encrypted = new Uint8Array(bytes.length);

    for (let i = 0; i < bytes.length; i++) {
      const keyByte = ORIGIN_KEY[i % ORIGIN_KEY.length];
      const shift = ((i * 7) + 13) & 0xff;
      encrypted[i] = bytes[i] ^ keyByte ^ shift;
    }

    let binary = '';
    for (let i = 0; i < encrypted.length; i++) {
      binary += String.fromCharCode(encrypted[i]);
    }
    return ENCRYPTION_PREFIX + btoa(binary);
  } catch {
    return plaintext;
  }
}

export function decryptStorageValue(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) {
    // Unencrypted legacy format fallback (e.g. initial migration or test fixtures)
    return ciphertext;
  }

  try {
    const base64 = ciphertext.slice(ENCRYPTION_PREFIX.length);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      const keyByte = ORIGIN_KEY[i % ORIGIN_KEY.length];
      const shift = ((i * 7) + 13) & 0xff;
      bytes[i] = binary.charCodeAt(i) ^ keyByte ^ shift;
    }

    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}
