import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ManualLatestReportDelivery from "@/components/ManualLatestReportDelivery";
import SourcePerformanceComparison from "@/components/SourcePerformanceComparison";
import SourceAlertSettings from "@/components/SourceAlertSettings";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { BellRing, KeyRound, Medal, SendHorizontal, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EngagementIntelligence() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const analytics = trpc.publisher.analytics.useQuery();
  const recipient = trpc.publisher.recipientStatus.useQuery();
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [thresholdPercent, setThresholdPercent] = useState("0.25");
  const refresh = () => { utils.publisher.analytics.invalidate(); utils.publisher.recipientStatus.invalidate(); };
  const createLink = trpc.publisher.createRecipientLink.useMutation({ onSuccess: result => { setLinkCode(result); toast.success(t("engagement.toastLinkCreated")); }, onError: error => toast.error(error.message) });
  const enableAlerts = trpc.publisher.enableEngagementAlerts.useMutation({ onSuccess: () => { toast.success(t("engagement.toastAlertsEnabled")); refresh(); }, onError: error => toast.error(error.message) });
  const data = analytics.data?.engagement;
  const thresholdBps = Math.round(Number(thresholdPercent) * 100);
  const percentFromBps = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${(value / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const enableAlert = () => {
    if (!Number.isFinite(thresholdBps) || thresholdBps < 1 || thresholdBps > 5000) return toast.error(t("engagement.thresholdError"));
    enableAlerts.mutate({ thresholdBps });
  };

  return <div className="grid gap-6 xl:grid-cols-3" dir={dir}>
    <Card className="border-indigo-200 bg-indigo-50/40 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><SendHorizontal className="h-5 w-5 text-indigo-600" />{t("engagement.privateTitle")}</CardTitle><CardDescription>{t("engagement.privateDesc")}</CardDescription></CardHeader><CardContent className="space-y-4">{recipient.data?.connected ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950"><p className="font-semibold">{t("engagement.connected")}</p><p className="mt-1">{t("engagement.connectedDesc")}</p></div> : <><p className="text-sm leading-6 text-slate-600">{t("engagement.notConnectedIntro")}</p><Button className="w-full" onClick={() => createLink.mutate()} disabled={createLink.isPending}><KeyRound className="h-4 w-4" />{t("engagement.createLinkCode")}</Button>{linkCode ? <div className="rounded-xl border border-dashed border-indigo-300 bg-white p-3 text-sm"><p className="text-slate-600">{t("engagement.sendToBot")}</p><code dir="ltr" className="mt-2 block rounded-lg bg-slate-950 px-3 py-2 text-center text-xs text-white">/start {linkCode.code}</code><p className="mt-2 text-xs text-slate-500">{t("engagement.validUntil", { time: linkCode.expiresAt.toLocaleTimeString(locale) })}</p></div> : null}</>}</CardContent></Card>

    <Card className="border-amber-200 bg-amber-50/40 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BellRing className="h-5 w-5 text-amber-600" />{t("engagement.alertsTitle")}</CardTitle><CardDescription>{t("engagement.alertsDesc")}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-xl bg-white p-3 text-sm text-slate-700"><p>{t("engagement.statusLabel")} <strong>{data?.alertEnabled ? t("engagement.statusActive") : t("engagement.statusInactive")}</strong></p><p className="mt-1">{t("engagement.currentThreshold", { value: percentFromBps(data?.thresholdBps) })}</p></div><label className="block text-sm font-medium text-slate-700">{t("engagement.newThreshold")}<Input className="mt-2" inputMode="decimal" value={thresholdPercent} onChange={event => setThresholdPercent(event.target.value)} placeholder={t("engagement.thresholdPlaceholder")} /></label><Button className="w-full" variant="outline" disabled={!recipient.data?.connected || !data?.enabled || enableAlerts.isPending} onClick={enableAlert}><BellRing className="h-4 w-4" />{t("engagement.enableDailyAlerts")}</Button>{!recipient.data?.connected ? <p className="text-xs leading-5 text-amber-900">{t("engagement.connectFirst")}</p> : !data?.enabled ? <p className="text-xs leading-5 text-amber-900">{t("engagement.enableReactionsFirst")}</p> : null}</CardContent></Card>

    <Card className="border-rose-200 bg-rose-50/40 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Medal className="h-5 w-5 text-rose-600" />{t("engagement.leaderboardTitle")}</CardTitle><CardDescription>{t("engagement.leaderboardDesc")}</CardDescription></CardHeader><CardContent className="space-y-2">{data?.leaderboard?.length ? data.leaderboard.map((post, index) => <div key={post.id} className="flex items-center justify-between gap-3 rounded-xl border border-rose-100 bg-white px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{index + 1}. {post.title}</p><p className="mt-1 text-xs text-slate-500">{t("engagement.reactionsUnit", { count: post.reactionCount })} · {t("engagement.rateLabel", { value: percentFromBps(post.engagementRateBps) })}</p></div><Badge className="shrink-0 bg-rose-600">{post.reactionCount}</Badge></div>) : <div className="rounded-xl border border-dashed border-rose-200 p-4 text-sm leading-6 text-slate-500">{t("engagement.noLeaderboard")}</div>}<div className="flex items-center gap-2 pt-2 text-xs text-slate-500"><UsersRound className="h-3.5 w-3.5" />{t("engagement.audienceSize", { value: data?.audienceSize?.toLocaleString(locale) ?? t("engagement.audienceNotMeasured") })}</div></CardContent></Card>
    <ManualLatestReportDelivery />
    <SourcePerformanceComparison />
    <SourceAlertSettings />
  </div>;
}
