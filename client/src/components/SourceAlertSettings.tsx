import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { BellRing, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function SourceAlertSettings() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const analytics = trpc.publisher.analytics.useQuery();
  const configs = trpc.publisher.sourceAlertConfigs.useQuery();
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; threshold: string }>>({});
  const configBySource = new Map((configs.data ?? []).map(config => [config.sourceName, config]));
  const save = trpc.publisher.upsertSourceAlertConfig.useMutation({ onSuccess: () => { toast.success(t("sourceAlerts.toastSaved")); utils.publisher.sourceAlertConfigs.invalidate(); }, onError: error => toast.error(error.message) });
  const getDraft = (sourceName: string) => drafts[sourceName] ?? { enabled: configBySource.get(sourceName)?.isEnabled ?? false, threshold: String((configBySource.get(sourceName)?.lowEngagementRateBps ?? 25) / 100) };
  const updateDraft = (sourceName: string, update: Partial<{ enabled: boolean; threshold: string }>) => setDrafts(current => ({ ...current, [sourceName]: { ...getDraft(sourceName), ...update } }));
  const persist = (sourceName: string) => {
    const draft = getDraft(sourceName);
    const thresholdBps = Math.round(Number(draft.threshold) * 100);
    if (!Number.isFinite(thresholdBps) || thresholdBps < 1 || thresholdBps > 5000) return toast.error(t("engagement.thresholdError"));
    save.mutate({ sourceName, isEnabled: draft.enabled, lowEngagementRateBps: thresholdBps });
  };
  const sources = analytics.data?.engagement.sourceComparison ?? [];
  const systemReady = Boolean(analytics.data?.engagement.alertEnabled && analytics.data?.engagement.enabled);
  const percentFromBps = (value: number | null) => value === null ? "—" : `${(value / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;

  return <Card className="xl:col-span-2 border-amber-200 bg-amber-50/40 shadow-sm" dir={dir}><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BellRing className="h-5 w-5 text-amber-600" />{t("sourceAlerts.title")}</CardTitle><CardDescription>{t("sourceAlerts.desc")}</CardDescription></CardHeader><CardContent className="space-y-4">{!systemReady ? <div className="rounded-xl border border-amber-200 bg-white p-3 text-sm leading-6 text-amber-950">{t("sourceAlerts.notReady")}</div> : null}{sources.length ? <div className="space-y-3">{sources.map(source => { const draft = getDraft(source.sourceName); return <div key={source.sourceName} className="grid gap-3 rounded-xl border border-amber-100 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_130px_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{source.sourceName}</p><p className="mt-1 text-xs text-slate-500">{t("sourceAlerts.currentRate", { value: source.averageEngagementRateBps === null ? "—" : percentFromBps(source.averageEngagementRateBps) })} · {t("sourceAlerts.postsUnit", { count: source.deliveredPosts.toLocaleString(locale) })}</p></div><label className="text-xs font-medium text-slate-600">{t("sourceAlerts.thresholdLabel")}<Input className="mt-1 h-9" inputMode="decimal" value={draft.threshold} onChange={event => updateDraft(source.sourceName, { threshold: event.target.value })} /></label><label className="flex items-center justify-between gap-2 text-sm text-slate-700 sm:justify-start"><Switch checked={draft.enabled} onCheckedChange={enabled => updateDraft(source.sourceName, { enabled })} />{t("sourceAlerts.enabledLabel")}</label><Button size="sm" variant="outline" disabled={save.isPending} onClick={() => persist(source.sourceName)}><Save className="h-3.5 w-3.5" />{t("sourceAlerts.saveBtn")}</Button></div>; })}</div> : <div className="rounded-xl border border-dashed border-amber-200 p-5 text-sm leading-6 text-slate-500">{t("sourceAlerts.emptyState")}</div>}</CardContent></Card>;
}
