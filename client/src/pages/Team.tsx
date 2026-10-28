import { useAuth } from "@/_core/hooks/useAuth";
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
import { ADMIN_ROLES, type AdminRole } from "@/hooks/useRole";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/i18n";
import { KeyRound, Save, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

const emptyAccount = {
  username: "",
  name: "",
  password: "",
  role: "editor" as AdminRole,
};

export default function Team() {
  const utils = trpc.useUtils();
  const { t, dir, locale } = useI18n();
  const { user } = useAuth();
  const accounts = trpc.admin.accounts.useQuery();
  const [form, setForm] = useState(emptyAccount);
  const [resetTarget, setResetTarget] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const create = trpc.admin.createAccount.useMutation({
    onSuccess: () => {
      toast.success(t("team.toastCreated"));
      setForm(emptyAccount);
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
      utils.admin.accounts.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const roleLabel = (role: string) =>
    ADMIN_ROLES.includes(role as AdminRole) ? t(`roles.${role}`) : role;

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
              <UserPlus className="h-5 w-5 text-violet-600" />
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
                <label className="text-sm font-medium text-slate-700">
                  {t("team.password")}
                  <Input
                    className="mt-1.5"
                    dir="ltr"
                    type="password"
                    value={form.password}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </label>
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
                <UserPlus className="h-4 w-4" />
                {t("team.createAction")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              {t("team.accountsTitle")}
            </CardTitle>
            <CardDescription>{t("team.accountsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(item => (
                  <Skeleton className="h-20 w-full" key={item} />
                ))}
              </div>
            ) : null}
            {!accounts.isLoading && accounts.data?.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                {t("team.empty")}
              </p>
            ) : null}
            {accounts.data?.map(account => {
              const locked = account.isEnvOwner;
              const isSelf = account.openId === user?.openId;
              const roleLocked = locked || isSelf;
              return (
                <article
                  className="rounded-xl border border-slate-200 bg-white p-4"
                  key={account.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">
                          {account.name || account.username || `#${account.id}`}
                        </p>
                        <Badge variant="secondary">
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
                          <Badge variant="outline">{t("team.you")}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500" dir="ltr">
                        {account.username ?? "—"} · {account.openId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {account.lastSignedIn
                          ? t("team.lastSignIn", {
                              time: new Date(account.lastSignedIn).toLocaleString(
                                locale
                              ),
                            })
                          : t("team.neverSignedIn")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={locked || isSelf || update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: account.id,
                            isActive: !account.isActive,
                          })
                        }
                      >
                        {account.isActive
                          ? t("team.disable")
                          : t("team.enable")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={locked}
                        onClick={() => {
                          setResetTarget(
                            resetTarget === account.id ? null : account.id
                          );
                          setResetPassword("");
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                        {t("team.resetPassword")}
                      </Button>
                    </div>
                  </div>
                  {resetTarget === account.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
                      <Input
                        dir="ltr"
                        type="password"
                        className="max-w-xs"
                        value={resetPassword}
                        onChange={event => setResetPassword(event.target.value)}
                        placeholder={t("team.passwordResetHint")}
                        autoComplete="new-password"
                      />
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
                        <Save className="h-4 w-4" />
                        {t("team.savePassword")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setResetTarget(null);
                          setResetPassword("");
                        }}
                      >
                        <X className="h-4 w-4" />
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {accounts.data?.some(account => account.isEnvOwner) ? (
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
