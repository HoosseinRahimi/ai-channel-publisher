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

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { replyMarkup?: Record<string, unknown> }
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("The Telegram bot token is not configured.");
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  };
  if (options?.replyMarkup) {
    payload.reply_markup = options.replyMarkup;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) throw new Error(`Sending the Telegram direct message failed: ${result?.description ?? response.status}`);
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
}

export async function sendDraftReviewNotificationToTelegram(
  chatId: string,
  postId: number,
  headline: string,
  previewText: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const shortPreview = previewText.length > 500 ? `${previewText.slice(0, 500)}...` : previewText;
  const message = `📝 *New Draft for Review*\n\n*${headline}*\n\n${shortPreview}`;
  await sendTelegramMessage(chatId, message, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "✅ Publish Now", callback_data: `publish:${postId}` },
          { text: "⏳ Hold", callback_data: `hold:${postId}` },
          { text: "❌ Discard", callback_data: `discard:${postId}` },
        ],
      ],
    },
  });
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

export async function deliverToTelegram(content: string, options?: { imageUrl?: string | null }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("The Telegram bot token is not configured.");
  const channelHandle = await getChannelHandle();

  if (options?.imageUrl && /^https?:\/\//i.test(options.imageUrl)) {
    try {
      const photoPayload: Record<string, unknown> = {
        chat_id: channelHandle,
        photo: options.imageUrl,
      };
      if (content.length <= 1024) {
        photoPayload.caption = content;
      }
      const photoResponse = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(photoPayload),
        signal: AbortSignal.timeout(20000),
      });
      const photoResult = (await photoResponse.json().catch(() => null)) as {
        ok?: boolean;
        result?: { message_id?: number };
      } | null;

      if (photoResult?.ok && photoResult.result?.message_id) {
        // If content exceeded Telegram photo caption limit (1024 chars), follow up with the full text
        if (content.length > 1024) {
          const textResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: channelHandle,
              text: content,
              reply_to_message_id: photoResult.result.message_id,
            }),
            signal: AbortSignal.timeout(20000),
          });
          const textResult = (await textResponse.json().catch(() => null)) as {
            ok?: boolean;
            result?: { message_id?: number };
          } | null;
          return String(textResult?.result?.message_id ?? photoResult.result.message_id);
        }
        return String(photoResult.result.message_id);
      }
    } catch {
      // Photo sending failed or timed out; fall through to standard sendMessage
    }
  }

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
