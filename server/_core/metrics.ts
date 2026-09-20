export type PublisherMetric = "draft_created" | "publish_success" | "publish_failed" | "publish_unknown" | "duplicate_prevented" | "publish_conflict";

const counters = new Map<PublisherMetric, number>();

export function incrementPublisherMetric(metric: PublisherMetric) {
  counters.set(metric, (counters.get(metric) ?? 0) + 1);
}

export function snapshotPublisherMetrics() {
  return Object.fromEntries(counters.entries()) as Partial<Record<PublisherMetric, number>>;
}
