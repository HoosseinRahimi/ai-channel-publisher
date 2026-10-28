import { randomUUID } from "crypto";
import { and, desc, eq, lte, or } from "drizzle-orm";
import {
  publisherDeliveryAttempts,
  publisherPosts,
  publisherRuns,
  publisherSettings,
  publisherSources,
  type PublisherSource,
} from "../../drizzle/schema";
import { invokeLLM, type Message } from "../_core/llm";
import { incrementPublisherMetric } from "../_core/metrics";
import { assertSafeRemoteUrl, fetchSafeRemote } from "../_core/urlPolicy";
import { requireDb } from "../db";
import {
  allowsScheduledPublisherRun,
  canAutoPublishDraft,
  extractCandidates,
  hashText,
  isReviewableDraftStatus,
  matchesDuplicate,
  nextThreeHourBoundary,
  normalizeEditedDraftContent,
  normalizeTopic,
  postSignature,
  renderChannelPost,
  stripMarkup,
  titleFromContent,
  type GeneratedPost,
  type NewsCandidate,
} from "./editorial";
import {
  buildEditorialSystemPrompt,
  buildPostGenerationPrompt,
  languageName,
  outputMatchesLanguage,
} from "./languages";
import { resolveLlmConfig } from "./llmConfig";
import { getPublisherSettings, renderOptions, settingsPostLanguage } from "./settings";
import {
  dbUpdateEngagementWebhookEnabled,
  deliverToTelegram,
  sendDraftReviewNotificationToTelegram,
  TelegramPartialDeliveryError,
  verifyTelegramChannelAccess,
} from "./telegram";

