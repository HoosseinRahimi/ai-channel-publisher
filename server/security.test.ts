import { describe, expect, it } from "vitest";
import { assertSafeRemoteUrl } from "./_core/urlPolicy";
import {
  clearLoginFailures,
  isLoginAllowed,
  loginRateLimitKey,
  recordLoginFailure,
} from "./_core/loginRateLimit";

describe("security hardening", () => {
  it("blocks private source and provider URLs unless explicitly opted in", async () => {
    const previous = process.env.ALLOW_PRIVATE_NETWORK_URLS;
    delete process.env.ALLOW_PRIVATE_NETWORK_URLS;
    await expect(
      assertSafeRemoteUrl("http://127.0.0.1:11434", "provider")
    ).rejects.toThrow("private");
    await expect(
      assertSafeRemoteUrl("http://[::ffff:127.0.0.1]:11434", "provider")
    ).rejects.toThrow("private");
    if (previous === undefined) delete process.env.ALLOW_PRIVATE_NETWORK_URLS;
    else process.env.ALLOW_PRIVATE_NETWORK_URLS = previous;
  });

  it("blocks a username/IP pair after five failed login attempts", () => {
    const key = loginRateLimitKey("198.51.100.7", "admin");
    clearLoginFailures(key);
    const start = 1_000;
    for (let i = 0; i < 5; i += 1) recordLoginFailure(key, start + i);
    expect(isLoginAllowed(key, start + 5)).toBe(false);
    expect(isLoginAllowed(key, start + 15 * 60 * 1000 + 10)).toBe(true);
    clearLoginFailures(key);
  });
});
