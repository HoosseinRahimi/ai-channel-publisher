import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { publisherSettings } from "../../drizzle/schema";
import { telegramChannelSetupError } from "./editorial";

export async function getChannelHandle() {
  const db = await getDb();
  if (db) {
    const settings = (await db.select({ channelHandle: publisherSettings.channelHandle }).from(publisherSettings).limit(1))[0];
    if (settings?.channelHandle) return settings.channelHandle;
  }
  return process.env.TELEGRAM_CHANNEL_HANDLE?.trim() || "@your_channel";
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("The Telegram bot token is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(`Sending the Telegram direct message failed: ${payload?.description ?? response.status}`);
}

export async function fetchTelegramChannelAudienceSize() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("The Telegram bot token is not configured.");
  const channelHandle = await getChannelHandle();
  const response = await fetch(`https://api.telegram.org/bot${token}/getChatMemberCount`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: channelHandle }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; result?: number; description?: string } | null;
  if (!response.ok || !payload?.ok || typeof payload.result !== "number") throw new Error(`Reading the channel member count failed: ${payload?.description ?? response.status}`);
  return payload.result;
}

export async function deliverToTelegram(content: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("The Telegram bot token is not configured.");
  const channelHandle = await getChannelHandle();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: channelHandle, text: content, disable_web_page_preview: false }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
  if (!response.ok || !result?.ok) {
    const detail = result?.description || `Telegram request failed (${response.status}).`;
    if (/not a member|chat not found|not enough rights|not allowed|forbidden/i.test(detail)) {
      throw new Error(telegramChannelSetupError(channelHandle, detail));
    }
    throw new Error(`Delivering to Telegram failed: ${detail}`);
  }
  return String(result.result?.message_id ?? "");
}

export async function verifyTelegramChannelAccess() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("The Telegram bot token is not configured.");
  const channelHandle = await getChannelHandle();

  const meResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(15000) });
  const mePayload = await meResponse.json().catch(() => null) as { ok?: boolean; result?: { id?: number }; description?: string } | null;
  const botId = mePayload?.result?.id;
  if (!meResponse.ok || !mePayload?.ok || !botId) throw new Error("The Telegram bot token is invalid or cannot be verified.");

  const memberResponse = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: channelHandle, user_id: botId }),
    signal: AbortSignal.timeout(15000),
  });
  const memberPayload = await memberResponse.json().catch(() => null) as {
    ok?: boolean;
    result?: { status?: string; can_post_messages?: boolean };
    description?: string;
  } | null;
  if (!memberResponse.ok || !memberPayload?.ok) {
    throw new Error(telegramChannelSetupError(channelHandle, memberPayload?.description));
  }
  const member = memberPayload.result;
  if (member?.status !== "administrator" || member.can_post_messages === false) {
    throw new Error(telegramChannelSetupError(channelHandle, "The bot must be an administrator with Post Messages enabled."));
  }
  return { channel: channelHandle, status: member.status };
}

export function isTelegramEngagementConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
}

export function isValidTelegramWebhookSecret(value: string | undefined) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !value) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function dbUpdateEngagementWebhookEnabled(settingsId: number, enabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(publisherSettings).set({ engagementWebhookEnabled: enabled }).where(eq(publisherSettings.id, settingsId));
}
