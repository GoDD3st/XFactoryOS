import crypto from 'node:crypto';

/**
 * Encryption for provider API credentials at rest.
 *
 * The plaintext key exists in exactly two places: in the request body of the activation call
 * (over TLS), and in memory for the duration of a provider request. It is never written to a
 * log, an audit row, an API response, or the browser.
 *
 * AES-256-GCM is used rather than CBC so the ciphertext is authenticated - a tampered row fails
 * to decrypt instead of silently yielding garbage that would then be sent to a provider.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length.

export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialCryptoError';
  }
}

/**
 * Derives the 32-byte key from AI_CREDENTIAL_SECRET.
 *
 * Read lazily on every call rather than cached at module load: the server reads .env at startup,
 * and a module-level constant captured before dotenv ran would silently bake in `undefined`.
 */
function getKey(): Buffer {
  const secret = process.env.AI_CREDENTIAL_SECRET;

  if (!secret || secret.length < 32) {
    throw new CredentialCryptoError(
      'AI_CREDENTIAL_SECRET manquant ou trop court (32 caractères minimum). ' +
        "La configuration IA ne peut pas stocker de credential tant qu'il n'est pas défini."
    );
  }

  // scrypt with a fixed salt: the secret is already high-entropy configuration, and a rotating
  // salt would need to be stored alongside every row for no gain here. This turns an arbitrary
  // length secret into the exact 32 bytes AES-256 requires.
  return crypto.scryptSync(secret, 'xfactory-ai-credential', 32);
}

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  tag: string;
  /** Last 4 characters of the plaintext, for display only. Never enough to reconstruct the key. */
  hint: string;
}

export function encryptCredential(plaintext: string): EncryptedCredential {
  if (!plaintext) throw new CredentialCryptoError('Credential vide.');

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    hint: plaintext.slice(-4),
  };
}

export function decryptCredential(stored: {
  ciphertext: string | null;
  iv: string | null;
  tag: string | null;
}): string | null {
  if (!stored.ciphertext || !stored.iv || !stored.tag) return null;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(stored.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(stored.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    // A decryption failure means the secret was rotated or the row was tampered with. Surface it
    // as a configuration problem rather than leaking crypto internals to the caller.
    throw new CredentialCryptoError(
      "Le credential stocké n'a pas pu être déchiffré. AI_CREDENTIAL_SECRET a-t-il changé ? " +
        'Reconfigurez le provider depuis les Paramètres.'
    );
  }
}

/** True when the server is able to store credentials at all. Drives a clear UI message. */
export function isCredentialStorageAvailable(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Strips anything that looks like a provider key from arbitrary text before it reaches a log or
 * an audit row. Defence in depth: nothing should pass a key here in the first place, but provider
 * SDKs habitually echo the credential back inside error messages.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***REDACTED***')
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, 'AIza***REDACTED***')
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, 'sk-ant-***REDACTED***')
    .replace(/Bearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer ***REDACTED***');
}
