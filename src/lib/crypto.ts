import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Envelope encryption (spec SEC-5).
//   master key  --wraps-->  each person's data key  --encrypts-->  that person's stored values.
// Uses Node's built-in AES-256-GCM; no custom cryptography. Every ciphertext is bound (as "additional
// authenticated data") to the person and the field it belongs to, so a value copied to another person
// or another field fails to decrypt. Stored form: "v1.<iv>.<tag>.<ciphertext>", all base64url.

const VERSION = "v1";

export interface MasterKeys {
  current: Buffer;
  /** Only during a key change: lets old data keys still unwrap until they are re-wrapped. */
  previous?: Buffer;
}

export function parseMasterKey(base64: string): Buffer {
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length !== 32) throw new Error("A master key must be exactly 32 bytes, written in base64.");
  return key;
}

export function masterKeysFromEnv(env: Record<string, string | undefined> = process.env): MasterKeys {
  if (!env.MASTER_KEY) throw new Error("MASTER_KEY is not set");
  return {
    current: parseMasterKey(env.MASTER_KEY),
    previous: env.MASTER_KEY_PREVIOUS ? parseMasterKey(env.MASTER_KEY_PREVIOUS) : undefined,
  };
}

const b64 = (b: Buffer) => b.toString("base64url");
const fromB64 = (s: string) => Buffer.from(s, "base64url");

function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join(".");
}

function open(key: Buffer, packed: string, aad: string): Buffer {
  const [version, iv, tag, body] = packed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, fromB64(iv), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  const authTag = fromB64(tag);
  if (authTag.length !== 16) throw new Error("Unrecognised encrypted value"); // never accept a shortened tag
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(fromB64(body)), decipher.final()]);
}

export function newDataKey(): Buffer {
  return randomBytes(32);
}

const keyAad = (userId: string) => `datakey:${userId}`;

export function wrapDataKey(master: Buffer, dataKey: Buffer, userId: string): string {
  return seal(master, dataKey, keyAad(userId));
}

/** Tries the current master key, then the previous one (during a key change). */
export function unwrapDataKey(masters: MasterKeys, wrapped: string, userId: string): Buffer {
  try {
    return open(masters.current, wrapped, keyAad(userId));
  } catch (error) {
    if (!masters.previous) throw error;
    return open(masters.previous, wrapped, keyAad(userId));
  }
}

/** Key change: re-wrap a data key under a new master key. The stored values themselves do not change. */
export function rewrapDataKey(wrapped: string, userId: string, from: Buffer, to: Buffer): string {
  return wrapDataKey(to, open(from, wrapped, keyAad(userId)), userId);
}

const fieldAad = (userId: string, field: string) => `field:${userId}:${field}`;

export function encryptField(dataKey: Buffer, plaintext: string, userId: string, field: string): string {
  return seal(dataKey, Buffer.from(plaintext, "utf8"), fieldAad(userId, field));
}

export function decryptField(dataKey: Buffer, packed: string, userId: string, field: string): string {
  return open(dataKey, packed, fieldAad(userId, field)).toString("utf8");
}
