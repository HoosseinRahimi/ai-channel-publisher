import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
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
          <div className={`rounded-lg p-3 ${color}`}>
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
        <PageHeader
          eyebrow={t("home.heroKicker")}
          title={t("home.heroTitle")}
          description={t("home.heroDescription", {
            language: outputLanguageName,
            channel: channelHandle,
          })}
          icon={Sparkles}
          aside={
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge
                variant="outline"
                className={
                  settings?.isEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${settings?.isEnabled ? "bg-emerald-500" : "bg-amber-500"}`}
                />
                {settings?.isEnabled
                  ? t("home.automationOn")
                  : t("home.automationOff")}
              </Badge>
              <Badge variant="secondary">
                {t("common.model")}: {data?.llm?.model ?? "—"}
              </Badge>
            </div>
          }
        />

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
                <Button asChild variant="ghost">
                  <a href="/posts">{t("home.reviewDrafts")}</a>
                </Button>
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
