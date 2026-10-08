import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const ALGO = "aes-256-gcm";

/** Encrypt a secret (mail passwords) for storage: base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const key = Buffer.from(env().ENCRYPTION_KEY, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  const key = Buffer.from(env().ENCRYPTION_KEY, "hex");
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** A new extension API token; only its hash is stored. */
export function newApiToken(): string {
  return "tjob_" + randomBytes(24).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
