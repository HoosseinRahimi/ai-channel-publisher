/**
 * AES-256-GCM encryption for secrets stored in the database (currently the
 * LLM API key saved from the settings UI). The key is derived from
 * SETTINGS_SECRET, falling back to JWT_SECRET so existing deployments work
 * without new configuration. Ciphertext format:
 *   v1:<iv base64>:<auth tag base64>:<payload base64>
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { ENV } from "./env";

let derivedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!derivedKey) {
    const secret = ENV.settingsSecret || ENV.cookieSecret;
    if (!secret) {
      throw new Error(
        "SETTINGS_SECRET (or JWT_SECRET) must be configured to store secrets in the settings UI."
      );
    }
    derivedKey = scryptSync(secret, "ai-channel-publisher-settings-v1", 32);
  }
  return derivedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Returns the decrypted secret, or an empty string when the payload cannot be
 * decrypted (wrong secret, corrupted data, unknown version). Callers fall
 * back to environment configuration in that case instead of crashing.
 */
export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
