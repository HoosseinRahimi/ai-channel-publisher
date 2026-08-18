import DashboardLayout from "@/components/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { languageName } from "@/lib/postLanguages";
import {
  Bot,
  CalendarClock,
  CircleAlert,
  Clock3,
  ExternalLink,
  FilePenLine,
  Pause,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  tone = "indigo",
}: {
  label: string;
  value: string;
  icon: typeof Radio;
  detail: string;
  tone?: "indigo" | "emerald" | "amber";
}) {
  const color =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-700"
        : "bg-indigo-500/10 text-indigo-700";
  return (
    <Card className="border-slate-200/80 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-slate-950">
              {value}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">{detail}</p>
          </div>
          <div className={`rounded-2xl p-3 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const dashboard = trpc.publisher.dashboard.useQuery();
  const generateDraft = trpc.publisher.generateDraft.useMutation({
    onSuccess: () => {
      toast.success(t("home.toastDraftCreated"));
      utils.publisher.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const publishNow = trpc.publisher.publishNow.useMutation({
    onSuccess: () => {
      toast.success(t("home.toastPublished"));
      utils.publisher.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const enable = trpc.publisher.enableSchedule.useMutation({
    onSuccess: () => {
      toast.success(t("home.toastEnabled"));
      utils.publisher.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const pause = trpc.publisher.pauseSchedule.useMutation({
    onSuccess: () => {
      toast.info(t("home.toastPaused"));
      utils.publisher.dashboard.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const data = dashboard.data;
  const settings = data?.settings;
  const channelHandle = settings?.channelHandle ?? "@your_channel";
  const delivered =
    data?.posts.filter(post => post.deliveryStatus === "delivered").length ?? 0;
  const failed =
    data?.posts.filter(post => post.deliveryStatus === "failed").length ?? 0;
  const drafts = data?.reviewPosts.length ?? 0;
  const isBusy =
    generateDraft.isPending ||
    publishNow.isPending ||
    enable.isPending ||
    pause.isPending;
  const outputLanguageName = languageName(settings?.postLanguage ?? "fa");

  return (
    <DashboardLayout>
      <div dir={dir} className="mx-auto max-w-7xl space-y-6 pb-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(120deg,#0f172a_0%,#1e1b4b_55%,#312e81_100%)] px-6 py-8 text-white shadow-[0_24px_64px_rgba(30,27,75,0.22)] sm:px-9 sm:py-10">
          <div className="absolute -left-14 -top-16 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="absolute -bottom-20 right-1/3 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-300/15 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-100 backdrop-blur">
                <Sparkles className="h-4 w-4" />
                {t("home.heroKicker")}
              </div>
              <h1 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-[2.6rem]">
                {t("home.heroTitle")}
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-300 sm:text-base">
                {t("home.heroDescription", {
                  language: outputLanguageName,
                  channel: channelHandle,
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                className={`rounded-full px-3 py-1.5 ${settings?.isEnabled ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"}`}
              >
                {settings?.isEnabled
                  ? t("home.automationOn")
                  : t("home.automationOff")}
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-white/15 bg-white/5 px-3 py-1.5 text-slate-200 backdrop-blur"
              >
                {t("common.model")}: {data?.llm?.model ?? "—"}
              </Badge>
            </div>
          </div>
        </section>

        {dashboard.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(item => (
              <Skeleton className="h-36" key={item} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("home.statConnection")}
              value={
                data?.tokenConfigured
                  ? t("home.statReady")
                  : t("home.statNeedToken")
              }
              detail={
                data?.tokenConfigured
                  ? t("home.statReadyDetail")
                  : t("home.statNeedTokenDetail")
              }
              icon={ShieldCheck}
              tone={data?.tokenConfigured ? "emerald" : "amber"}
            />
            <StatCard
              label={t("home.statDelivered")}
              value={String(delivered)}
              detail={t("home.statDeliveredDetail")}
              icon={Send}
              tone="emerald"
            />
            <StatCard
              label={t("home.statPending")}
              value={String(drafts)}
              detail={t("home.statPendingDetail")}
              icon={FilePenLine}
              tone={drafts ? "amber" : "indigo"}
            />
            <StatCard
              label={t("home.statErrors")}
              value={String(failed)}
              detail={t("home.statErrorsDetail")}
              icon={CircleAlert}
              tone={failed ? "amber" : "emerald"}
            />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="h-5 w-5 text-violet-600" />
                {t("home.scheduleTitle")}
              </CardTitle>
              <CardDescription>{t("home.scheduleDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-white p-2.5 text-indigo-600 shadow-sm">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">
                      {t("home.everyThreeHours")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {t("home.reviewBefore")}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {settings?.nextRunAt
                    ? t("home.nextRunAt", {
                        time: new Date(settings.nextRunAt).toLocaleString(
                          locale
                        ),
                      })
                    : t("home.nextRunPending")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {settings?.isEnabled ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" disabled={isBusy}>
                        <Pause className="h-4 w-4" />
                        {t("home.pauseAutomation")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent dir={dir}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("home.pauseTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("home.pauseDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("common.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => pause.mutate()}>
                          {t("home.pauseAction")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={isBusy || !data?.tokenConfigured}>
                        <Play className="h-4 w-4" />
                        {t("home.enableAutomation")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent dir={dir}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("home.enableTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("home.enableDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("common.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => enable.mutate()}>
                          {t("home.enableAction")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <a href="/posts" className="inline-flex">
                  <Button variant="ghost">{t("home.reviewDrafts")}</Button>
                </a>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5 text-violet-600" />
                {t("home.manualTitle")}
              </CardTitle>
              <CardDescription>{t("home.manualDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
                <p className="font-semibold text-slate-900">
                  {t("home.yourControl")}
                </p>
                <ul className="mt-2 space-y-1">
                  <li>• {t("home.controlDraft")}</li>
                  <li>• {t("home.controlHold")}</li>
                  <li>• {t("home.controlPublish")}</li>
                </ul>
              </div>
              <Button
                variant="outline"
                className="w-full"
                disabled={isBusy || !data?.tokenConfigured}
                onClick={() => generateDraft.mutate()}
              >
                <FilePenLine className="h-4 w-4" />
                {t("home.generateDraft")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className="w-full"
                    disabled={isBusy || !data?.tokenConfigured}
                  >
                    <Radio className="h-4 w-4" />
                    {t("home.publishNowAction")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir={dir}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("home.publishNowTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("home.publishNowDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => publishNow.mutate()}>
                      {t("home.publishNowAction")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <a
                href="/posts"
                className="flex items-center justify-center gap-1 text-sm text-indigo-600 hover:underline"
              >
                {t("home.viewPosts")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
