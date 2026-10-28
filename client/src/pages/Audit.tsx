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
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { keepPreviousData } from "@tanstack/react-query";
import { History, RotateCcw, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

export default function Audit() {
  const { t, dir, locale } = useI18n();
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [outcome, setOutcome] = useState<"all" | "success" | "failure">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [actor, action, outcome, from, to]);

  const filters = useMemo(
    () => ({
      actor: actor.trim() || undefined,
      action: action.trim() || undefined,
      outcome: outcome === "all" ? undefined : outcome,
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [actor, action, outcome, from, to, page]
  );
  const audit = trpc.admin.audit.useQuery(filters, {
    placeholderData: keepPreviousData,
  });
  const rows = audit.data?.rows ?? [];
  const total = audit.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => {
    setActor("");
    setAction("");
    setOutcome("all");
    setFrom("");
    setTo("");
  };

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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input
                aria-label={t("audit.actor")}
                value={actor}
                onChange={event => setActor(event.target.value)}
                placeholder={t("audit.actorPlaceholder")}
              />
              <Input
                aria-label={t("audit.action")}
                value={action}
                onChange={event => setAction(event.target.value)}
                placeholder={t("audit.actionPlaceholder")}
                dir="ltr"
              />
              <NativeSelect
                aria-label={t("audit.outcome")}
                value={outcome}
                onChange={event =>
                  setOutcome(event.target.value as typeof outcome)
                }
              >
                <option value="all">{t("audit.outcomeAll")}</option>
                <option value="success">{t("audit.outcomeSuccess")}</option>
                <option value="failure">{t("audit.outcomeFailure")}</option>
              </NativeSelect>
              <Input
                aria-label={t("audit.from")}
                type="date"
                value={from}
                onChange={event => setFrom(event.target.value)}
              />
              <Input
                aria-label={t("audit.to")}
                type="date"
                value={to}
                onChange={event => setTo(event.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={clearFilters}
            >
              <RotateCcw className="h-4 w-4" />
              {t("audit.clear")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-violet-600" />
              {t("audit.resultsTitle")}
            </CardTitle>
            <CardDescription>
              {t("audit.resultsCount", { count: total })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {audit.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(item => (
                  <Skeleton className="h-14 w-full" key={item} />
                ))}
              </div>
            ) : null}
            {!audit.isLoading && rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                {t("audit.empty")}
              </p>
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
                      <TableHead>{t("audit.columnDetail")}</TableHead>
                      <TableHead>{t("audit.columnIp")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(row => (
                      <TableRow key={row.id}>
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
                          <code dir="ltr" className="text-xs text-violet-800">
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
                        <TableCell className="max-w-[280px]">
                          <span
                            className="block truncate text-xs text-slate-500"
                            dir="ltr"
                            title={row.detail ?? undefined}
                          >
                            {row.detail ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500" dir="ltr">
                          {row.ipAddress ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {t("audit.page", {
                  page: Math.min(page, totalPages),
                  pages: totalPages,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || audit.isFetching}
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                >
                  {t("audit.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || audit.isFetching}
                  onClick={() =>
                    setPage(current => Math.min(totalPages, current + 1))
                  }
                >
                  {t("audit.next")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
