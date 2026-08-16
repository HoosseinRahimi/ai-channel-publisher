import DashboardLayout from "@/components/DashboardLayout";
import InstructionStudio from "@/components/InstructionStudio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { POST_LANGUAGE_OPTIONS } from "@/lib/postLanguages";
import { CheckCircle2, Cpu, ExternalLink, KeyRound, Languages, LockKeyhole, MessageSquareText, Pencil, Plus, Power, RadioTower, Save, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type SourceForm = { name: string; homepage: string; feedUrl: string; sourceKind: "primary" | "third_party"; isActive: boolean };
const emptySource: SourceForm = { name: "", homepage: "", feedUrl: "", sourceKind: "primary", isActive: true };

function GeneralSettingsCard() {
  const utils = trpc.useUtils();
  const { t } = useI18n();
  const dashboard = trpc.publisher.dashboard.useQuery();
  const settings = dashboard.data?.settings;
  const [form, setForm] = useState<{ channelHandle: string; appName: string; postSignature: string; postLanguage: "fa" | "en" | "de" | "custom" } | null>(null);
  useEffect(() => {
    if (settings && !form) {
      const language = POST_LANGUAGE_OPTIONS.some(option => option.value === settings.postLanguage) ? settings.postLanguage as "fa" | "en" | "de" | "custom" : "fa";
      setForm({ channelHandle: settings.channelHandle, appName: settings.appName ?? "", postSignature: settings.postSignature ?? "", postLanguage: language });
    }
  }, [settings, form]);
  const save = trpc.publisher.updateGeneralSettings.useMutation({
    onSuccess: () => { toast.success(t("settings.toastGeneralSaved")); utils.publisher.dashboard.invalidate(); },
    onError: error => toast.error(error.message),
  });
  if (!form) return null;
  const updateLanguage = (value: string) => {
    const language = POST_LANGUAGE_OPTIONS.some(option => option.value === value) ? value as "fa" | "en" | "de" | "custom" : "fa";
    setForm(current => current ? { ...current, postLanguage: language } : current);
  };
  return <Card className="border-slate-200/80 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><RadioTower className="h-5 w-5 text-violet-600" />{t("settings.generalTitle")}</CardTitle><CardDescription>{t("settings.generalDesc")}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.channelHandleLabel")}</label><Input dir="ltr" value={form.channelHandle} onChange={event => setForm(current => current ? { ...current, channelHandle: event.target.value } : current)} placeholder={t("settings.channelHandlePlaceholder")} /><p className="mt-1.5 text-xs leading-5 text-slate-500">{t("settings.channelHandleHint")}</p></div><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.appNameLabel")}</label><Input value={form.appName} onChange={event => setForm(current => current ? { ...current, appName: event.target.value } : current)} placeholder={t("settings.appNamePlaceholder")} maxLength={80} /></div><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.postLanguageLabel")}</label><select value={form.postLanguage} onChange={event => updateLanguage(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">{POST_LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select><p className="mt-1.5 text-xs leading-5 text-slate-500">{t("settings.postLanguageHint")}</p></div><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.signatureLabel")}</label><Input dir="ltr" value={form.postSignature} onChange={event => setForm(current => current ? { ...current, postSignature: event.target.value } : current)} placeholder={t("settings.signaturePlaceholder")} maxLength={160} /><p className="mt-1.5 text-xs leading-5 text-slate-500">{t("settings.signatureHint")}</p></div></div><Button disabled={save.isPending} onClick={() => save.mutate({ channelHandle: form.channelHandle, appName: form.appName, postSignature: form.postSignature, postLanguage: form.postLanguage })}><Save className="h-4 w-4" />{t("settings.saveGeneral")}</Button></CardContent></Card>;
}

