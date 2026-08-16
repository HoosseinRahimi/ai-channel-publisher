import { describe, expect, it } from "vitest";
import { buildSourcePerformanceCsv } from "./sourcePerformanceCsv";

describe("buildSourcePerformanceCsv", () => {
  it("exports source metrics with a UTF-8 BOM, stable columns, and escaped source names", () => {
    const csv = buildSourcePerformanceCsv([{ sourceName: "OpenAI, News", deliveredPosts: 2, trackedPosts: 2, totalReactions: 10, averageReactions: 5, averageEngagementRateBps: 50 }]);
    expect(csv.startsWith("\uFEFFsource,delivered_posts,tracked_posts,total_reactions,average_reactions_per_post,average_engagement_rate_percent")).toBe(true);
    expect(csv).toContain('"OpenAI, News",2,2,10,5,0.50');
  });

  it("exports only the selected comparison rows provided by the filtered analysis", () => {
    const csv = buildSourcePerformanceCsv([{ sourceName: "Anthropic Newsroom", deliveredPosts: 3, trackedPosts: 2, totalReactions: 6, averageReactions: 2, averageEngagementRateBps: 20 }]);
    expect(csv).toContain("Anthropic Newsroom,3,2,6,2,0.20");
    expect(csv).not.toContain("OpenAI News");
  });
});
