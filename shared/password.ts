const HASH_ALGORITHM = "SHA-256";
// Cloudflare Workers currently caps PBKDF2 at 100,000 iterations.
const DEFAULT_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(encoder.encode(password)).buffer as ArrayBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  // Copy into a standalone ArrayBuffer so both Node and Workers accept the
  // BufferSource regardless of the runtime's Uint8Array generic type.
  const saltBuffer = Uint8Array.from(salt).buffer as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: { name: HASH_ALGORITHM }, salt: saltBuffer, iterations },
    key,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

/** Format: pbkdf2$iterations$base64(salt)$base64(derived key). */
export async function createPasswordHash(
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<string> {
  if (password.length < 12) {
    throw new Error("Admin password must be at least 12 characters long.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePasswordKey(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(derived)}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [scheme, rawIterations, encodedSalt, encodedExpected] = encodedHash.split("$");
  const iterations = Number(rawIterations);
  if (
    scheme !== "pbkdf2" ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 100_000 ||
    !encodedSalt ||
    !encodedExpected
  ) {
    return false;
  }

  try {
    const derived = await derivePasswordKey(password, base64ToBytes(encodedSalt), iterations);
    return constantTimeEqual(derived, base64ToBytes(encodedExpected));
  } catch {
    return false;
  }
}
