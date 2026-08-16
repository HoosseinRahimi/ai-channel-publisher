export type DailyAnalyticsPoint = { date: string; delivered: number; failed: number; drafts: number };
export type PostKindAnalyticsPoint = { kind: "source" | "explainer"; count: number };

export function prepareDailyAnalytics(points: DailyAnalyticsPoint[], locale = "fa-IR") {
  return points.map(point => ({
    ...point,
    label: new Date(`${point.date}T00:00:00.000Z`).toLocaleDateString(locale, { month: "numeric", day: "numeric" }),
  }));
}

export function preparePostKindAnalytics(points: PostKindAnalyticsPoint[], kindLabels: { source: string; explainer: string }) {
  return points.map(point => ({ ...point, label: point.kind === "source" ? kindLabels.source : kindLabels.explainer }));
}

export function formatLatestPublication(value: Date | null | undefined, notPublishedLabel: string, locale = "fa-IR") {
  return value ? new Date(value).toLocaleString(locale) : notPublishedLabel;
}
