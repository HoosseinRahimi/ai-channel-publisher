import { describe, expect, it } from "vitest";
import { formatLatestPublication, prepareDailyAnalytics, preparePostKindAnalytics } from "./analytics";

const kindLabels = { source: "خبر منبع", explainer: "توضیح تحلیلی" };

describe("analytics dashboard data preparation", () => {
  it("prepares empty and populated chart data without fabricating publication metrics", () => {
    expect(prepareDailyAnalytics([])).toEqual([]);
    expect(preparePostKindAnalytics([], kindLabels)).toEqual([]);
    expect(formatLatestPublication(null, "هنوز منتشر نشده")).toBe("هنوز منتشر نشده");
    expect(formatLatestPublication(new Date("2026-08-13T10:00:00.000Z"), "Not published yet", "en-US")).toBe(
      new Date("2026-08-13T10:00:00.000Z").toLocaleString("en-US")
    );
    const daily = prepareDailyAnalytics([{ date: "2026-08-13", delivered: 3, failed: 0, drafts: 1 }]);
    expect(daily[0]).toMatchObject({ delivered: 3, failed: 0, drafts: 1 });
    expect(daily[0]?.label).toBeTruthy();
    expect(preparePostKindAnalytics([{ kind: "source", count: 2 }, { kind: "explainer", count: 1 }], kindLabels)).toEqual([
      { kind: "source", count: 2, label: "خبر منبع" },
      { kind: "explainer", count: 1, label: "توضیح تحلیلی" },
    ]);
    expect(preparePostKindAnalytics([{ kind: "source", count: 2 }], { source: "Source news", explainer: "Explainer" })).toEqual([
      { kind: "source", count: 2, label: "Source news" },
    ]);
  });
});
