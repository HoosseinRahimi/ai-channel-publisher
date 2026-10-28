import { useAuth } from "@/_core/hooks/useAuth";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { ADMIN_ROLES, type AdminRole } from "@/hooks/useRole";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RotateCw,
  Save,
  Search,
  SearchX,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

const emptyAccount = {
  username: "",
  name: "",
  password: "",
  role: "editor" as AdminRole,
};

const roleBadgeClass: Record<AdminRole, string> = {
  owner: "border-violet-200 bg-violet-50 text-violet-700",
  editor: "border-indigo-200 bg-indigo-50 text-indigo-700",
  viewer: "border-slate-200 bg-slate-50 text-slate-600",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export default function Team() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const { user } = useAuth();
  const accounts = trpc.admin.accounts.useQuery();
  const [form, setForm] = useState(emptyAccount);
  const [search, setSearch] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [resetTarget, setResetTarget] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  const create = trpc.admin.createAccount.useMutation({
    onSuccess: () => {
      toast.success(t("team.toastCreated"));
      setForm(emptyAccount);
      setShowCreatePassword(false);
      utils.admin.accounts.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.admin.updateAccount.useMutation({
    onSuccess: (_result, variables) => {
      toast.success(
        variables.password ? t("team.toastPasswordReset") : t("team.toastUpdated")
      );
      setResetTarget(null);
      setResetPassword("");
      setShowResetPassword(false);
      utils.admin.accounts.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const roleLabel = (role: string) =>
    ADMIN_ROLES.includes(role as AdminRole) ? t(`roles.${role}`) : role;

  const rows = accounts.data ?? [];
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return rows;
    return rows.filter(account =>
      [account.name, account.username, account.openId, account.role]
        .filter((value): value is string => Boolean(value))
        .some(value => value.toLowerCase().includes(query))
    );
  }, [rows, query]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter(account => account.isActive).length,
      owner: rows.filter(account => account.role === "owner").length,
      editor: rows.filter(account => account.role === "editor").length,
      viewer: rows.filter(account => account.role === "viewer").length,
    }),
    [rows]
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({
      username: form.username.trim(),
      name: form.name.trim(),
      password: form.password,
      role: form.role,
    });
  };

  return (
    <DashboardLayout>
      <div dir={dir} className="mx-auto max-w-6xl space-y-6 pb-10">
        <PageHeader
          eyebrow={t("team.heroKicker")}
          title={t("team.heroTitle")}
          description={t("team.heroDesc")}
          icon={Users}
        />

        <Card className="border-violet-200 bg-violet-50/40 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-violet-600" aria-hidden="true" />
              {t("team.createTitle")}
            </CardTitle>
            <CardDescription>{t("team.createDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  {t("team.username")}
                  <Input
                    className="mt-1.5"
                    dir="ltr"
                    value={form.username}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  {t("team.displayName")}
                  <Input
                    className="mt-1.5"
                    value={form.name}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    autoComplete="off"
                    required
                  />
                </label>
                <div className="text-sm font-medium text-slate-700">
                  <label htmlFor="team-new-password">{t("team.password")}</label>
                  <div className="relative mt-1.5">
                    <Input
                      id="team-new-password"
                      dir="ltr"
                      type={showCreatePassword ? "text" : "password"}
                      className="pe-11"
                      value={form.password}
                      onChange={event =>
                        setForm(current => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      autoComplete="new-password"
                      minLength={12}
                      placeholder={t("team.passwordResetHint")}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute end-1 top-1/2 -translate-y-1/2 text-slate-500"
                      aria-label={
                        showCreatePassword
                          ? t("team.hidePassword")
                          : t("team.showPassword")
                      }
                      onClick={() => setShowCreatePassword(value => !value)}
                    >
                      {showCreatePassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  {t("team.role")}
                  <NativeSelect
                    className="mt-1.5"
                    value={form.role}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        role: event.target.value as AdminRole,
                      }))
                    }
                  >
                    {ADMIN_ROLES.map(role => (
                      <option key={role} value={role}>
                        {t(`roles.${role}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </div>
              <Button
                type="submit"
                disabled={
                  create.isPending ||
                  form.password.length < 12 ||
                  !form.username.trim() ||
                  form.name.trim().length < 2
                }
              >
                {create.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                {t("team.createAction")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck
                  className="h-5 w-5 text-violet-600"
                  aria-hidden="true"
                />
                {t("team.accountsTitle")}
              </CardTitle>
              <CardDescription className="mt-1.5">
                {t("team.accountsDesc")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-slate-200 bg-slate-50">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t("team.activeBadge")} {counts.active}/{counts.total}
              </Badge>
              {(["owner", "editor", "viewer"] as const).map(role => (
                <Badge
                  key={role}
                  variant="outline"
                  className={roleBadgeClass[role]}
                >
                  {roleLabel(role)} {counts[role]}
                </Badge>
              ))}
            </div>
            <div className="relative w-full sm:max-w-sm">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                className="ps-9 pe-9"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t("team.searchPlaceholder")}
                aria-label={t("team.searchPlaceholder")}
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute end-1 top-1/2 -translate-y-1/2 text-slate-500"
                  aria-label={t("team.clearSearch")}
                  onClick={() => setSearch("")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(item => (
                  <Skeleton className="h-24 w-full" key={item} />
                ))}
              </div>
            ) : null}

            {accounts.isError ? (
              <div
                role="alert"
                className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{t("team.loadError")}</p>
                  <p className="mt-0.5 text-xs text-rose-700/80">
                    {accounts.error.message}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                  disabled={accounts.isFetching}
                  onClick={() => accounts.refetch()}
                >
                  <RotateCw
                    className={`h-4 w-4 ${accounts.isFetching ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  {t("common.retry")}
                </Button>
              </div>
            ) : null}

            {!accounts.isLoading &&
            !accounts.isError &&
            rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                {t("team.empty")}
              </p>
            ) : null}

            {!accounts.isLoading &&
            !accounts.isError &&
            rows.length > 0 &&
            filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <SearchX
                  className="h-8 w-8 text-slate-300"
                  aria-hidden="true"
                />
                <p className="text-sm text-slate-500">{t("team.noResults")}</p>
                <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                  {t("team.clearSearch")}
                </Button>
              </div>
            ) : null}

            {!accounts.isLoading && !accounts.isError
              ? filtered.map(account => {
                  const locked = account.isEnvOwner;
                  const isSelf = account.openId === user?.openId;
                  const roleLocked = locked || isSelf;
                  const rowBusy =
                    update.isPending && update.variables?.id === account.id;
                  const displayName =
                    account.name || account.username || `#${account.id}`;
                  return (
                    <article
                      className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                      key={account.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <Avatar className="mt-0.5 size-10 bg-violet-100 text-violet-700">
                            <AvatarFallback className="bg-violet-100 text-sm font-semibold text-violet-700">
                              {initials(displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-slate-900">
                                {displayName}
                              </p>
                              <Badge
                                variant="outline"
                                className={roleBadgeClass[account.role as AdminRole] ?? roleBadgeClass.viewer}
                              >
                                {roleLabel(account.role)}
                              </Badge>
                              {locked ? (
                                <Badge className="bg-violet-600">
                                  {t("team.envOwnerBadge")}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={
                                    account.isActive
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border-slate-200 bg-slate-50 text-slate-500"
                                  }
                                >
                                  {account.isActive
                                    ? t("team.activeBadge")
                                    : t("team.inactiveBadge")}
                                </Badge>
                              )}
                              {isSelf ? (
                                <Badge variant="outline" className="border-violet-200 text-violet-700">
                                  {t("team.you")}
                                </Badge>
                              ) : null}
                            </div>
                            <p
                              className="mt-1 truncate text-xs text-slate-500"
                              dir="ltr"
                            >
                              {account.username ?? "—"} · {account.openId}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>
                                {account.lastSignedIn
                                  ? t("team.lastSignIn", {
                                      time: new Date(
                                        account.lastSignedIn
                                      ).toLocaleString(locale),
                                    })
                                  : t("team.neverSignedIn")}
                              </span>
                              <span>
                                {t("team.joined", {
                                  time: new Date(
                                    account.createdAt
                                  ).toLocaleDateString(locale, {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  }),
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          {rowBusy ? (
                            <LoaderCircle
                              className="h-4 w-4 animate-spin text-violet-600"
                              aria-label={t("common.loading")}
                            />
                          ) : null}
                          <NativeSelect
                            aria-label={t("team.role")}
                            value={account.role}
                            disabled={roleLocked || update.isPending}
                            onChange={event =>
                              update.mutate({
                                id: account.id,
                                role: event.target.value as AdminRole,
                              })
                            }
                          >
                            {ADMIN_ROLES.map(role => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </NativeSelect>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className={
                                  account.isActive
                                    ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                }
                                disabled={locked || isSelf || update.isPending}
                              >
                                {account.isActive ? (
                                  <UserX className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <UserCheck
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                )}
                                {account.isActive
                                  ? t("team.disable")
                                  : t("team.enable")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir={dir}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {account.isActive
                                    ? t("team.deactivateTitle")
                                    : t("team.activateTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {(account.isActive
                                    ? t("team.deactivateDesc")
                                    : t("team.activateDesc")
                                  ).replace("{name}", displayName)}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {t("common.cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    update.mutate({
                                      id: account.id,
                                      isActive: !account.isActive,
                                    })
                                  }
                                >
                                  {account.isActive
                                    ? t("team.deactivateAction")
                                    : t("team.activateAction")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={locked}
                            aria-expanded={resetTarget === account.id}
                            onClick={() => {
                              setResetTarget(
                                resetTarget === account.id ? null : account.id
                              );
                              setResetPassword("");
                              setShowResetPassword(false);
                            }}
                          >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                            {t("team.resetPassword")}
                          </Button>
                        </div>
                      </div>
                      {resetTarget === account.id ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center">
                          <div className="relative w-full sm:max-w-xs">
                            <Input
                              dir="ltr"
                              type={showResetPassword ? "text" : "password"}
                              className="pe-11"
                              value={resetPassword}
                              onChange={event =>
                                setResetPassword(event.target.value)
                              }
                              placeholder={t("team.passwordResetHint")}
                              autoComplete="new-password"
                              minLength={12}
                              aria-label={t("team.savePassword")}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="absolute end-1 top-1/2 -translate-y-1/2 text-slate-500"
                              aria-label={
                                showResetPassword
                                  ? t("team.hidePassword")
                                  : t("team.showPassword")
                              }
                              onClick={() =>
                                setShowResetPassword(value => !value)
                              }
                            >
                              {showResetPassword ? (
                                <EyeOff
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              )}
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              disabled={
                                resetPassword.length < 12 || update.isPending
                              }
                              onClick={() =>
                                update.mutate({
                                  id: account.id,
                                  password: resetPassword,
                                })
                              }
                            >
                              <Save className="h-4 w-4" aria-hidden="true" />
                              {t("team.savePassword")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setResetTarget(null);
                                setResetPassword("");
                                setShowResetPassword(false);
                              }}
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                              {t("common.cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              : null}

            {rows.some(account => account.isEnvOwner) ? (
              <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">
                {t("team.protectedHint")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