function LlmSettingsCard() {
  const utils = trpc.useUtils();
  const { t, dir } = useI18n();
  const llmStatus = trpc.publisher.llmStatus.useQuery();
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState(false);
  useEffect(() => {
    if (llmStatus.data && !loadedOnce) {
      setBaseUrl(llmStatus.data.baseUrl);
      setModel(llmStatus.data.model);
      setLoadedOnce(true);
    }
  }, [llmStatus.data, loadedOnce]);
  const save = trpc.publisher.updateLlmSettings.useMutation({
    onSuccess: () => {
      toast.success(t("settings.toastLlmSaved"));
      setApiKey("");
      utils.publisher.llmStatus.invalidate();
      utils.publisher.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const test = trpc.publisher.testLlm.useMutation({
    onSuccess: result => toast.success(t("settings.testOk", { model: result.model })),
    onError: error => toast.error(error.message),
  });
  const modelsQuery = trpc.publisher.listModels.useQuery(undefined, { enabled: false });
  const [loadingModels, setLoadingModels] = useState(false);
  const loadModels = async () => {
    setModelsError(false);
    setLoadingModels(true);
    const result = await modelsQuery.refetch();
    setLoadingModels(false);
    if (result.data) setModels(result.data);
    else setModelsError(true);
  };
  const status = llmStatus.data;
  return <Card className="border-slate-200/80 shadow-sm"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-lg"><Cpu className="h-5 w-5 text-violet-600" />{t("settings.llmTitle")}</CardTitle><CardDescription className="mt-2 max-w-2xl">{t("settings.llmDesc")}</CardDescription></div><Badge className={status?.effective.apiKeyConfigured ? "bg-emerald-600" : "bg-amber-500"}>{status?.effective.apiKeyConfigured ? t("settings.tokenConfigured") : t("settings.tokenNeeded")}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.baseUrlLabel")}</label><Input dir="ltr" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder={t("settings.baseUrlPlaceholder")} /><p className="mt-1.5 text-xs leading-5 text-slate-500">{t("settings.baseUrlHint")}</p></div><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.modelLabel")}</label><div className="flex gap-2">{models ? <select value={model} onChange={event => setModel(event.target.value)} className="h-10 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm" dir="ltr"><option value="" disabled>{t("settings.modelPlaceholder")}</option>{models.map(availableModel => <option key={availableModel} value={availableModel}>{availableModel}</option>)}</select> : <Input dir="ltr" value={model} onChange={event => setModel(event.target.value)} placeholder={t("settings.modelPlaceholder")} className="flex-1" />}<Button variant="outline" type="button" disabled={loadingModels} onClick={loadModels}>{loadingModels ? t("settings.testing") : t("settings.loadModels")}</Button></div>{modelsError ? <p className="mt-1.5 text-xs leading-5 text-amber-700">{t("settings.modelsUnavailable")}</p> : null}</div></div><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.apiKeyLabel")}</label><Input dir="ltr" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={status?.apiKeyConfigured && status.apiKeyLast4 ? t("settings.apiKeyConfiguredAs", { last4: status.apiKeyLast4 }) : t("settings.apiKeyPlaceholder")} autoComplete="off" /><div className="mt-1.5 flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><p>{t("settings.apiKeyHint")}</p></div></div>{status ? <p className="text-xs text-slate-500" dir={dir}>{t("settings.effectiveModel", { model: status.effective.model })} · {status.effective.modelSource === "settings" ? t("settings.fromSettings") : t("settings.fromEnv")}</p> : null}<div className="flex flex-wrap gap-3"><Button disabled={save.isPending} onClick={() => save.mutate({ baseUrl, model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) })}><Save className="h-4 w-4" />{t("settings.saveLlm")}</Button><Button variant="outline" disabled={test.isPending} onClick={() => test.mutate()}><ShieldCheck className="h-4 w-4" />{test.isPending ? t("settings.testing") : t("settings.testConnection")}</Button></div></CardContent></Card>;
}

