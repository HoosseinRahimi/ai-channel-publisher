import DashboardLayout from "@/components/DashboardLayout";
import EngagementIntelligence from "@/components/EngagementIntelligence";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatLatestPublication,
  prepareDailyAnalytics,
  preparePostKindAnalytics,
} from "@/lib/analytics";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FilePenLine,
  MessageCircleHeart,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "indigo",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Send;
  tone?: "indigo" | "emerald" | "amber" | "rose";
}) {
  const tones = {
    indigo: "bg-indigo-500/10 text-indigo-700",
    emerald: "bg-emerald-500/10 text-emerald-700",
    amber: "bg-amber-500/10 text-amber-700",
    rose: "bg-rose-500/10 text-rose-700",
  };
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {value}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
          <div className={`rounded-2xl p-3 ${tones[tone]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PublisherAnalytics() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const analytics = trpc.publisher.analytics.useQuery();
  const reports = trpc.publisher.weeklyReports.useQuery();
  const engagementStatus = trpc.publisher.engagementStatus.useQuery();
  const [engagementConfirmOpen, setEngagementConfirmOpen] = useState(false);
  const data = analytics.data;
  const reportsList = reports.data ?? [];
  const daily = prepareDailyAnalytics(data?.daily ?? [], locale);
  const kinds = preparePostKindAnalytics(data?.postKinds ?? [], {
    source: t("posts.kindSource"),
    explainer: t("posts.kindExplainer"),
  });
  const latest = formatLatestPublication(
    data?.latestPublishedAt,
    t("analytics.neverPublished"),
    locale
  );
  const refresh = () => {
    utils.publisher.analytics.invalidate();
    utils.publisher.weeklyReports.invalidate();
    utils.publisher.engagementStatus.invalidate();
  };
  const generateReport = trpc.publisher.generateWeeklyReport.useMutation({
    onSuccess: () => {
      toast.success(t("analytics.toastReportGenerated"));
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const enableWeekly = trpc.publisher.enableWeeklyReports.useMutation({
    onSuccess: () => {
      toast.success(t("analytics.toastWeeklyEnabled"));
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const enableEngagement = trpc.publisher.enableTelegramEngagement.useMutation({
    onSuccess: () => {
      toast.success(t("analytics.toastReactionsEnabled"));
      setEngagementConfirmOpen(false);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const downloadReport = (report: NonNullable<typeof reports.data>[number]) => {
    const blob = new Blob([report.reportMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `weekly-report-${report.periodStart.toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div dir={dir} className="mx-auto max-w-7xl space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(120deg,#0f172a_0%,#1e1b4b_55%,#312e81_100%)] px-6 py-8 text-white shadow-[0_24px_64px_rgba(30,27,75,0.22)] sm:px-9">
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-100">
                <TrendingUp className="h-4 w-4" />
                {t("analytics.heroKicker")}
              </div>
              <h1 className="text-3xl font-bold tracking-[-0.035em]">
                {t("analytics.heroTitle")}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                {t("analytics.heroDesc")}
              </p>
            </div>
            <Badge className="w-fit rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-slate-100 hover:bg-white/10">
              {t("analytics.latestPublication", { time: latest })}
            </Badge>
          </div>
        </section>

        {analytics.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(item => (
              <Skeleton className="h-36" key={item} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label={t("analytics.metricDelivered")}
              value={String(data?.totals.delivered ?? 0)}
              detail={t("analytics.metricDeliveredDetail")}
              icon={Send}
              tone="emerald"
            />
            <Metric
              label={t("analytics.metricDeliveryRate")}
              value={
                data?.totals.deliveryRate === null ||
                data?.totals.deliveryRate === undefined
                  ? "—"
                  : `${data?.totals.deliveryRate}%`
              }
              detail={t("analytics.metricDeliveryRateDetail")}
              icon={CheckCircle2}
              tone="indigo"
            />
            <Metric
              label={t("analytics.metricReactions")}
              value={String(data?.engagement.totalReactions ?? 0)}
              detail={t("analytics.metricReactionsDetail", {
                count: data?.engagement.trackedPosts ?? 0,
              })}
              icon={MessageCircleHeart}
              tone="rose"
            />
            <Metric
              label={t("analytics.metricPending")}
              value={String(data?.totals.pendingReview ?? 0)}
              detail={t("analytics.metricPendingDetail")}
              icon={FilePenLine}
              tone="amber"
            />
          </div>
        )}

        <EngagementIntelligence />

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-indigo-600" />
                {t("analytics.weeklyTitle")}
              </CardTitle>
              <CardDescription>{t("analytics.weeklyDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => generateReport.mutate()}
                  disabled={generateReport.isPending}
                >
                  <Download className="h-4 w-4" />
                  {t("analytics.generateThisWeek")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => enableWeekly.mutate()}
                  disabled={enableWeekly.isPending}
                >
                  <Clock3 className="h-4 w-4" />
                  {t("analytics.enableMonday")}
                </Button>
              </div>
              <div className="space-y-2">
                {reportsList.length ? (
                  reportsList.map(report => (
                    <div
                      key={report.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {t("analytics.reportPeriod", {
                            from: report.periodStart.toLocaleDateString(locale),
                            to: report.periodEnd.toLocaleDateString(locale),
                          })}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {t("analytics.generatedAt", {
                            time: report.generatedAt.toLocaleString(locale),
                          })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadReport(report)}
                      >
                        <Download className="h-4 w-4" />
                        {t("common.download")}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-indigo-200 p-4 text-sm text-slate-500">
                    {t("analytics.noReports")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircleHeart className="h-5 w-5 text-rose-600" />
                {t("analytics.reactionsTitle")}
              </CardTitle>
              <CardDescription>{t("analytics.reactionsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-white p-4 text-sm leading-7 text-slate-700">
                <p className="font-semibold text-slate-950">
                  {data?.engagement.enabled
                    ? t("analytics.connectionStatusActive")
                    : t("analytics.connectionStatusInactive")}
                </p>
                <p className="mt-1">{t("analytics.reactionRequirements")}</p>
              </div>
              {!engagementStatus.data?.configured ? (
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-950">
                  <code dir="ltr">TELEGRAM_WEBHOOK_SECRET</code> —{" "}
                  {t("analytics.webhookSecretHint")}
                </p>
              ) : null}
              <Button
                className="w-full"
                variant={data?.engagement.enabled ? "outline" : "default"}
                disabled={
                  Boolean(data?.engagement.enabled) ||
                  !engagementStatus.data?.configured
                }
                onClick={() => setEngagementConfirmOpen(true)}
              >
                <ShieldCheck className="h-4 w-4" />
                {data?.engagement.enabled
                  ? t("analytics.reactionsEnabled")
                  : t("analytics.enableReactions")}
              </Button>
              <div className="space-y-2">
                {(data?.engagement.topPosts ?? []).length ? (
                  data?.engagement.topPosts.map(post => (
                    <div
                      className="flex items-center justify-between rounded-xl border border-rose-100 bg-white px-3 py-2"
                      key={post.id}
                    >
                      <span className="max-w-[75%] truncate text-sm text-slate-700">
                        {post.title}
                      </span>
                      <Badge className="bg-rose-600">
                        {t("analytics.reactionCount", {
                          count: post.reactionCount,
                        })}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    {t("analytics.noReactionData")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-violet-600" />
                {t("analytics.trendTitle")}
              </CardTitle>
              <CardDescription>{t("analytics.trendDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={daily}
                    margin={{ top: 10, right: 8, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="delivered"
                        x1="0"
                        x2="0"
                        y1="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient id="drafts" x1="0" x2="0" y1="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                    <Area
                      type="monotone"
                      name={t("analytics.seriesDelivered")}
                      dataKey="delivered"
                      stroke="#059669"
                      fill="url(#delivered)"
                      strokeWidth={2.5}
                    />
                    <Area
                      type="monotone"
                      name={t("analytics.seriesDrafts")}
                      dataKey="drafts"
                      stroke="#7c3aed"
                      fill="url(#drafts)"
                      strokeWidth={2.5}
                    />
                    <Area
                      type="monotone"
                      name={t("analytics.seriesFailed")}
                      dataKey="failed"
                      stroke="#e11d48"
                      fill="transparent"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock3 className="h-5 w-5 text-violet-600" />
                {t("analytics.dataScopeTitle")}
              </CardTitle>
              <CardDescription>{t("analytics.dataScopeDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">
                  {t("analytics.publishingPerfTitle")}
                </p>
                <p className="mt-1">{t("analytics.publishingPerfDesc")}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4 text-rose-950">
                <p className="font-semibold">
                  {t("analytics.engagementScopeTitle")}
                </p>
                <p className="mt-1">{t("analytics.engagementScopeDesc")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-violet-600" />
                {t("analytics.sourcesPerfTitle")}
              </CardTitle>
              <CardDescription>
                {t("analytics.sourcesPerfDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.sources.length ?? 0) === 0 ? (
                <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  {t("analytics.noSourceData")}
                </div>
              ) : (
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={data?.sources}
                      margin={{ top: 2, right: 12, left: 25, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#e2e8f0"
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        dataKey="sourceName"
                        type="category"
                        width={105}
                        tick={{ fontSize: 11, fill: "#475569" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 14,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="delivered"
                        name={t("analytics.seriesDelivered")}
                        radius={[0, 7, 7, 0]}
                        fill="#7c3aed"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-violet-600" />
                {t("analytics.mixTitle")}
              </CardTitle>
              <CardDescription>{t("analytics.mixDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={kinds}
                    margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e2e8f0"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name={t("analytics.seriesDelivered")}
                      radius={[8, 8, 0, 0]}
                    >
                      {kinds.map((item, index) => (
                        <Cell
                          key={item.kind}
                          fill={index === 0 ? "#6366f1" : "#10b981"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
        <AlertDialog
          open={engagementConfirmOpen}
          onOpenChange={setEngagementConfirmOpen}
        >
          <AlertDialogContent dir={dir}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("analytics.confirmWebhookTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("analytics.confirmWebhookDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={enableEngagement.isPending}
                onClick={() => enableEngagement.mutate()}
              >
                <AlertCircle className="h-4 w-4" />
                {t("analytics.enableReactions")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
