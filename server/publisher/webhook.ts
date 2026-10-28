import { eq } from "drizzle-orm";
import { publisherPostEngagement, publisherPosts, publisherSettings } from "../../drizzle/schema";
import { requireDb } from "../db";
import {
  buildTelegramRecipientCode,
  isValidTelegramRecipientCode,
  summarizeTelegramReactions,
} from "./analytics";
import {
  hashText,
  isAuthorizedTelegramCallback,
  type TelegramReactionUpdate,
  type TelegramWebhookUpdate,
} from "./editorial";
import { discardDraft, publishDraft, setDraftHeld } from "./pipeline";
import { getPublisherSettings } from "./settings";
import {
  answerTelegramCallbackQuery,
  parseManagedCallbackData,
  sendTelegramMessage,
} from "./telegram";

export async function recordTelegramReactionUpdate(update: TelegramReactionUpdate) {
  const change = update.message_reaction_count;
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const channelUsername = change?.chat?.username?.toLowerCase();
  if (!change?.message_id || (channelUsername && `@${channelUsername}` !== settings.channelHandle.toLowerCase())) return { tracked: false };
  const telegramMessageId = String(change.message_id);
  const post = (await db.select({ id: publisherPosts.id }).from(publisherPosts).where(eq(publisherPosts.telegramMessageId, telegramMessageId)).limit(1))[0];
  if (!post) return { tracked: false };
  const reactionSummary = summarizeTelegramReactions(change.reactions ?? []);
  const reactionCount = reactionSummary.reduce((total, reaction) => total + reaction.count, 0);
  const changedAt = change.date ? new Date(change.date * 1000) : new Date();
  await db.insert(publisherPostEngagement).values({ publisherPostId: post.id, telegramMessageId, reactionCount, reactionSummary: JSON.stringify(reactionSummary), lastReactionAt: changedAt }).onDuplicateKeyUpdate({ set: { reactionCount, reactionSummary: JSON.stringify(reactionSummary), lastReactionAt: changedAt } });
  await db.update(publisherSettings).set({ engagementLastUpdatedAt: changedAt }).where(eq(publisherSettings.id, settings.id));
  return { tracked: true, postId: post.id, reactionCount };
}

export async function handleTelegramWebhookUpdate(update: TelegramWebhookUpdate) {
  if (update.callback_query?.data) {
    const settings = await getPublisherSettings();
    const recipientChatId = settings.reportRecipientChatId;
    const callbackUserId = update.callback_query.from?.id;
    const callbackChatId = update.callback_query.message?.chat?.id;
    const authorized = isAuthorizedTelegramCallback({ recipientChatId, callbackUserId, callbackChatId });
    if (!authorized) {
      await answerTelegramCallbackQuery(update.callback_query.id, "⛔ Unauthorized");
      return { kind: "callback-query" as const, authorized: false };
    }
    const parsedCallback = parseManagedCallbackData(update.callback_query.data);
    if (!parsedCallback) {
      await answerTelegramCallbackQuery(update.callback_query.id, "⚠️ Invalid or expired action");
      return { kind: "callback-query" as const, authorized: true, valid: false };
    }
    const { action, postId } = parsedCallback;
    if (postId) {
      try {
        if (action === "publish") {
          await publishDraft(postId);
          await answerTelegramCallbackQuery(update.callback_query.id, "✅ Post published to channel!");
        } else if (action === "hold") {
          await setDraftHeld(postId, true);
          await answerTelegramCallbackQuery(update.callback_query.id, "⏳ Post put on hold.");
        } else if (action === "discard") {
          await discardDraft(postId);
          await answerTelegramCallbackQuery(update.callback_query.id, "❌ Draft discarded.");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Action failed";
        await answerTelegramCallbackQuery(update.callback_query.id, `⚠️ ${msg}`);
      }
      return { kind: "callback-query" as const, action, postId };
    }
  }

  const text = update.message?.text?.trim() ?? "";
  const match = text.match(/^\/start\s+((?:VS|PUB)-[A-Z0-9]+)$/i);
  const chatId = update.message?.chat?.id;
  if (match && chatId !== undefined) {
    const recipient = await connectTelegramRecipient(chatId, match[1]);
    return { kind: "recipient-link" as const, ...recipient };
  }
  const reaction = await recordTelegramReactionUpdate(update);
  return { kind: "reaction" as const, ...reaction };
}

export async function createTelegramRecipientLink() {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const code = buildTelegramRecipientCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.update(publisherSettings).set({ reportRecipientCodeHash: hashText(code), reportRecipientCodeExpiresAt: expiresAt }).where(eq(publisherSettings.id, settings.id));
  return { code, expiresAt };
}

export async function connectTelegramRecipient(chatId: string | number, code: string) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const valid = isValidTelegramRecipientCode({ code, codeHash: settings.reportRecipientCodeHash, expiresAt: settings.reportRecipientCodeExpiresAt });
  if (!valid) return { connected: false };
  await db.update(publisherSettings).set({ reportRecipientChatId: String(chatId), reportRecipientCodeHash: null, reportRecipientCodeExpiresAt: null, weeklyReportDeliveryEnabled: true }).where(eq(publisherSettings.id, settings.id));
  await sendTelegramMessage(String(chatId), `✅ Your account is now connected for weekly reports and engagement alerts from ${settings.appName}.`);
  return { connected: true };
}
