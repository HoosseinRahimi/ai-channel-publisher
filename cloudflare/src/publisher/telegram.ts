import { safeEqual } from "../_core/crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { publisherSettings } from "../schema";
import { CHANNEL_HANDLE, telegramChannelSetupError } from "./editorial";

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("توکن ربات تلگرام پیکربندی نشده است.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(`ارسال پیام خصوصی تلگرام ناموفق بود: ${payload?.description ?? response.status}`);
}

export async function fetchTelegramChannelAudienceSize() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("توکن ربات تلگرام پیکربندی نشده است.");
  const response = await fetch(`https://api.telegram.org/bot${token}/getChatMemberCount`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHANNEL_HANDLE }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: number; description?: string } | null;
  if (!response.ok || !payload?.ok || typeof payload.result !== "number") throw new Error(`خواندن تعداد اعضای کانال ناموفق بود: ${payload?.description ?? response.status}`);
  return payload.result;
}

export async function deliverToTelegram(content: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram bot token is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHANNEL_HANDLE, text: content, disable_web_page_preview: false }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
  if (!response.ok || !result?.ok) {
    const detail = result?.description || `Telegram request failed (${response.status}).`;
    if (/not a member|chat not found|not enough rights|not allowed|forbidden/i.test(detail)) {
      throw new Error(telegramChannelSetupError(detail));
    }
    throw new Error(`ارسال به تلگرام انجام نشد: ${detail}`);
  }
  return String(result.result?.message_id ?? "");
}

export async function verifyTelegramChannelAccess() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("توکن ربات تلگرام پیکربندی نشده است.");

  const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(15000) });
  const mePayload = await meResponse.json().catch(() => null) as { ok?: boolean; result?: { id?: number }; description?: string } | null;
  const botId = mePayload?.result?.id;
  if (!meResponse.ok || !mePayload?.ok || !botId) throw new Error("توکن ربات تلگرام معتبر نیست یا قابل تأیید نیست.");

  const memberResponse = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHANNEL_HANDLE, user_id: botId }),
    signal: AbortSignal.timeout(15000),
  });
  const memberPayload = await memberResponse.json().catch(() => null) as {
    ok?: boolean;
    result?: { status?: string; can_post_messages?: boolean };
    description?: string;
  } | null;
  if (!memberResponse.ok || !memberPayload?.ok) {
    throw new Error(telegramChannelSetupError(memberPayload?.description));
  }
  const member = memberPayload.result;
  if (member?.status !== "administrator" || member.can_post_messages === false) {
    throw new Error(telegramChannelSetupError("ربات باید Administrator باشد و Post Messages فعال باشد."));
  }
  return { channel: CHANNEL_HANDLE, status: member.status };
}

export function isTelegramEngagementConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
}

export function isValidTelegramWebhookSecret(value: string | undefined) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !value) return false;
  return safeEqual(value, expected);
}

export async function dbUpdateEngagementWebhookEnabled(settingsId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(publisherSettings).set({ engagementWebhookEnabled: enabled }).where(eq(publisherSettings.id, settingsId));
}
