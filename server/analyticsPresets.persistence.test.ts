import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  deleted: 0,
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => mocks.rows }),
          limit: async () => mocks.rows,
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        mocks.inserted.push(value);
        return { onDuplicateKeyUpdate: async () => undefined };
      },
    }),
    delete: () => ({
      where: async () => { mocks.deleted += 1; },
    }),
  })),
}));

import { deleteAnalyticsPreset, listAnalyticsPresets, saveAnalyticsPreset } from "./publisher";

describe("analytics preset persistence", () => {
  it("saves, lists, and deletes presets through owner-scoped database operations", async () => {
    const existing = { id: 7, ownerOpenId: "owner-a", name: "OpenAI recent week", sourceName: "OpenAI News", dateFrom: new Date("2026-08-01T00:00:00.000Z"), dateTo: new Date("2026-08-07T23:59:59.999Z") };
    mocks.rows = [existing];
    mocks.inserted = [];
    mocks.deleted = 0;

    const saved = await saveAnalyticsPreset("owner-a", { name: "  OpenAI recent week  ", sourceName: "OpenAI News", from: "2026-08-01", to: "2026-08-07" });
    expect(mocks.inserted).toEqual([expect.objectContaining({ ownerOpenId: "owner-a", name: "OpenAI recent week", sourceName: "OpenAI News", dateFrom: new Date("2026-08-01T00:00:00.000Z"), dateTo: new Date("2026-08-07T23:59:59.999Z") })]);
    expect(saved).toEqual(existing);
    expect(await listAnalyticsPresets("owner-a")).toEqual([existing]);

    await deleteAnalyticsPreset("owner-a", 7);
    expect(mocks.deleted).toBe(1);
  });
});
