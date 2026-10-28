import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";
import { useI18n, LANGUAGES } from "@/i18n";
import { useRole } from "@/hooks/useRole";
import {
  BarChart3,
  BookOpenText,
  Eye,
  EyeOff,
  Languages,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const SIDEBAR_WIDTH_KEY = "publisher-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(
    () => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH
  );
  const { loading, user } = useAuth();
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <LocalLoginCard />;
  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent
        sidebarWidth={sidebarWidth}
        setSidebarWidth={setSidebarWidth}
      >
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function LocalLoginCard() {
  const utils = trpc.useUtils();
  const { t, dir } = useI18n();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      setPassword("");
      await utils.auth.me.invalidate();
    },
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-5 sm:p-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/40 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight">
              AI Channel Publisher
            </p>
            <p className="mt-3 max-w-sm text-sm leading-7 text-slate-300">
              {t("login.description")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            {t("login.secureNote")}
          </div>
        </div>
        <form onSubmit={submit} className="p-7 sm:p-10" dir={dir}>
          <div className="mb-9 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-sm font-black text-white lg:hidden">
              AI
            </div>
            <LanguageSwitcher compact />
          </div>
          <p className="text-2xl font-bold tracking-tight text-slate-950">
            {t("login.title")}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-500 lg:hidden">
            {t("login.description")}
          </p>
          <div className="mt-7 space-y-5">
            <label
              className={`block text-sm font-semibold text-slate-700 ${dir === "rtl" ? "text-right" : "text-left"}`}
            >
              {t("login.username")}
              <Input
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                dir="ltr"
                className="mt-2"
              />
            </label>
            <label
              className={`block text-sm font-semibold text-slate-700 ${dir === "rtl" ? "text-right" : "text-left"}`}
            >
              {t("login.password")}
              <div className="relative mt-2">
                <Input
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  aria-describedby="login-password-hint"
                  aria-invalid={Boolean(login.error)}
                  dir="ltr"
                  className="pe-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(current => !current)}
                  aria-label={
                    showPassword ? t("login.hidePassword") : t("login.showPassword")
                  }
                  className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-slate-400 transition-colors hover:text-slate-700 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <p
              id="login-password-hint"
              className="text-xs leading-5 text-slate-500"
            >
              {t("login.passwordHint")}
            </p>
          </div>
          {login.error ? (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {t("login.error")}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={login.isPending || password.length < 12}
            className="mt-7 w-full"
          >
            {login.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            {login.isPending ? t("login.submitting") : t("login.submit")}
          </Button>
          <p className="mt-5 flex items-center gap-2 text-xs leading-5 text-slate-500 lg:hidden">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            {t("login.secureNote")}
          </p>
        </form>
      </div>
    </div>
  );
}

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={compact ? "outline" : "ghost"}
          size={compact ? "sm" : "default"}
          className={
            compact
              ? ""
              : "w-full justify-start gap-2 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          }
        >
          <Languages className="h-4 w-4" />
          <span className={compact ? "" : "group-data-[collapsible=icon]:hidden"}>
            {compact
              ? LANGUAGES.find(language => language.code === lang)?.label
              : t("nav.language")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LANGUAGES.map(language => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => setLang(language.code)}
            className={language.code === lang ? "font-semibold" : ""}
          >
            {language.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DashboardLayoutContent({
  children,
  sidebarWidth,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  sidebarWidth: number;
  setSidebarWidth: (value: number) => void;
}) {
  const { user, logout } = useAuth();
  const { isOwner } = useRole();
  const { t, dir } = useI18n();
  const { isMobile, setOpenMobile } = useSidebar();
  const dashboard = trpc.publisher.dashboard.useQuery();
  const appName =
    dashboard.data?.settings?.appName?.trim() || "AI Channel Publisher";
  const brandInitials =
    appName
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join("") || "AI";
  const [location, setLocation] = useLocation();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isRtl = dir === "rtl";
  const menuItems = [
    { icon: LayoutDashboard, label: t("nav.dashboard"), path: "/" },
    { icon: BarChart3, label: t("nav.analytics"), path: "/analytics" },
    { icon: BookOpenText, label: t("nav.posts"), path: "/posts" },
    { icon: Settings2, label: t("nav.settings"), path: "/settings" },
    ...(isOwner
      ? [
          { icon: Users, label: t("nav.team"), path: "/team" },
          { icon: ScrollText, label: t("nav.audit"), path: "/audit" },
        ]
      : []),
  ];
  const activeItem =
    menuItems.find(item => item.path === location) ?? menuItems[0];
  const automationEnabled = Boolean(dashboard.data?.settings?.isEnabled);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const edge = isRtl
        ? (sidebarRef.current?.getBoundingClientRect().left ?? 0)
        : (sidebarRef.current?.getBoundingClientRect().right ?? 0);
      const width = isRtl ? event.clientX - edge : edge - event.clientX;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const up = () => setIsResizing(false);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [isResizing, setSidebarWidth, isRtl]);
  const resizeWithKeyboard = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const visualDirection = event.key === "ArrowRight" ? 1 : -1;
    const logicalDirection = isRtl ? -visualDirection : visualDirection;
    setSidebarWidth(
      Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, sidebarWidth + logicalDirection * 12)
      )
    );
  };
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side={isRtl ? "right" : "left"}
          collapsible="icon"
          className={`${isRtl ? "border-l border-r-0" : "border-r border-l-0"} border-slate-200 bg-white`}
        >
          <SidebarHeader className="h-24 justify-center px-3">
            <div className="flex w-full items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-sm font-black text-white shadow-sm">
                {brandInitials}
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-bold tracking-tight text-slate-950">
                  {appName}
                </p>
                <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  {t("nav.appSubtitle")}
                </p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2.5">
            <p
              className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 group-data-[collapsible=icon]:hidden ${isRtl ? "text-right" : "text-left"}`}
            >
              {t("nav.appSubtitle")}
            </p>
            <SidebarMenu className="gap-1.5">
              {menuItems.map(item => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={location === item.path}
                    aria-current={location === item.path ? "page" : undefined}
                    onClick={() => {
                      setLocation(item.path);
                      if (isMobile) setOpenMobile(false);
                    }}
                    tooltip={item.label}
                    className={`relative h-11 rounded-lg px-3 font-medium transition-colors data-[active=true]:bg-violet-50 data-[active=true]:text-violet-800 ${isRtl ? "text-right" : "text-left"}`}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    <span>{item.label}</span>
                    {location === item.path ? (
                      <span
                        aria-hidden="true"
                        className={`absolute h-5 w-1 rounded-full bg-violet-600 ${isRtl ? "right-0" : "left-0"}`}
                      />
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="border-t border-slate-200 pt-2">
              <LanguageSwitcher />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`mt-2 flex w-full items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-slate-100 ${isRtl ? "text-right" : "text-left"}`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-violet-100 text-xs font-bold text-violet-700">
                      {user?.name?.charAt(0).toUpperCase() ?? "A"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {user?.name || t("nav.admin")}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {user?.role ? t(`roles.${user.role}`) : t("nav.channelAdmin")}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={logout} className="text-rose-600">
                  <LogOut className="h-4 w-4" />
                  {t("nav.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <button
          aria-label={t("nav.resizeSidebar")}
          aria-orientation="vertical"
          aria-valuemax={MAX_WIDTH}
          aria-valuemin={MIN_WIDTH}
          aria-valuenow={sidebarWidth}
          aria-valuetext={t("nav.sidebarWidth", { width: sidebarWidth })}
          role="separator"
          className={`absolute top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-violet-300/70 focus-visible:bg-violet-400 focus-visible:outline-none ${isRtl ? "left-0" : "right-0"}`}
          onMouseDown={() => setIsResizing(true)}
          onKeyDown={resizeWithKeyboard}
        />
      </div>
      <SidebarInset
        className={`min-w-0 bg-transparent ${isRtl ? "lg:mr-[var(--sidebar-width)]" : "lg:ml-[var(--sidebar-width)]"}`}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger
                aria-label={t("nav.openMenu")}
                className="h-9 w-9 rounded-xl border border-slate-200 bg-white shadow-sm lg:hidden"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {activeItem.label}
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  {appName}
                </p>
              </div>
            </div>
            <Link
              href="/"
              title={t("home.scheduleTitle")}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none ${automationEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"}`}
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${automationEnabled ? "bg-emerald-500" : "bg-slate-400"}`}
              />
              {automationEnabled
                ? t("home.automationOn")
                : t("home.automationOff")}
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100vh-4rem)] p-4 focus:outline-none sm:p-7 lg:p-8"
        >
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
