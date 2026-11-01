import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// @anchor secret-crypto-key
// Klucz AES-256 dla haseł zapisywanych w bazie (skrzynki pocztowe). MAILBOX_ENCRYPTION_KEY,
// a bez niego ten sam klucz co tokeny Microsoft — żeby funkcja działała bez nowej zmiennej env.
const secretKey = (): Buffer => {
  const raw = process.env.MAILBOX_ENCRYPTION_KEY || process.env.MS_TOKEN_ENCRYPTION_KEY || '';
  return Buffer.from(raw.padEnd(32, '0').slice(0, 32));
};

// @anchor encrypt-secret
// Format jak w OneDriveService: "<iv hex>:<szyfrogram hex>".
export function encryptSecret(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// @anchor decrypt-secret
export function decryptSecret(text: string): string {
  const [ivHex, encHex] = String(text || '').split(':');
  if (!ivHex || !encHex) return '';
  const decipher = createDecipheriv('aes-256-cbc', secretKey(), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}
