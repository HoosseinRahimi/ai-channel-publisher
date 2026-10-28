import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deliverToTelegram, TelegramPartialDeliveryError } from "./publisher";

type FetchCall = { url: string; body: Record<string, unknown> };

const calls: FetchCall[] = [];

function jsonResponse(payload: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => payload } as Response;
}

function mockFetch(handler: (call: FetchCall) => Response) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const call = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> };
    calls.push(call);
    return handler(call);
  });
}

const originalEnv = { ...process.env };

beforeAll(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHANNEL_HANDLE = "@test_channel";
  delete process.env.DATABASE_URL;
});

afterAll(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("deliverToTelegram", () => {
  it("posts the image with short content as the caption", async () => {
    mockFetch(() => jsonResponse({ ok: true, result: { message_id: 42 } }));

    const messageId = await deliverToTelegram("short post", { imageUrl: "https://example.com/a.jpg" });

    expect(messageId).toBe("42");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/sendPhoto");
    expect(calls[0].body).toMatchObject({ chat_id: "@test_channel", photo: "https://example.com/a.jpg", caption: "short post" });
  });

  it("posts the image first and sends long content as a reply", async () => {
    mockFetch(() => jsonResponse({ ok: true, result: { message_id: 42 } }));
    const content = "x".repeat(1100);

    const messageId = await deliverToTelegram(content, { imageUrl: "https://example.com/a.jpg" });

    expect(messageId).toBe("42");
    expect(calls.map(call => (call.url.includes("/sendPhoto") ? "photo" : "text"))).toEqual(["photo", "text"]);
    expect(calls[0].body).not.toHaveProperty("caption");
    expect(calls[1].body).toMatchObject({ chat_id: "@test_channel", text: content, reply_to_message_id: "42" });
  });

  it("falls back to a text-only post when Telegram rejects the photo", async () => {
    mockFetch(call =>
      call.url.includes("/sendPhoto")
        ? jsonResponse({ ok: false, description: "Bad Request: wrong file identifier" }, false)
        : jsonResponse({ ok: true, result: { message_id: 43 } })
    );

    const messageId = await deliverToTelegram("short post", { imageUrl: "https://example.com/a.jpg" });

    expect(messageId).toBe("43");
    expect(calls.map(call => (call.url.includes("/sendPhoto") ? "photo" : "text"))).toEqual(["photo", "text"]);
  });

  it("uses a text-only post when no image is attached", async () => {
    mockFetch(() => jsonResponse({ ok: true, result: { message_id: 44 } }));

    await expect(deliverToTelegram("plain post", { imageUrl: "ftp://example.com/a.jpg" })).resolves.toBe("44");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/sendMessage");
  });

  it("reports partial delivery when the full-text follow-up fails", async () => {
    mockFetch(call =>
      call.url.includes("/sendPhoto")
        ? jsonResponse({ ok: true, result: { message_id: 42 } })
        : jsonResponse({ ok: false, description: "Bad Request: message is too long" }, false)
    );

    const error = await deliverToTelegram("x".repeat(1100), { imageUrl: "https://example.com/a.jpg" }).catch(caught => caught);

    expect(error).toBeInstanceOf(TelegramPartialDeliveryError);
    expect((error as TelegramPartialDeliveryError).telegramMessageId).toBe("42");
    expect((error as Error).message).toContain("message is too long");
  });
});
