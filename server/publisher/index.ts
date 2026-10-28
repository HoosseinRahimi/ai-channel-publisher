/**
 * Public façade for the publisher service.
 *
 * The original monolithic `server/publisher.ts` was split into focused modules
 * (`./editorial`, `./analytics`, `./telegram`, `./pipeline`, `./settings`,
 * `./sources`, `./reporting`, `./webhook`) with no behavior change. This barrel
 * re-exports the full original surface so every existing caller (`routers.ts`,
 * `publisherSchedule.ts`, `_core/index.ts`, the test suites) keeps importing
 * from `./publisher` unchanged.
 */
export * from "./editorial";
export * from "./languages";
export * from "./llmConfig";
export * from "./analytics";
export * from "./telegram";
export * from "./settings";
export * from "./sources";
export * from "./reporting";
export * from "./pipeline";
export * from "./webhook";

export type { PublisherPost } from "../../drizzle/schema";