export default function PublisherSettings() {
  const utils = trpc.useUtils();
  const { t, dir } = useI18n();
  const dashboard = trpc.publisher.dashboard.useQuery();
  const sources = dashboard.data?.sources ?? [];
  const settings = dashboard.data?.settings;
  const tokenConfigured = dashboard.data?.tokenConfigured ?? false;
  const [sourceForm, setSourceForm] = useState(emptySource);
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [editorialGuidance, setEditorialGuidance] = useState("");
  const [nextPostFeedback, setNextPostFeedback] = useState("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const refresh = () => { utils.publisher.dashboard.invalidate(); utils.publisher.history.invalidate(); };

  useEffect(() => {
    if (settings && !preferencesLoaded) {
      setEditorialGuidance(settings.editorialGuidance ?? "");
      setNextPostFeedback(settings.nextPostToneFeedback ?? "");
      setPreferencesLoaded(true);
    }
  }, [settings, preferencesLoaded]);

  const createSource = trpc.publisher.createSource.useMutation({ onSuccess: () => { toast.success(t("settings.toastSourceCreated")); setSourceForm(emptySource); refresh(); }, onError: error => toast.error(error.message) });
  const updateSource = trpc.publisher.updateSource.useMutation({ onSuccess: () => { toast.success(t("settings.toastSourceUpdated")); setSourceForm(emptySource); setEditingSourceId(null); refresh(); }, onError: error => toast.error(error.message) });
  const setActive = trpc.publisher.setSourceActive.useMutation({ onSuccess: (_result, variables) => { toast.success(variables.active ? t("settings.toastSourceActivated") : t("settings.toastSourceDeactivated")); refresh(); }, onError: error => toast.error(error.message) });
  const savePreferences = trpc.publisher.updateEditorialPreferences.useMutation({ onSuccess: () => { toast.success(t("settings.toastEditorialSaved")); refresh(); }, onError: error => toast.error(error.message) });
  const isSavingSource = createSource.isPending || updateSource.isPending;

  const submitSource = () => {
    const payload = { ...sourceForm, feedUrl: sourceForm.feedUrl.trim() || null };
    if (editingSourceId) updateSource.mutate({ id: editingSourceId, ...payload });
    else createSource.mutate(payload);
  };
  const startEditing = (source: typeof sources[number]) => {
    setEditingSourceId(source.id);
    setSourceForm({ name: source.name, homepage: source.homepage, feedUrl: source.feedUrl ?? "", sourceKind: source.sourceKind, isActive: source.isActive });
  };
  const cancelEditing = () => { setEditingSourceId(null); setSourceForm(emptySource); };
  const channelHandle = settings?.channelHandle ?? "@your_channel";
  const signature = settings?.postSignature?.trim() || `📢 ${channelHandle}`;

  return <DashboardLayout><div dir={dir} className="mx-auto max-w-6xl space-y-6 pb-10">
    <div className="rounded-3xl bg-gradient-to-l from-indigo-950 via-violet-950 to-slate-950 px-6 py-7 text-white shadow-xl shadow-violet-950/20 sm:px-8"><div className="flex items-start gap-4"><div className="rounded-2xl bg-white/10 p-3 text-violet-200"><ShieldCheck className="h-6 w-6" /></div><div><p className="text-sm text-violet-200">{t("settings.heroKicker")}</p><h1 className="mt-1 text-2xl font-bold tracking-tight">{t("settings.heroTitle")}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t("settings.heroDesc")}</p></div></div></div>

    <Card className="border-slate-200/80 shadow-sm"><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5 text-violet-600" />{t("settings.tokenTitle")}</CardTitle><CardDescription className="mt-2">{t("settings.tokenDesc")}</CardDescription></div><Badge className={tokenConfigured ? "bg-emerald-600" : "bg-amber-500"}>{tokenConfigured ? t("settings.tokenConfigured") : t("settings.tokenNeeded")}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><p>{t("settings.tokenHelp")}</p></div><Button variant="outline" onClick={() => toast.info(t("settings.tokenGuideToast"))}>{t("settings.tokenGuideBtn")}</Button></CardContent></Card>

    <GeneralSettingsCard />

    <LlmSettingsCard />

    <InstructionStudio />

    <div className="grid gap-6 lg:grid-cols-2"><Card className="border-violet-200 bg-violet-50/40 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MessageSquareText className="h-5 w-5 text-violet-600" />{t("settings.editorialTitle")}</CardTitle><CardDescription>{t("settings.editorialDesc")}</CardDescription></CardHeader><CardContent className="space-y-4"><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.standingGuidanceLabel")}</label><Textarea value={editorialGuidance} onChange={event => setEditorialGuidance(event.target.value)} maxLength={2000} className="min-h-28" placeholder={t("settings.standingGuidancePlaceholder")} /></div><div><label className="mb-2 block text-sm font-medium text-slate-800">{t("settings.nextPostFeedbackLabel")}</label><Textarea value={nextPostFeedback} onChange={event => setNextPostFeedback(event.target.value)} maxLength={2000} className="min-h-28" placeholder={t("settings.nextPostFeedbackPlaceholder")} /></div><Button className="w-full" disabled={savePreferences.isPending} onClick={() => savePreferences.mutate({ editorialGuidance, nextPostToneFeedback: nextPostFeedback })}><Save className="h-4 w-4" />{t("settings.saveEditorial")}</Button></CardContent></Card>
      <Card className="border-indigo-100 bg-indigo-50/50 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Languages className="h-5 w-5 text-violet-600" />{t("settings.rulesTitle")}</CardTitle><CardDescription>{t("settings.rulesDesc")}</CardDescription></CardHeader><CardContent className="text-sm leading-7 text-indigo-950"><p>{t("settings.rulesBody", { signature })}</p><Separator className="my-4 bg-indigo-100" /><p>{t("settings.rulesBody2")}</p></CardContent></Card></div>

    <Card className="border-slate-200/80 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><RadioTower className="h-5 w-5 text-violet-600" />{t("settings.sourcesTitle")}</CardTitle><CardDescription>{t("settings.sourcesDesc")}</CardDescription></CardHeader><CardContent className="space-y-5"><div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-5"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">{editingSourceId ? t("settings.editSource") : t("settings.addSource")}</h2>{editingSourceId ? <Button variant="ghost" size="sm" onClick={cancelEditing}><X className="h-4 w-4" />{t("settings.cancelEdit")}</Button> : null}</div><div className="grid gap-3 md:grid-cols-2"><Input value={sourceForm.name} onChange={event => setSourceForm(current => ({ ...current, name: event.target.value }))} placeholder={t("settings.sourceNamePlaceholder")} /><Input dir="ltr" value={sourceForm.homepage} onChange={event => setSourceForm(current => ({ ...current, homepage: event.target.value }))} placeholder={t("settings.homepagePlaceholder")} /><Input dir="ltr" value={sourceForm.feedUrl} onChange={event => setSourceForm(current => ({ ...current, feedUrl: event.target.value }))} placeholder={t("settings.feedPlaceholder")} /><select value={sourceForm.sourceKind} onChange={event => setSourceForm(current => ({ ...current, sourceKind: event.target.value as "primary" | "third_party" }))} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="primary">{t("settings.kindPrimary")}</option><option value="third_party">{t("settings.kindThirdParty")}</option></select></div><Button className="mt-4" disabled={isSavingSource} onClick={submitSource}>{editingSourceId ? <><Save className="h-4 w-4" />{t("settings.saveChanges")}</> : <><Plus className="h-4 w-4" />{t("settings.addSourceBtn")}</>}</Button></div><div className="space-y-2">{sources.map(source => <div className="flex flex-col gap-3 rounded-xl border border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" key={source.id}><div className="flex min-w-0 items-center gap-2"><CheckCircle2 className={source.isActive ? "h-4 w-4 shrink-0 text-emerald-600" : "h-4 w-4 shrink-0 text-slate-300"} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-800">{source.name}</span><Badge variant="secondary">{source.sourceKind === "primary" ? t("settings.kindPrimary") : t("settings.kindThirdParty")}</Badge>{!source.isActive ? <Badge variant="outline">{t("settings.sourceInactive")}</Badge> : null}</div><p className="mt-1 truncate text-xs text-slate-500" dir="ltr">{source.feedUrl ?? source.homepage}</p></div></div><div className="flex shrink-0 flex-wrap gap-2"><a href={source.homepage} target="_blank" rel="noreferrer"><Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button></a><Button variant="outline" size="sm" onClick={() => startEditing(source)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button><Button variant={source.isActive ? "outline" : "default"} size="sm" disabled={setActive.isPending} onClick={() => setActive.mutate({ id: source.id, active: !source.isActive })}><Power className="h-4 w-4" />{source.isActive ? t("common.deactivate") : t("common.activate")}</Button></div></div>)}</div></CardContent></Card>
  </div></DashboardLayout>;
}
