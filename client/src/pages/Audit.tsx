import DashboardLayout from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
  RotateCw,
  ScrollText,
  SearchX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

type OutcomeFilter = "all" | "success" | "failure";

function formatDetail(detail: string) {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

export default function Audit() {
  const { t, dir, locale } = useI18n();
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [debouncedActor, setDebouncedActor] = useState("");
  const [debouncedAction, setDebouncedAction] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedActor(actor.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [actor]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedAction(action.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [action]);

  useEffect(() => {
    setPage(1);
    setExpandedRow(null);
  }, [debouncedActor, debouncedAction, outcome, from, to]);

  const filters = useMemo(
    () => ({
      actor: debouncedActor || undefined,
      action: debouncedAction || undefined,
      outcome: outcome === "all" ? undefined : outcome,
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedActor, debouncedAction, outcome, from, to, page]
  );
  const audit = trpc.admin.audit.useQuery(filters, {
    placeholderData: keepPreviousData,
  });
  const rows = audit.data?.rows ?? [];
  const total = audit.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const clearFilters = () => {
    setActor("");
    setAction("");
    setDebouncedActor("");
    setDebouncedAction("");
    setOutcome("all");
    setFrom("");
    setTo("");
  };
  const hasFilters = Boolean(
    actor || action || outcome !== "all" || from || to
  );
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const isRtl = dir === "rtl";
  const PreviousIcon = isRtl ? ChevronRight : ChevronLeft;
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <DashboardLayout>
      <div dir={dir} className="mx-auto max-w-7xl space-y-6 pb-10">
        <PageHeader
          eyebrow={t("audit.heroKicker")}
          title={t("audit.heroTitle")}
          description={t("audit.heroDesc")}
          icon={ScrollText}
        />

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{t("audit.filtersTitle")}</CardTitle>
            <CardDescription>{t("audit.filtersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">
                {t("audit.actor")}
                <Input
                  className="mt-1.5"
                  value={actor}
                  onChange={event => setActor(event.target.value)}
                  placeholder={t("audit.actorPlaceholder")}
                  autoComplete="off"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                {t("audit.action")}
                <Input
                  className="mt-1.5"
                  value={action}
                  onChange={event => setAction(event.target.value)}
                  placeholder={t("audit.actionPlaceholder")}
                  dir="ltr"
                  autoComplete="off"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                {t("audit.from")}
                <Input
                  className="mt-1.5"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={event => setFrom(event.target.value)}
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                {t("audit.to")}
                <Input
                  className="mt-1.5"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={event => setTo(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Tabs
                value={outcome}
                onValueChange={value => setOutcome(value as OutcomeFilter)}
              >
                <TabsList aria-label={t("audit.tabsLabel")}>
                  <TabsTrigger value="all">{t("audit.outcomeAll")}</TabsTrigger>
                  <TabsTrigger value="success">
                    {t("audit.outcomeSuccess")}
                  </TabsTrigger>
                  <TabsTrigger value="failure">
                    {t("audit.outcomeFailure")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant="ghost"
                size="sm"
                className="ms-auto"
                onClick={clearFilters}
                disabled={!hasFilters}
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                {t("audit.clear")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <History aria-hidden="true" className="h-5 w-5 text-violet-600" />
                  {t("audit.resultsTitle")}
                </CardTitle>
                <CardDescription aria-live="polite">
                  {t("audit.resultsCount", { count: total })}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => audit.refetch()}
                disabled={audit.isFetching}
              >
                <RotateCw
                  aria-hidden="true"
                  className={audit.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
                {t("audit.refresh")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {audit.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(item => (
                  <Skeleton className="h-14 w-full" key={item} />
                ))}
              </div>
            ) : null}

            {audit.isError ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
                <p className="text-sm font-medium text-rose-900">
                  {t("audit.loadError")}
                </p>
                <p className="text-xs text-rose-800/80">
                  {audit.error.message}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => audit.refetch()}
                >
                  <RotateCw aria-hidden="true" className="h-4 w-4" />
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}

            {!audit.isLoading && !audit.isError && rows.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <SearchX aria-hidden="true" className="h-5 w-5" />
                </span>
                <p className="max-w-sm text-sm text-slate-500">
                  {t("audit.empty")}
                </p>
              </div>
            ) : null}

            {rows.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("audit.columnTime")}</TableHead>
                      <TableHead>{t("audit.columnActor")}</TableHead>
                      <TableHead>{t("audit.columnAction")}</TableHead>
                      <TableHead>{t("audit.columnOutcome")}</TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t("audit.columnDetail")}
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        {t("audit.columnIp")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(row => {
                      const expanded = expandedRow === row.id;
                      return (
                        <TableRow key={row.id} className="align-top">
                          <TableCell className="whitespace-nowrap text-xs text-slate-600">
                            {new Date(row.createdAt).toLocaleString(locale)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            <span className="font-medium text-slate-900">
                              {row.actorName ?? "—"}
                            </span>
                            {row.actorRole ? (
                              <span className="ms-2 text-slate-500">
                                {t(`roles.${row.actorRole}`)}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <code
                              dir="ltr"
                              className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-800"
                            >
                              {row.action}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                row.outcome === "success"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              }
                            >
                              {row.outcome === "success"
                                ? t("audit.success")
                                : t("audit.failure")}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden max-w-[320px] md:table-cell">
                            {row.detail ? (
                              <div className="flex items-start gap-1.5">
                                <span
                                  className="block max-w-[260px] truncate text-xs text-slate-500"
                                  dir="ltr"
                                  title={row.detail}
                                >
                                  {row.detail}
                                </span>
                                <button
                                  type="button"
                                  aria-expanded={expanded}
                                  aria-label={
                                    expanded
                                      ? t("audit.collapseDetail")
                                      : t("audit.expandDetail")
                                  }
                                  onClick={() =>
                                    setExpandedRow(expanded ? null : row.id)
                                  }
                                  className="mt-0.5 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                                >
                                  <ChevronDown
                                    aria-hidden="true"
                                    className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                                  />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className="hidden text-xs text-slate-500 lg:table-cell"
                            dir="ltr"
                          >
                            {row.ipAddress ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {expandedRow !== null && rows.some(row => row.id === expandedRow && row.detail) ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("audit.columnDetail")}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedRow(null)}
                  >
                    {t("audit.collapseDetail")}
                  </Button>
                </div>
                <pre
                  dir="ltr"
                  className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-6 text-slate-700"
                >
                  {formatDetail(
                    rows.find(row => row.id === expandedRow)?.detail ?? ""
                  )}
                </pre>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {total > 0
                  ? t("audit.range", {
                      from: rangeStart,
                      to: rangeEnd,
                      total,
                    })
                  : t("audit.page", { page: 1, pages: 1 })}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {t("audit.page", {
                    page: Math.min(page, totalPages),
                    pages: totalPages,
                  })}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("audit.previous")}
                  disabled={page <= 1 || audit.isFetching}
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                >
                  <PreviousIcon aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("audit.next")}
                  disabled={page >= totalPages || audit.isFetching}
                  onClick={() =>
                    setPage(current => Math.min(totalPages, current + 1))
                  }
                >
                  <NextIcon aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
