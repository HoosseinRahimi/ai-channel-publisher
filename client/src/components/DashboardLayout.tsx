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
} from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";
import { useI18n, LANGUAGES } from "@/i18n";
import {
  BarChart3,
  BookOpenText,
  Languages,
  LayoutDashboard,
  LogOut,
  Settings2,
  Sparkles,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
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
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-5 sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#8b5cf60a_1px,transparent_1px),linear-gradient(to_bottom,#8b5cf60a_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-violet-300/30 blur-3xl" />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 shadow-[0_30px_90px_rgba(76,29,149,0.16)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
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
          <div className="h-px bg-gradient-to-r from-violet-400/50 to-transparent" />
        </div>
        <form onSubmit={submit} className="p-7 sm:p-10" dir={dir}>
          <div className="mb-9 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-sm font-black text-white shadow-lg shadow-violet-500/25 lg:hidden">
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
                className="mt-2"
              />
            </label>
            <label
              className={`block text-sm font-semibold text-slate-700 ${dir === "rtl" ? "text-right" : "text-left"}`}
            >
              {t("login.password")}
              <Input
                value={password}
                onChange={event => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="mt-2"
              />
            </label>
          </div>
          {login.error ? (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {t("login.error")}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={login.isPending || password.length < 12}
            className="mt-7 w-full"
          >
            {login.isPending ? t("login.submitting") : t("login.submit")}
          </Button>
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
          className={compact ? "" : "w-full justify-start gap-2"}
        >
          <Languages className="h-4 w-4" />
          <span>
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
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (value: number) => void;
}) {
  const { user, logout } = useAuth();
  const { t, dir } = useI18n();
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
  ];
  const activeItem =
    menuItems.find(item => item.path === location) ?? menuItems[0];
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
  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          side={isRtl ? "right" : "left"}
          collapsible="icon"
          className={`${isRtl ? "border-l border-r-0" : "border-r border-l-0"} border-slate-200/70 bg-white/90 backdrop-blur-xl`}
        >
          <SidebarHeader className="h-24 justify-center px-3">
            <div className="flex w-full items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-sm font-black text-white shadow-lg shadow-violet-500/25 ring-1 ring-white/20">
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
                    onClick={() => setLocation(item.path)}
                    tooltip={item.label}
                    className={`relative h-12 rounded-2xl px-3 font-medium transition-all data-[active=true]:bg-violet-50 data-[active=true]:text-violet-800 data-[active=true]:shadow-[inset_0_0_0_1px_rgba(139,92,246,0.10)] ${isRtl ? "text-right" : "text-left"}`}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    <span>{item.label}</span>
                    {location === item.path ? (
                      <span
                        className={`absolute h-5 w-1 rounded-full bg-violet-600 ${isRtl ? "right-0" : "left-0"}`}
                      />
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-1">
              <LanguageSwitcher />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`mt-2 flex w-full items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-violet-50 ${isRtl ? "text-right" : "text-left"}`}
                >
                  <Avatar className="h-9 w-9 ring-2 ring-white shadow-sm">
                    <AvatarFallback className="bg-gradient-to-br from-violet-100 to-indigo-100 text-xs font-bold text-violet-700">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {user?.name || t("nav.admin")}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {t("nav.channelAdmin")}
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
          aria-label="Resize sidebar"
          className={`absolute top-0 z-20 h-full w-1 cursor-col-resize transition-colors hover:bg-violet-300/70 ${isRtl ? "left-0" : "right-0"}`}
          onMouseDown={() => setIsResizing(true)}
        />
      </div>
      <SidebarInset
        className={`min-w-0 bg-transparent ${isRtl ? "lg:mr-[var(--sidebar-width)]" : "lg:ml-[var(--sidebar-width)]"}`}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/75 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="h-9 w-9 rounded-xl border border-slate-200 bg-white shadow-sm lg:hidden" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {activeItem.label}
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  {appName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t("home.statReady")}
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] p-4 sm:p-7 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
