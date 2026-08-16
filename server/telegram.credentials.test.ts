import { describe, expect, it } from "vitest";

describe("Telegram bot credential", () => {
  it("authenticates with Telegram's lightweight getMe endpoint", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    // Skip (not fail) when no token is configured so CI / fresh installs stay
    // green without a live bot; the check still runs fully when a token exists.
    if (!token) {
      console.warn("TELEGRAM_BOT_TOKEN not set — skipping live Telegram check");
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(12000),
    });
    const payload = await response.json() as { ok?: boolean; result?: { is_bot?: boolean } };

    expect(response.ok).toBe(true);
    expect(payload.ok).toBe(true);
    expect(payload.result?.is_bot).toBe(true);
  }, 15000);
});