async function fetchCandidates(source: PublisherSource): Promise<NewsCandidate[]> {
  const url = source.feedUrl ?? source.homepage;
  const response = await fetchSafeRemote(url, {
    headers: { "user-agent": "AIChannelPublisher/1.0 (+news aggregation)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !/(text\/|xml|json|html)/i.test(contentType)) throw new Error(`${source.name} returned an unsupported content type.`);
  return extractCandidates(source, await readBoundedResponseText(response));
}

const MAX_SOURCE_RESPONSE_BYTES = 2_000_000;

async function readBoundedResponseText(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SOURCE_RESPONSE_BYTES) throw new Error("Source response exceeds the 2 MB limit.");
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_SOURCE_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Source response exceeds the 2 MB limit."); }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function isDuplicate(candidate: NewsCandidate) {
  const db = await requireDb();
  const urlHash = hashText(candidate.url);
  const topic = normalizeTopic(candidate.title);
  const existing = await db.select({ sourceUrlHash: publisherPosts.sourceUrlHash, normalizedTopic: publisherPosts.normalizedTopic, contentFingerprint: publisherPosts.contentFingerprint }).from(publisherPosts).where(and(
    eq(publisherPosts.deliveryStatus, "delivered"),
    or(eq(publisherPosts.sourceUrlHash, urlHash), eq(publisherPosts.normalizedTopic, topic))
  )).limit(10);
  return matchesDuplicate(existing, { sourceUrlHash: urlHash, normalizedTopic: topic });
}

async function isDuplicateContent(content: string) {
  const db = await requireDb();
  const fingerprint = hashText(content);
  const existing = await db.select({ sourceUrlHash: publisherPosts.sourceUrlHash, normalizedTopic: publisherPosts.normalizedTopic, contentFingerprint: publisherPosts.contentFingerprint }).from(publisherPosts).where(and(
    eq(publisherPosts.deliveryStatus, "delivered"),
    eq(publisherPosts.contentFingerprint, fingerprint)
  )).limit(1);
  return matchesDuplicate(existing, { contentFingerprint: fingerprint });
}

async function pickCandidate() {
  const db = await requireDb();
  const sources = await db.select().from(publisherSources).where(eq(publisherSources.isActive, true));
  const batches = await Promise.allSettled(sources.map(fetchCandidates));
  const candidates = batches.flatMap(batch => batch.status === "fulfilled" ? batch.value : []);
  for (const candidate of candidates) {
    if (!(await isDuplicate(candidate))) return candidate;
  }
  throw new Error("No unposted verified source item is currently available.");
}

async function addArticleContext(candidate: NewsCandidate) {
  try {
    await assertSafeRemoteUrl(candidate.url, "Article URL");
    const response = await fetchSafeRemote(candidate.url, {
      headers: { "user-agent": "AIChannelPublisher/1.0 (+news aggregation)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return candidate;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !/(text\/|xml|html)/i.test(contentType)) return candidate;
    const html = await readBoundedResponseText(response);
    const withoutScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    return { ...candidate, sourceText: stripMarkup(withoutScripts).slice(0, 6500) };
  } catch {
    return candidate;
  }
}

function parseGeneratedPostJson(content: string): GeneratedPost {
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const cleanContent = jsonMatch ? jsonMatch[1].trim() : content.trim();
  const firstBrace = cleanContent.indexOf("{");
  const lastBrace = cleanContent.lastIndexOf("}");
  const jsonString = (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace)
    ? cleanContent.slice(firstBrace, lastBrace + 1)
    : cleanContent;

  const parsed = JSON.parse(jsonString) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Parsed content is not a valid JSON object.");
  }

  const headline = typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const realWorldImpact = typeof parsed.realWorldImpact === "string" ? parsed.realWorldImpact.trim() : "";

  let keyPoints: string[] = [];
  if (Array.isArray(parsed.keyPoints)) {
    keyPoints = parsed.keyPoints.map(p => String(p).trim()).filter(Boolean);
  } else if (typeof parsed.keyPoints === "string") {
    keyPoints = parsed.keyPoints.split("\n").map(p => p.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  }

  if (!headline || !summary) {
    throw new Error("Generated post is missing headline or summary.");
  }

  return {
    headline,
    summary,
    keyPoints: keyPoints.slice(0, 3),
    realWorldImpact,
  };
}

async function generatePost(candidate: NewsCandidate, postKind: "source" | "explainer") {
  const settings = await getPublisherSettings();
  const language = settingsPostLanguage(settings);
  const guidanceLabel = language === "fa" ? "راهنمای ثابت تحریریه" : language === "de" ? "Feste redaktionelle Vorgaben" : "Editorial guidance";
  const feedbackLabel = language === "fa" ? "بازخورد فقط برای همین پست" : language === "de" ? "Feedback nur für diesen Beitrag" : "Feedback for this post only";
  const editorialNotes = [
    settings.editorialGuidance ? `${guidanceLabel}: ${settings.editorialGuidance}` : null,
    settings.nextPostToneFeedback ? `${feedbackLabel}: ${settings.nextPostToneFeedback}` : null,
  ].filter(Boolean).join("\n");
  const llm = await resolveLlmConfig();

  const messages: Message[] = [
    {
      role: "system",
      content: buildEditorialSystemPrompt(language),
    },
    {
      role: "user",
      content: buildPostGenerationPrompt({ language, postKind, editorialNotes, candidate }),
    },
  ];

  let content: string | undefined;

  try {
    const response = await invokeLLM({
      connection: { baseUrl: llm.baseUrl, apiKey: llm.apiKey },
      model: llm.model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "telegram_channel_post",
          strict: true,
          schema: {
            type: "object",
            properties: {
              headline: { type: "string" },
              summary: { type: "string" },
              keyPoints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
              realWorldImpact: { type: "string" },
            },
            required: ["headline", "summary", "keyPoints", "realWorldImpact"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = response.choices[0]?.message?.content;
    content = typeof raw === "string" ? raw : undefined;
  } catch (err) {
    // If strict json_schema is unsupported (e.g. Ollama, older vLLM, certain OpenRouter engines),
    // fallback gracefully to json_object format
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (/schema|unsupported|response_format|bad request|400/i.test(errorMessage)) {
      console.warn("Retrying post generation with json_object format fallback due to provider schema rejection:", errorMessage);
      const fallbackResponse = await invokeLLM({
        connection: { baseUrl: llm.baseUrl, apiKey: llm.apiKey },
        model: llm.model,
        messages,
        response_format: { type: "json_object" },
      });
      const fallbackRaw = fallbackResponse.choices[0]?.message?.content;
      content = typeof fallbackRaw === "string" ? fallbackRaw : undefined;
    } else {
      throw err;
    }
  }

  if (!content || typeof content !== "string") throw new Error("The language model returned no post content.");
  const generated = parseGeneratedPostJson(content);
  if (!outputMatchesLanguage(`${generated.headline}${generated.summary}`, language)) {
    throw new Error(`The language model did not return content in the configured output language (${languageName(language)}).`);
  }
  return generated;
}

export async function configureTelegramEngagementWebhook(origin: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) throw new Error("The bot token and TELEGRAM_WEBHOOK_SECRET are required to register the engagement webhook securely.");
  const baseUrl = origin.replace(/\/$/, "");
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: `${baseUrl}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message_reaction_count", "message"] }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) throw new Error(`Registering the Telegram engagement webhook failed: ${result?.description ?? response.status}`);
  const settings = await getPublisherSettings();
  await dbUpdateEngagementWebhookEnabled(settings.id, true);
  return { webhookUrl: `${baseUrl}/api/telegram/webhook` };
}

async function createRun(runKey: string, taskUid?: string) {
  const db = await requireDb();
  try {
    await db.insert(publisherRuns).values({ runKey, scheduleCronTaskUid: taskUid ?? null });
    return true;
  } catch {
    return false;
  }
}

async function finishRun(runKey: string, status: "completed" | "failed" | "skipped", detail?: string) {
  const db = await requireDb();
  await db.update(publisherRuns).set({ status, detail: detail?.slice(0, 4000) ?? null, completedAt: new Date() }).where(eq(publisherRuns.runKey, runKey));
}

export async function generateDraftForReview(options: { taskUid?: string; scheduledFor?: Date; isManual?: boolean } = {}) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  if (!allowsScheduledPublisherRun(settings.isEnabled, options.isManual)) {
    return { status: "skipped" as const, reason: "publisher-disabled" };
  }
  const scheduledFor = options.scheduledFor ?? nextThreeHourBoundary();
  const runKey = options.isManual ? `manual-draft-${randomUUID()}` : `draft-${options.taskUid ?? "schedule"}-${scheduledFor.getTime()}`;
  if (!(await createRun(runKey, options.taskUid))) return { status: "skipped" as const, reason: "Draft already generated for this review window." };

  try {
    const existingDraft = await db.select({ id: publisherPosts.id }).from(publisherPosts).where(and(
      eq(publisherPosts.deliveryStatus, "draft"),
      eq(publisherPosts.scheduledFor, scheduledFor)
    )).limit(1);
    if (existingDraft[0]) {
      await finishRun(runKey, "skipped", "A draft already exists for this review window.");
      return { status: "skipped" as const, reason: "A review draft already exists." };
    }
    const candidate = await addArticleContext(await pickCandidate());
    const postKind = settings.nextPostKind;
    const generated = await generatePost(candidate, postKind);
    const content = renderChannelPost(generated, candidate, renderOptions(settings));
    if (await isDuplicateContent(content)) {
      await finishRun(runKey, "skipped", "A delivered post already has the same content fingerprint.");
      return { status: "skipped" as const, reason: "Duplicate post content." };
    }
    const inserted = await db.insert(publisherPosts).values({
      postKind,
      title: generated.headline.slice(0, 512),
      content,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.url,
      imageUrl: candidate.imageUrl && /^https?:\/\//i.test(candidate.imageUrl) ? candidate.imageUrl : null,
      sourceUrlHash: hashText(candidate.url),
      normalizedTopic: normalizeTopic(candidate.title),
      contentFingerprint: hashText(content),
      deliveryStatus: "draft",
      scheduledFor,
    });
    const postId = Number(inserted[0].insertId);
    incrementPublisherMetric("draft_created");
    if (settings.reportRecipientChatId) {
      await sendDraftReviewNotificationToTelegram(settings.reportRecipientChatId, postId, generated.headline, content).catch(() => null);
    }
    if (settings.nextPostToneFeedback) {
      await db.update(publisherSettings).set({ nextPostToneFeedback: null }).where(eq(publisherSettings.id, settings.id));
    }
    await db.update(publisherSettings).set({ lastRunAt: new Date() }).where(eq(publisherSettings.id, settings.id));
    await finishRun(runKey, "completed", `Created review draft ${postId}.`);
    return { status: "draft" as const, postId, scheduledFor };
  } catch (error) {
    await finishRun(runKey, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function editDraft(postId: number, content: string) {
  const db = await requireDb();
  const post = (await db.select().from(publisherPosts).where(eq(publisherPosts.id, postId)).limit(1))[0];
  if (!post || !isReviewableDraftStatus(post.deliveryStatus)) throw new Error("Only a pending review draft can be edited.");
  const settings = await getPublisherSettings();
  const signature = postSignature(renderOptions(settings));
  const finalContent = normalizeEditedDraftContent(content, signature);
  await db.update(publisherPosts).set({
    title: titleFromContent(finalContent, settingsPostLanguage(settings)),
    content: finalContent,
    contentFingerprint: hashText(finalContent),
  }).where(eq(publisherPosts.id, postId));
  return { postId, content: finalContent };
}

export async function setDraftHeld(postId: number, held: boolean) {
  const db = await requireDb();
  const result = await db.update(publisherPosts).set({ deliveryStatus: held ? "held" : "draft" }).where(and(
    eq(publisherPosts.id, postId),
    or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))
  ));
  if (!result[0].affectedRows) throw new Error("Only a pending review draft can be put on hold.");
  return { postId, held };
}

export async function discardDraft(postId: number) {
  const db = await requireDb();
  const result = await db.update(publisherPosts).set({ deliveryStatus: "discarded" }).where(and(
    eq(publisherPosts.id, postId),
    or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))
  ));
  if (!result[0].affectedRows) throw new Error("Only a pending review draft can be discarded.");
  return { postId, discarded: true };
}

export async function publishDraft(postId: number, options: { isTest?: boolean } = {}) {
  const db = await requireDb();
  const post = (await db.select().from(publisherPosts).where(eq(publisherPosts.id, postId)).limit(1))[0];
  if (!post || !isReviewableDraftStatus(post.deliveryStatus)) throw new Error("This draft is no longer ready to publish.");
  const claim = await db.update(publisherPosts).set({ deliveryStatus: "pending", isTest: Boolean(options.isTest), errorMessage: null }).where(and(
    eq(publisherPosts.id, postId),
    or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))
  ));
  if (!claim[0].affectedRows) {
    incrementPublisherMetric("publish_conflict");
    return { status: "skipped" as const, reason: "publish-conflict" };
  }
  const attemptId = randomUUID();
  let telegramMessageId: string;
  try {
    await db.insert(publisherDeliveryAttempts).values({ publisherPostId: postId, attemptId, status: "sending" });
    if (await isDuplicateContent(post.content)) {
      await db.update(publisherPosts).set({ deliveryStatus: "skipped", errorMessage: "A similar version has already been published." }).where(eq(publisherPosts.id, postId));
      await db.update(publisherDeliveryAttempts).set({ status: "skipped", completedAt: new Date(), errorMessage: "A similar version has already been published." }).where(eq(publisherDeliveryAttempts.attemptId, attemptId));
      incrementPublisherMetric("duplicate_prevented");
      return { status: "skipped" as const, reason: "duplicate-content" };
    }
    await verifyTelegramChannelAccess();
    telegramMessageId = await deliverToTelegram(post.content, { imageUrl: post.imageUrl });
  } catch (error) {
    const partial = error instanceof TelegramPartialDeliveryError ? error : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    incrementPublisherMetric(partial ? "publish_unknown" : "publish_failed");
    await db.update(publisherDeliveryAttempts).set({ status: partial ? "delivery_unknown" : "failed", telegramMessageId: partial?.telegramMessageId ?? null, completedAt: new Date(), errorMessage }).where(eq(publisherDeliveryAttempts.attemptId, attemptId)).catch(() => undefined);
    await db.update(publisherPosts).set({ deliveryStatus: partial ? "delivery_unknown" : "failed", telegramMessageId: partial?.telegramMessageId ?? null, errorMessage }).where(eq(publisherPosts.id, postId));
    throw error;
  }
  try {
    await db.update(publisherPosts).set({ deliveryStatus: "delivered", telegramMessageId, publishedAt: new Date() }).where(eq(publisherPosts.id, postId));
  } catch (error) {
    // Telegram accepted the message, but persistence failed. Never retry this
    // automatically: an operator must reconcile the delivery first.
    await db.update(publisherPosts).set({
      deliveryStatus: "delivery_unknown",
      telegramMessageId,
      errorMessage: error instanceof Error ? error.message : String(error),
    }).where(eq(publisherPosts.id, postId)).catch(() => undefined);
    await db.update(publisherDeliveryAttempts).set({ status: "delivery_unknown", telegramMessageId, completedAt: new Date(), errorMessage: error instanceof Error ? error.message : String(error) }).where(eq(publisherDeliveryAttempts.attemptId, attemptId)).catch(() => undefined);
    incrementPublisherMetric("publish_unknown");
    throw new Error("Telegram accepted the post, but delivery could not be recorded. Reconcile it before retrying.");
  }
  await db.update(publisherDeliveryAttempts).set({ status: "delivered", telegramMessageId, completedAt: new Date() }).where(eq(publisherDeliveryAttempts.attemptId, attemptId)).catch(() => undefined);
  const settings = await getPublisherSettings();
  await db.update(publisherSettings).set({
    nextPostKind: post.postKind === "source" ? "explainer" : "source",
    lastPublishedAt: new Date(),
  }).where(eq(publisherSettings.id, settings.id));
  incrementPublisherMetric("publish_success");
  return { status: "delivered" as const, postId };
}

export async function reconcileDelivery(postId: number, input: { delivered: boolean; telegramMessageId?: string }) {
  const db = await requireDb();
  if (input.delivered && !input.telegramMessageId?.trim()) throw new Error("A Telegram message ID is required when marking delivery complete.");
  const delivered = input.delivered;
  const result = await db.update(publisherPosts).set({
    deliveryStatus: delivered ? "delivered" : "draft",
    telegramMessageId: delivered ? input.telegramMessageId!.trim() : null,
    publishedAt: delivered ? new Date() : null,
    errorMessage: null,
  }).where(and(eq(publisherPosts.id, postId), eq(publisherPosts.deliveryStatus, "delivery_unknown")));
  if (!result[0].affectedRows) throw new Error("Only a delivery_unknown post can be reconciled.");
  await db.update(publisherDeliveryAttempts).set({
    status: delivered ? "delivered" : "skipped",
    telegramMessageId: delivered ? input.telegramMessageId!.trim() : null,
    completedAt: new Date(),
    errorMessage: delivered ? null : "Operator confirmed that Telegram did not receive the message.",
  }).where(and(eq(publisherDeliveryAttempts.publisherPostId, postId), eq(publisherDeliveryAttempts.status, "delivery_unknown")));
  return { postId, status: delivered ? "delivered" as const : "draft" as const };
}

export async function listDeliveryUnknownPosts() {
  const db = await requireDb();
  return db.select().from(publisherPosts).where(eq(publisherPosts.deliveryStatus, "delivery_unknown")).orderBy(desc(publisherPosts.updatedAt)).limit(20);
}

export async function autoPublishReadyDraft() {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  if (!settings.isEnabled) return { status: "skipped" as const, reason: "publisher-disabled" };
  const draft = (await db.select().from(publisherPosts).where(and(
    eq(publisherPosts.deliveryStatus, "draft"),
    lte(publisherPosts.scheduledFor, new Date())
  )).orderBy(desc(publisherPosts.scheduledFor)).limit(1))[0];
  if (!draft || !canAutoPublishDraft(draft.deliveryStatus, draft.scheduledFor)) return { status: "skipped" as const, reason: "No approved draft is ready for this publishing window." };
  return publishDraft(draft.id);
}
