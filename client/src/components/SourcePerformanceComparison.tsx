import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildSourcePerformanceCsv } from "@/lib/sourcePerformanceCsv";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { BarChart3, BookmarkPlus, CalendarRange, ChartNoAxesCombined, CircleGauge, Download, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function SourcePerformanceComparison() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const [sourceName, setSourceName] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [presetName, setPresetName] = useState("");
  const queryInput = useMemo(() => ({ sourceName: sourceName === "all" ? undefined : sourceName, from: from || undefined, to: to || undefined }), [sourceName, from, to]);
  const performance = trpc.publisher.sourcePerformance.useQuery(queryInput);
  const presets = trpc.publisher.analyticsPresets.useQuery();
  const savePreset = trpc.publisher.saveAnalyticsPreset.useMutation({ onSuccess: () => { toast.success(t("sourcePerf.toastPresetSaved")); setPresetName(""); utils.publisher.analyticsPresets.invalidate(); }, onError: error => toast.error(error.message) });
  const deletePreset = trpc.publisher.deleteAnalyticsPreset.useMutation({ onSuccess: () => { toast.success(t("sourcePerf.toastPresetDeleted")); utils.publisher.analyticsPresets.invalidate(); }, onError: error => toast.error(error.message) });
  const sources = performance.data?.sourceComparison ?? [];
  const dailyTrend = performance.data?.dailyTrend ?? [];
  const maximum = Math.max(...sources.map(source => source.totalReactions), 1);
  const percentFromBps = (value: number | null) => value === null ? "—" : `${(value / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const setPresetRange = (days: number | null) => {
    if (days === null) { setFrom(""); setTo(""); return; }
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - (days - 1));
    setFrom(isoDate(start));
    setTo(isoDate(end));
  };
  const resetFilters = () => { setSourceName("all"); setFrom(""); setTo(""); };
  const applySavedPreset = (preset: { sourceName: string | null; dateFrom: Date | null; dateTo: Date | null }) => {
    setSourceName(preset.sourceName ?? "all");
    setFrom(preset.dateFrom ? isoDate(preset.dateFrom) : "");
    setTo(preset.dateTo ? isoDate(preset.dateTo) : "");
  };
  const persistCurrentFilters = () => {
    if (!presetName.trim()) return toast.error(t("sourcePerf.presetMissingName"));
    savePreset.mutate({ name: presetName, ...queryInput });
  };
  const exportCsv = () => {
    const blob = new Blob([buildSourcePerformanceCsv(sources)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `source-performance-${sourceName === "all" ? "all-sources" : sourceName.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${from || "all-time"}-to-${to || "today"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <Card className="xl:col-span-2 border-violet-200 bg-violet-50/40 shadow-sm" dir={dir}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-violet-600" />{t("sourcePerf.title")}</CardTitle><CardDescription className="mt-2">{t("sourcePerf.desc")}</CardDescription></div><Button size="sm" onClick={exportCsv} disabled={!sources.length}><Download className="h-4 w-4" />{t("sourcePerf.downloadCsv")}</Button></div></CardHeader><CardContent className="space-y-5"><div className="rounded-xl border border-violet-100 bg-white p-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-medium text-slate-600">{t("sourcePerf.sourceLabel")}<Select value={sourceName} onValueChange={setSourceName}><SelectTrigger className="mt-1"><SelectValue placeholder={t("sourcePerf.allSources")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("sourcePerf.allSources")}</SelectItem>{(performance.data?.availableSources ?? []).map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}</SelectContent></Select></label><label className="text-xs font-medium text-slate-600">{t("sourcePerf.fromLabel")}<Input type="date" className="mt-1" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="text-xs font-medium text-slate-600">{t("sourcePerf.toLabel")}<Input type="date" className="mt-1" value={to} onChange={event => setTo(event.target.value)} /></label><div className="flex items-end"><Button className="w-full" variant="outline" onClick={resetFilters}><RotateCcw className="h-4 w-4" />{t("sourcePerf.resetFilters")}</Button></div></div><div className="mt-3 flex flex-wrap items-center gap-2"><span className="flex items-center gap-1 text-xs text-slate-500"><CalendarRange className="h-3.5 w-3.5" />{t("sourcePerf.quickRanges")}</span><Button size="sm" variant="outline" onClick={() => setPresetRange(7)}>{t("sourcePerf.days7")}</Button><Button size="sm" variant="outline" onClick={() => setPresetRange(30)}>{t("sourcePerf.days30")}</Button><Button size="sm" variant="outline" onClick={() => setPresetRange(null)}>{t("sourcePerf.allTime")}</Button></div></div><div className="rounded-xl border border-dashed border-violet-200 bg-white/75 p-3"><div className="flex flex-wrap items-end gap-2"><label className="min-w-48 flex-1 text-xs font-medium text-slate-600">{t("sourcePerf.savePresetLabel")}<Input className="mt-1" value={presetName} maxLength={80} placeholder={t("sourcePerf.presetPlaceholder")} onChange={event => setPresetName(event.target.value)} /></label><Button size="sm" disabled={savePreset.isPending} onClick={persistCurrentFilters}><BookmarkPlus className="h-4 w-4" />{t("sourcePerf.savePresetBtn")}</Button></div>{presets.data?.length ? <div className="mt-3 flex flex-wrap gap-2">{presets.data.map(preset => <div key={preset.id} className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 py-0.5 pe-1 ps-2 text-xs"><button type="button" className="max-w-40 truncate px-1 py-1 text-violet-900 hover:underline" onClick={() => applySavedPreset(preset)}>{preset.name}</button><button type="button" aria-label={t("sourcePerf.deletePresetAria", { name: preset.name })} className="rounded-full p-1 text-violet-500 hover:bg-violet-100 hover:text-rose-600" onClick={() => deletePreset.mutate({ id: preset.id })}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div> : <p className="mt-3 text-xs text-slate-500">{t("sourcePerf.presetsHint")}</p>}</div>{performance.isLoading ? <div className="rounded-xl border border-dashed border-violet-200 p-5 text-sm text-slate-500">{t("sourcePerf.loadingAnalysis")}</div> : performance.isError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{performance.error.message}</div> : sources.length ? <><p className="text-sm text-slate-600">{t("sourcePerf.postsInRange", { count: performance.data?.filteredPosts.toLocaleString(locale) ?? 0 })}</p><div className="rounded-xl border border-violet-100 bg-white p-4"><div className="mb-3 flex items-center gap-2"><ChartNoAxesCombined className="h-4.5 w-4.5 text-violet-600" /><div><p className="text-sm font-semibold text-slate-900">{t("sourcePerf.trendTitle")}</p><p className="text-xs text-slate-500">{t("sourcePerf.trendDesc")}</p></div></div>{dailyTrend.length ? <div className="h-56" dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={dailyTrend} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}><CartesianGrid strokeDasharray="3 3" stroke="#e9e5ff" /><XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={value => String(value).slice(5)} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} /><Tooltip formatter={(value: number) => [t("sourcePerf.reactionsUnit", { count: value.toLocaleString(locale) }), t("sourcePerf.reactionsSeries")]} labelFormatter={label => t("sourcePerf.dateLabel", { value: label })} /><Line type="monotone" dataKey="totalReactions" stroke="#7c3aed" strokeWidth={3} dot={{ r: 3, fill: "#7c3aed" }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <p className="py-8 text-center text-sm text-slate-500">{t("sourcePerf.noTrendData")}</p>}</div><div className="space-y-4">{sources.map((source, index) => <div key={source.sourceName} className="rounded-xl border border-violet-100 bg-white px-4 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{index + 1}. {source.sourceName}</p><p className="mt-1 text-xs text-slate-500">{t("sourcePerf.deliveredPostsUnit", { count: source.deliveredPosts.toLocaleString(locale) })} · {t("sourcePerf.trackedPostsUnit", { count: source.trackedPosts.toLocaleString(locale) })}</p></div><Badge className="shrink-0 bg-violet-600">{t("sourcePerf.reactionsUnit", { count: source.totalReactions.toLocaleString(locale) })}</Badge></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100"><div className={`h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500`} style={{ width: `${Math.max(4, Math.round((source.totalReactions / maximum) * 100))}%` }} /></div><div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><span>{t("sourcePerf.avgReactionsPerPost")} <strong className="text-slate-900">{(source.averageReactions ?? 0).toLocaleString(locale)}</strong></span><span className="flex items-center gap-1"><CircleGauge className="h-3.5 w-3.5 text-violet-500" />{t("sourcePerf.avgEngagementRate")} <strong className="text-slate-900">{percentFromBps(source.averageEngagementRateBps)}</strong></span></div></div>)}</div></> : <div className="rounded-xl border border-dashed border-violet-200 p-5 text-sm leading-6 text-slate-500">{t("sourcePerf.noDataForFilter")}</div>}</CardContent></Card>;
}
