import { describe, expect, it } from "vitest";
import { createPasswordHash, verifyPassword } from "./password";

describe("admin password hashing", () => {
  it("hashes and verifies a password without storing plaintext", async () => {
    const password = "correct-horse-battery-staple";
    const hash = await createPasswordHash(password, 100_000);

    expect(hash).toMatch(/^pbkdf2\$100000\$/);
    expect(hash).not.toContain(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects malformed or weak hashes", async () => {
    await expect(verifyPassword("password", "not-a-hash")).resolves.toBe(false);
    await expect(verifyPassword("password", "pbkdf2$1$c2FsdA==$aGFzaA==")).resolves.toBe(false);
  });
});
