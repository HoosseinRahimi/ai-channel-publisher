/**
 * Resolves the effective LLM configuration. Values saved from the settings
 * UI (publisher_settings table) take precedence over the LLM_* environment
 * variables, which act as fallback/defaults.
 */
import type { LlmConnection } from "../_core/llm";
import { ENV } from "../_core/env";
import { decryptSecret } from "../_core/settingsCrypto";
import { getDb } from "../db";
import { publisherSettings } from "../../drizzle/schema";

export type ResolvedLlmConfig = LlmConnection & {
  model: string;
  apiKeyConfigured: boolean;
  baseUrlSource: "settings" | "env" | "none";
  modelSource: "settings" | "env" | "default";
  apiKeySource: "settings" | "env" | "none";
  dbApiKeyLast4: string | null;
};

async function readSettingsRow() {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(publisherSettings).limit(1))[0] ?? null;
}

export async function resolveLlmConfig(): Promise<ResolvedLlmConfig> {
  const row = await readSettingsRow();

  const dbBaseUrl = row?.llmBaseUrl?.trim() ?? "";
  const dbModel = row?.llmModel?.trim() ?? "";
  const dbApiKey = row?.llmApiKeyEncrypted ? decryptSecret(row.llmApiKeyEncrypted) : "";

  const baseUrl = dbBaseUrl || ENV.llmApiUrl;
  const model = dbModel || ENV.llmModel;
  const apiKey = dbApiKey || ENV.llmApiKey;

  return {
    baseUrl,
    apiKey,
    model,
    apiKeyConfigured: Boolean(apiKey),
    baseUrlSource: dbBaseUrl ? "settings" : ENV.llmApiUrl ? "env" : "none",
    modelSource: dbModel ? "settings" : ENV.llmModel ? "env" : "default",
    apiKeySource: dbApiKey ? "settings" : ENV.llmApiKey ? "env" : "none",
    dbApiKeyLast4: dbApiKey ? dbApiKey.slice(-4) : null,
  };
}
