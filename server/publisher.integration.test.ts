import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { publisherDeliveryAttempts, publisherPosts } from "../drizzle/schema";
import { publishDraft, reconcileDelivery } from "./publisher";

const integration = Boolean(process.env.DATABASE_URL);
const createdPostIds: number[] = [];
const originalFetch = globalThis.fetch;

async function createDraft(content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const inserted = await db.insert(publisherPosts).values({
    postKind: "source",
    title: "Concurrency integration test",
    content,
    sourceName: "Integration test",
    sourceUrl: "https://example.com/integration-test",
    sourceUrlHash: `integration-${Date.now()}-${Math.random()}`.slice(0, 64),
    normalizedTopic: `integration-${Date.now()}-${Math.random()}`,
    contentFingerprint: `integration-${Date.now()}-${Math.random()}`,
    deliveryStatus: "draft",
    isTest: true,
  });
  const postId = Number(inserted[0].insertId);
  createdPostIds.push(postId);
  return postId;
}

describe.skipIf(!integration)("publisher database integration", () => {
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    const db = await getDb();
    if (!db || createdPostIds.length === 0) return;
    await db
      .delete(publisherDeliveryAttempts)
      .where(
        inArray(publisherDeliveryAttempts.publisherPostId, createdPostIds)
      );
    await db
      .delete(publisherPosts)
      .where(inArray(publisherPosts.id, createdPostIds));
    createdPostIds.length = 0;
  });

  it("allows exactly one Telegram send when ten publishers claim the same draft", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "integration-test-token";
    process.env.TELEGRAM_CHANNEL_HANDLE = "@integration-test";
    let sends = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/getMe"))
        return Response.json({ ok: true, result: { id: 42 } });
      if (url.endsWith("/getChatMember"))
        return Response.json({
          ok: true,
          result: { status: "administrator", can_post_messages: true },
        });
      if (url.endsWith("/sendMessage")) {
        sends += 1;
        await new Promise(resolve => setTimeout(resolve, 25));
        return Response.json({
          ok: true,
          result: { message_id: 1000 + sends },
        });
      }
      throw new Error(`Unexpected Telegram endpoint: ${url}`);
    }) as typeof fetch;

    const postId = await createDraft(
      `Concurrent integration post ${Date.now()}`
    );
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => publishDraft(postId, { isTest: true }))
    );
    const fulfilled = results.filter(result => result.status === "fulfilled");
    const delivered = fulfilled.filter(
      result => result.value.status === "delivered"
    );
    const skipped = fulfilled.filter(
      result => result.value.status === "skipped"
    );

    expect(delivered).toHaveLength(1);
    expect(skipped).toHaveLength(9);
    expect(sends).toBe(1);
  });

  it("reconciles an unknown delivery only with an explicit operator decision", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database is unavailable.");
    const postId = await createDraft(
      `Unknown delivery integration post ${Date.now()}`
    );
    await db
      .update(publisherPosts)
      .set({ deliveryStatus: "delivery_unknown" })
      .where(eq(publisherPosts.id, postId));
    await db.insert(publisherDeliveryAttempts).values({
      publisherPostId: postId,
      attemptId: `integration-${Date.now()}-${Math.random()}`.slice(0, 64),
      status: "delivery_unknown",
      telegramMessageId: "777",
    });

    await expect(
      reconcileDelivery(postId, { delivered: false })
    ).resolves.toMatchObject({ postId, status: "draft" });
    const post = (
      await db
        .select({ deliveryStatus: publisherPosts.deliveryStatus })
        .from(publisherPosts)
        .where(eq(publisherPosts.id, postId))
    )[0];
    expect(post.deliveryStatus).toBe("draft");
  });
});
