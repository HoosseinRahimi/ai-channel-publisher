import { eq } from "drizzle-orm";
import type { PublisherSettings } from "../../drizzle/schema";
import { publisherSettings, publisherSources } from "../../drizzle/schema";
import { invokeLLM, listLLMModels, type Message } from "../_core/llm";
import { encryptSecret } from "../_core/settingsCrypto";
import { assertSafeRemoteUrl } from "../_core/urlPolicy";
import { requireDb } from "../db";
import { DEFAULT_CHANNEL_HANDLE, DEFAULT_SOURCES, normalizeChannelHandle, normalizeEditorialGuidance, normalizeEngagementThresholdBps } from "./editorial";
import { buildEditorialSystemPrompt, isPostLanguage, type PostLanguage } from "./languages";
import { resolveLlmConfig } from "./llmConfig";

/**
 * Returns the single publisher settings row, creating it (and the default
 * sources) on first run. Default sources are seeded only during this initial
 * bootstrap, so renaming or disabling them later is not undone.
 */
export async function getPublisherSettings(): Promise<PublisherSettings> {
  const db = await requireDb();
  const existing = (await db.select().from(publisherSettings).limit(1))[0];
  if (existing) return existing;

  await db.insert(publisherSettings).values({ channelHandle: process.env.TELEGRAM_CHANNEL_HANDLE?.trim() || DEFAULT_CHANNEL_HANDLE });
  const seeded = await db.select({ name: publisherSources.name }).from(publisherSources);
  const seededNames = new Set(seeded.map(source => source.name));
  const missingSources = DEFAULT_SOURCES.filter(source => !seededNames.has(source.name));
  if (missingSources.length) await db.insert(publisherSources).values(missingSources);
  return (await db.select().from(publisherSettings).limit(1))[0] as PublisherSettings;
}

export function settingsPostLanguage(settings: PublisherSettings): PostLanguage {
  return isPostLanguage(settings.postLanguage) ? settings.postLanguage : "fa";
}

export type DashboardSettings = Omit<PublisherSettings, "llmApiKeyEncrypted" | "reportRecipientCodeHash">;

/** Drops encrypted material and one-time code hashes before settings reach the browser. */
export function redactPublisherSettings(settings: PublisherSettings): DashboardSettings {
  const { llmApiKeyEncrypted: _encryptedApiKey, reportRecipientCodeHash: _recipientCodeHash, ...safe } = settings;
  return safe;
}

export function renderOptions(settings: PublisherSettings) {
  return {
    language: settingsPostLanguage(settings),
    channelHandle: settings.channelHandle,
    signature: settings.postSignature,
  };
}

export async function setPublisherEnabled(enabled: boolean, nextExecutionAt?: string | null) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  await db.update(publisherSettings).set({
    isEnabled: enabled,
    nextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, settings.id));
}

export async function setPublisherSchedules(autoTaskUid: string, draftTaskUid: string, nextExecutionAt?: string | null) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  await db.update(publisherSettings).set({
    isEnabled: true,
    scheduleCronTaskUid: autoTaskUid,
    draftCronTaskUid: draftTaskUid,
    nextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, settings.id));
}

export async function setWeeklyReportSchedule(taskUid: string, nextExecutionAt?: string | null) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  await db.update(publisherSettings).set({
    weeklyReportCronTaskUid: taskUid,
    weeklyReportNextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, settings.id));
}

export async function setEngagementAlertSchedule(taskUid: string, thresholdBps: number, nextExecutionAt?: string | null) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  if (!settings.reportRecipientChatId) throw new Error("Connect your Telegram account first to receive reports and alerts.");
  await db.update(publisherSettings).set({
    engagementAlertCronTaskUid: taskUid,
    engagementAlertNextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
    engagementAlertEnabled: true,
    lowEngagementRateBps: normalizeEngagementThresholdBps(thresholdBps),
  }).where(eq(publisherSettings.id, settings.id));
}

export async function updateEditorialPreferences(input: { editorialGuidance?: string | null; nextPostToneFeedback?: string | null }) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const update: { editorialGuidance?: string | null; nextPostToneFeedback?: string | null } = {};
  if (input.editorialGuidance !== undefined) update.editorialGuidance = normalizeEditorialGuidance(input.editorialGuidance, "Standing editorial guidance");
  if (input.nextPostToneFeedback !== undefined) update.nextPostToneFeedback = normalizeEditorialGuidance(input.nextPostToneFeedback, "Next-post feedback");
  await db.update(publisherSettings).set(update).where(eq(publisherSettings.id, settings.id));
  return { ...update };
}

