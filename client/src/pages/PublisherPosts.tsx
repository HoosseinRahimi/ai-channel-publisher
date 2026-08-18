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
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import {
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  FileText,
  LoaderCircle,
  PauseCircle,
  Send,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function PublisherPosts() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const dashboard = trpc.publisher.dashboard.useQuery();
  const [sourceName, setSourceName] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Record<number, string>>({});
  const historyInput = useMemo(
    () => ({
      sourceName: sourceName === "all" ? undefined : sourceName,
      from: from || undefined,
      to: to || undefined,
    }),
    [sourceName, from, to]
  );
  const history = trpc.publisher.history.useQuery(historyInput);
  const saveDraft = trpc.publisher.updateDraft.useMutation({
    onSuccess: () => {
      toast.success(t("posts.toastSaved"));
      utils.publisher.dashboard.invalidate();
      history.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const holdDraft = trpc.publisher.setDraftHeld.useMutation({
    onSuccess: () => {
      utils.publisher.dashboard.invalidate();
      history.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const discard = trpc.publisher.discardDraft.useMutation({
    onSuccess: () => {
      toast.info(t("posts.toastArchived"));
      utils.publisher.dashboard.invalidate();
      history.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const publish = trpc.publisher.publishDraft.useMutation({
    onSuccess: () => {
      toast.success(t("posts.toastPublished"));
      utils.publisher.dashboard.invalidate();
      history.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const posts = history.data ?? [];
  const reviewPosts = dashboard.data?.reviewPosts ?? [];
  const sources = dashboard.data?.sources ?? [];
  const channelHandle =
    dashboard.data?.settings?.channelHandle ?? "@your_channel";
  const statusConfig = {
    draft: {
      label: t("posts.statusDraft"),
      icon: FilePenLine,
      className: "bg-violet-500/15 text-violet-700 border-violet-500/20",
    },
    held: {
      label: t("posts.statusHeld"),
      icon: PauseCircle,
      className: "bg-amber-500/15 text-amber-800 border-amber-500/20",
    },
    pending: {
      label: t("posts.statusPending"),
      icon: LoaderCircle,
      className: "bg-sky-500/15 text-sky-700 border-sky-500/20",
    },
    delivered: {
      label: t("posts.statusDelivered"),
      icon: CheckCircle2,
      className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
    },
    failed: {
      label: t("posts.statusFailed"),
      icon: XCircle,
      className: "bg-rose-500/15 text-rose-700 border-rose-500/20",
    },
    skipped: {
      label: t("posts.statusSkipped"),
      icon: CircleAlert,
      className: "bg-slate-500/15 text-slate-700 border-slate-500/20",
    },
    discarded: {
      label: t("posts.statusDiscarded"),
      icon: CircleAlert,
      className: "bg-slate-500/15 text-slate-700 border-slate-500/20",
    },
  } as const;

  return (
    <DashboardLayout>
      <div dir={dir} className="mx-auto max-w-6xl space-y-6 pb-10">
        <PageHeader
          eyebrow={t("posts.heroKicker")}
          title={t("posts.heroTitle")}
          description={t("posts.heroDesc")}
          icon={FileText}
        />
        <Card className="border-violet-200 bg-violet-50/40 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FilePenLine className="h-5 w-5 text-violet-600" />
              {t("posts.pendingTitle")}
            </CardTitle>
            <CardDescription>{t("posts.pendingDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {dashboard.isLoading ? <Skeleton className="h-48 w-full" /> : null}
            {!dashboard.isLoading && reviewPosts.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-5 text-sm text-slate-600">
                {t("posts.noDrafts")}
              </p>
            ) : null}
            {reviewPosts.map(post => {
              const value = editing[post.id] ?? post.content;
              const held = post.deliveryStatus === "held";
              return (
                <article
                  className="rounded-2xl border border-violet-100 bg-white p-5"
                  key={post.id}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          held
                            ? "bg-amber-500/15 text-amber-800 border-amber-500/20"
                            : "bg-violet-500/15 text-violet-700 border-violet-500/20"
                        }
                      >
                        {held ? t("posts.badgeHeld") : t("posts.badgeReady")}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {post.scheduledFor
                          ? t("posts.autoPublishAt", {
                              time: new Date(post.scheduledFor).toLocaleString(
                                locale
                              ),
                            })
                          : t("posts.autoPublishNextCycle")}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {post.sourceName}
                    </span>
                  </div>
                  <Textarea
                    aria-label={`${t("posts.pendingTitle")} — ${post.sourceName}`}
                    value={value}
                    onChange={event =>
                      setEditing(current => ({
                        ...current,
                        [post.id]: event.target.value,
                      }))
                    }
                    className="min-h-72 resize-y font-sans leading-7"
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        saveDraft.mutate({ id: post.id, content: value })
                      }
                      disabled={saveDraft.isPending}
                    >
                      {t("posts.saveEdit")}
                    </Button>
                    <Button
                      variant={held ? "outline" : "secondary"}
                      onClick={() =>
                        holdDraft.mutate({ id: post.id, held: !held })
                      }
                      disabled={holdDraft.isPending}
                    >
                      {held ? t("posts.release") : t("posts.hold")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => discard.mutate({ id: post.id })}
                      disabled={discard.isPending}
                    >
                      {t("posts.archive")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button disabled={publish.isPending}>
                          <Send className="h-4 w-4" />
                          {t("posts.publishNow")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir={dir}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("posts.confirmPublishTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("posts.confirmPublishDesc", {
                              channel: channelHandle,
                            })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("common.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => publish.mutate({ id: post.id })}
                          >
                            {t("posts.publishAction")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </article>
              );
            })}
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("posts.filterTitle")}</CardTitle>
            <CardDescription>{t("posts.filterDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <NativeSelect
                aria-label={t("posts.allSources")}
                value={sourceName}
                onChange={event => setSourceName(event.target.value)}
              >
                <option value="all">{t("posts.allSources")}</option>
                {sources.map(source => (
                  <option key={source.id} value={source.name}>
                    {source.name}
                  </option>
                ))}
              </NativeSelect>
              <Input
                aria-label={t("sourcePerf.fromLabel")}
                type="date"
                value={from}
                onChange={event => setFrom(event.target.value)}
              />
              <Input
                aria-label={t("sourcePerf.toLabel")}
                type="date"
                value={to}
                onChange={event => setTo(event.target.value)}
              />
            </div>
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSourceName("all");
                  setFrom("");
                  setTo("");
                }}
              >
                {t("posts.clearFilters")}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("posts.resultsTitle")}</CardTitle>
            <CardDescription>
              {t("posts.resultsCount", { count: posts.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(item => (
                  <Skeleton className="h-28 w-full" key={item} />
                ))}
              </div>
            ) : null}
            {!history.isLoading && posts.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <Send className="mb-3 h-9 w-9 text-slate-400" />
                <p className="font-semibold text-slate-700">
                  {t("posts.noResults")}
                </p>
              </div>
            ) : null}
            {posts.length > 0 ? (
              <ScrollArea className="h-[650px] pe-4">
                <div className="space-y-4">
                  {posts.map(post => {
                    const config = statusConfig[post.deliveryStatus];
                    const Icon = config.icon;
                    return (
                      <article
                        className="rounded-xl border border-slate-200 bg-white p-5"
                        key={post.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={config.className}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {config.label}
                            </Badge>
                            <Badge variant="secondary">
                              {post.postKind === "source"
                                ? t("posts.kindSource")
                                : t("posts.kindExplainer")}
                            </Badge>
                            {post.isTest ? (
                              <Badge className="bg-violet-600">
                                {t("posts.testPost")}
                              </Badge>
                            ) : null}
                          </div>
                          <time className="text-xs text-slate-500">
                            {new Date(post.createdAt).toLocaleString(locale)}
                          </time>
                        </div>
                        <h2 className="mt-4 text-base font-bold text-slate-900">
                          {post.title}
                        </h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                          {post.content}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          <span>
                            {t("posts.sourceLabel", { name: post.sourceName })}
                          </span>
                          {post.sourceUrl ? (
                            <a
                              className="text-indigo-600 underline-offset-4 hover:underline"
                              href={post.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("posts.openSource")}
                            </a>
                          ) : null}
                          {post.errorMessage ? (
                            <span className="text-rose-600">
                              {t("posts.errorLabel", {
                                message: post.errorMessage,
                              })}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
