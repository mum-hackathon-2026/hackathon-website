import { encryptStorageValue, decryptStorageValue } from './storage-crypto';

describe('storage-crypto', () => {
  it('encrypts plaintext into prefixed ciphertext', () => {
    const secret = 'super-secret-token-12345';
    const encrypted = encryptStorageValue(secret);

    expect(encrypted).not.toBe(secret);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toContain('secret');
  });

  it('decrypts encrypted ciphertext back into original plaintext', () => {
    const payload = JSON.stringify({ id: 8, email: 'mingdong9188@gmail.com', role: 'admin' });
    const encrypted = encryptStorageValue(payload);
    const decrypted = decryptStorageValue(encrypted);

    expect(decrypted).toBe(payload);
  });

  it('falls back to raw plaintext when legacy unencrypted value is provided', () => {
    const legacy = JSON.stringify({ user: { id: 1, name: 'Test' } });
    expect(decryptStorageValue(legacy)).toBe(legacy);
  });

  it('gracefully returns null on invalid ciphertext or null input', () => {
    expect(decryptStorageValue(null)).toBeNull();
    expect(decryptStorageValue('')).toBeNull();
    expect(decryptStorageValue('enc:v1:!!!invalid_base64!!!')).toBeNull();
  });
});