export async function updateGeneralSettings(input: {
  channelHandle?: string;
  appName?: string | null;
  postSignature?: string | null;
  postLanguage?: string;
}) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const update: { channelHandle?: string; appName?: string; postSignature?: string | null; postLanguage?: string } = {};
  if (input.channelHandle !== undefined) update.channelHandle = normalizeChannelHandle(input.channelHandle);
  if (input.appName !== undefined) {
    const appName = (input.appName ?? "").trim();
    if (appName.length < 2 || appName.length > 80) throw new Error("App name must be between 2 and 80 characters.");
    update.appName = appName;
  }
  if (input.postSignature !== undefined) {
    const signature = (input.postSignature ?? "").trim();
    if (signature.length > 160) throw new Error("Post signature must be at most 160 characters.");
    update.postSignature = signature || null;
  }
  if (input.postLanguage !== undefined) {
    if (!isPostLanguage(input.postLanguage)) throw new Error("Unsupported output language.");
    update.postLanguage = input.postLanguage;
  }
  await db.update(publisherSettings).set(update).where(eq(publisherSettings.id, settings.id));
  const updated = (await db.select().from(publisherSettings).where(eq(publisherSettings.id, settings.id)).limit(1))[0];
  return redactPublisherSettings(updated);
}

export async function getLlmSettingsStatus() {
  const [settings, resolved] = await Promise.all([getPublisherSettings(), resolveLlmConfig()]);
  return {
    baseUrl: settings.llmBaseUrl ?? "",
    model: settings.llmModel ?? "",
    apiKeyConfigured: Boolean(settings.llmApiKeyEncrypted),
    apiKeyLast4: resolved.dbApiKeyLast4,
    effective: {
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      apiKeyConfigured: resolved.apiKeyConfigured,
      baseUrlSource: resolved.baseUrlSource,
      modelSource: resolved.modelSource,
      apiKeySource: resolved.apiKeySource,
    },
  };
}

export async function updateLlmSettings(input: {
  baseUrl?: string | null;
  model?: string | null;
  apiKey?: string | null;
}) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const update: { llmBaseUrl?: string | null; llmModel?: string | null; llmApiKeyEncrypted?: string | null } = {};
  if (input.baseUrl !== undefined) {
    const baseUrl = (input.baseUrl ?? "").trim();
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
        await assertSafeRemoteUrl(baseUrl, "LLM base URL");
      } catch {
        throw new Error("LLM base URL must be a valid http or https URL.");
      }
      update.llmBaseUrl = baseUrl;
    } else {
      update.llmBaseUrl = null;
    }
  }
  if (input.model !== undefined) {
    const model = (input.model ?? "").trim();
    if (model.length < 1 || model.length > 160) throw new Error("Model name must be between 1 and 160 characters.");
    update.llmModel = model;
  }
  if (input.apiKey !== undefined) {
    const apiKey = (input.apiKey ?? "").trim();
    update.llmApiKeyEncrypted = apiKey ? encryptSecret(apiKey) : null;
  }
  await db.update(publisherSettings).set(update).where(eq(publisherSettings.id, settings.id));
  return getLlmSettingsStatus();
}

export async function listAvailableModels() {
  const resolved = await resolveLlmConfig();
  const response = await listLLMModels({ baseUrl: resolved.baseUrl, apiKey: resolved.apiKey });
  return response.data
    .map(model => model.id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function testLlmConnection() {
  const resolved = await resolveLlmConfig();
  const response = await invokeLLM({
    connection: { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey },
    model: resolved.model,
    maxTokens: 32,
    messages: [
      { role: "system", content: "You are a connectivity check. Reply with exactly: ok" },
      { role: "user", content: "ping" },
    ],
  });
  const reply = response.choices[0]?.message?.content;
  return { ok: true, model: response.model || resolved.model, reply: typeof reply === "string" ? reply.trim().slice(0, 200) : "" };
}

/**
 * Instruction Studio: chats with the configured model using the channel's
 * live editorial prompt and guidance preloaded, so the editor can iterate on
 * the instructions conversationally before saving them as standing guidance.
 */
export async function chatWithEditorModel(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const settings = await getPublisherSettings();
  const language = settingsPostLanguage(settings);
  const llm = await resolveLlmConfig();
  const guidanceContext = settings.editorialGuidance
    ? `\n\nCurrent standing editorial guidance (the instructions you are helping to refine):\n${settings.editorialGuidance}`
    : "";
  const chatMessages: Message[] = [
    {
      role: "system",
      content:
        buildEditorialSystemPrompt(language) +
        guidanceContext +
        "\n\nYou are now in an instruction-tuning session with the channel editor. Help them draft, test and refine the editorial instructions and tone guidance for the channel's posts. When asked, produce a concise, ready-to-save instruction block. Reply in the same language the editor writes in. This conversation never gets published to the channel.",
    },
    ...messages.map(message => ({ role: message.role, content: message.content })),
  ];
  const response = await invokeLLM({
    connection: { baseUrl: llm.baseUrl, apiKey: llm.apiKey },
    model: llm.model,
    maxTokens: 2000,
    messages: chatMessages,
  });
  const reply = response.choices[0]?.message?.content;
  if (!reply || typeof reply !== "string") throw new Error("The language model returned no reply.");
  return { reply: reply.trim(), model: response.model || llm.model };
}
