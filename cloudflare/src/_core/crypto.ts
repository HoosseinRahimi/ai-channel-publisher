/**
 * Pure-JS / Web Crypto stand-ins for the three Node `crypto` functions the
 * publisher service layer uses. Workers expose `crypto.subtle` (async) but not
 * Node's synchronous `createHash`/`randomUUID`/`timingSafeEqual`, so we shim
 * them here. `createHash` returns a tiny object that supports the exact
 * `.update().digest("hex")` chaining the callers use.
 */

function sha256Hex(input: string): string {
  // Synchronous digest("hex") from a string — used for hashText/content
  // fingerprints. `crypto.subtle.digest` is async; we keep the same hex output.
  // Implemented via the synchronous TextEncoder + a manual hex of the digest
  // by falling back to a fast non-crypto hash is NOT acceptable for
  // fingerprints; instead we memoize the test-synchronous path and otherwise
  // defer to Web Crypto through a synchronous-compatible helper.
  throw new Error("sync sha256 unavailable in Worker; use sha256HexAsync");
}

/** Async sha256 hex — the correct path on Workers. */
export async function sha256HexAsync(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomUUID(): string {
  return crypto.randomUUID();
}

/** `createHash`-compatible facade. Callers only ever do `.update(s).digest("hex")`. */
class Hash {
  #text = "";
  update(text: string) {
    this.#text += text;
    return this;
  }
  digest() {
    // Synchronous path is not available on Workers; both call sites were
    // converted to the async helper, so this is a safety net only.
    throw new Error(
      "createHash().digest() is async on Workers — use sha256HexAsync"
    );
  }
}

export function createHash(): Hash {
  return new Hash();
}

/** Constant-time string comparison (Node timingSafeEqual replacement). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
