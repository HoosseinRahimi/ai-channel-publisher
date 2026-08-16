export type SourcePerformanceExportRow = {
  sourceName: string;
  deliveredPosts: number;
  trackedPosts: number;
  totalReactions: number;
  averageReactions: number | null;
  averageEngagementRateBps: number | null;
};

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildSourcePerformanceCsv(rows: SourcePerformanceExportRow[]) {
  const header = ["source", "delivered_posts", "tracked_posts", "total_reactions", "average_reactions_per_post", "average_engagement_rate_percent"];
  const body = rows.map(row => [
    row.sourceName,
    row.deliveredPosts,
    row.trackedPosts,
    row.totalReactions,
    row.averageReactions ?? "",
    row.averageEngagementRateBps === null ? "" : (row.averageEngagementRateBps / 100).toFixed(2),
  ].map(escapeCsv).join(","));
  return `\uFEFF${[header.join(","), ...body].join("\r\n")}\r\n`;
}
