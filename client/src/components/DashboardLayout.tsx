import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import { useI18n, LANGUAGES } from "@/i18n";
import { BarChart3, BookOpenText, Languages, LayoutDashboard, LogOut, PanelLeft, Settings2 } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const SIDEBAR_WIDTH_KEY = "publisher-sidebar-width";
const DEFAULT_WIDTH = 272;
const MIN_WIDTH = 220;
const MAX_WIDTH = 420;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || DEFAULT_WIDTH);
  const { loading, user } = useAuth();
  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth)); }, [sidebarWidth]);
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <LocalLoginCard />;
  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
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

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl shadow-slate-200/60" dir={dir}><div className="mb-5 flex justify-end"><LanguageSwitcher compact /></div><p className="text-xl font-bold text-slate-900">{t("login.title")}</p><p className="mt-3 text-sm leading-6 text-slate-500">{t("login.description")}</p><div className="mt-6 space-y-4"><label className={`block text-sm font-medium text-slate-700 ${dir === "rtl" ? "text-right" : "text-left"}`}>{t("login.username")}<Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" className="mt-2" /></label><label className={`block text-sm font-medium text-slate-700 ${dir === "rtl" ? "text-right" : "text-left"}`}>{t("login.password")}<Input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" className="mt-2" /></label></div>{login.error ? <p className="mt-4 text-sm text-rose-600">{t("login.error")}</p> : null}<Button type="submit" disabled={login.isPending || password.length < 12} className="mt-6 w-full">{login.isPending ? t("login.submitting") : t("login.submit")}</Button></form></div>;
}

function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant={compact ? "outline" : "ghost"} size={compact ? "sm" : "default"} className={compact ? "" : "w-full justify-start gap-2"}><Languages className="h-4 w-4" /><span>{compact ? LANGUAGES.find(language => language.code === lang)?.label : t("nav.language")}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{LANGUAGES.map(language => <DropdownMenuItem key={language.code} onClick={() => setLang(language.code)} className={language.code === lang ? "font-semibold" : ""}>{language.label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (value: number) => void }) {
  const { user, logout } = useAuth();
  const { t, dir } = useI18n();
  const dashboard = trpc.publisher.dashboard.useQuery();
  const appName = dashboard.data?.settings?.appName?.trim() || "AI Channel Publisher";
  const brandInitials = appName.split(/\s+/).slice(0, 2).map(word => word.charAt(0).toUpperCase()).join("") || "AI";
  const [location, setLocation] = useLocation();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isRtl = dir === "rtl";
  const menuItems = [
    { icon: LayoutDashboard, label: t("nav.dashboard"), path: "/" },
    { icon: BarChart3, label: t("nav.analytics"), path: "/analytics" },
    { icon: BookOpenText, label: t("nav.posts"), path: "/posts" },
    { icon: Settings2, label: t("nav.settings"), path: "/settings" },
  ];
  useEffect(() => { const move = (event: MouseEvent) => { if (!isResizing) return; const edge = isRtl ? sidebarRef.current?.getBoundingClientRect().left ?? 0 : sidebarRef.current?.getBoundingClientRect().right ?? 0; const width = isRtl ? event.clientX - edge : edge - event.clientX; if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width); }; const up = () => setIsResizing(false); document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }; }, [isResizing, setSidebarWidth, isRtl]);
  return <><div className="relative" ref={sidebarRef}><Sidebar side={isRtl ? "right" : "left"} collapsible="icon" className={`${isRtl ? "border-l border-r-0" : "border-r border-l-0"} border-slate-200 bg-white`}><SidebarHeader className="h-20 justify-center px-3"><div className="flex w-full items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-sm font-black text-white shadow-lg shadow-violet-500/25">{brandInitials}</div><div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-bold text-slate-900">{appName}</p><p className="mt-0.5 text-xs text-slate-500">{t("nav.appSubtitle")}</p></div></div></SidebarHeader><SidebarContent className="px-2"><SidebarMenu>{menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className={`h-11 rounded-xl ${isRtl ? "text-right" : "text-left"}`}><item.icon className="h-4.5 w-4.5" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent><SidebarFooter className="p-3"><LanguageSwitcher /><DropdownMenu><DropdownMenuTrigger asChild><button className={`mt-2 flex w-full items-center gap-3 rounded-xl p-2 hover:bg-slate-50 ${isRtl ? "text-right" : "text-left"}`}><Avatar className="h-9 w-9"><AvatarFallback className="bg-violet-100 text-xs text-violet-700">{user?.name?.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-medium">{user?.name || t("nav.admin")}</p><p className="truncate text-xs text-slate-500">{t("nav.channelAdmin")}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={logout} className="text-rose-600"><LogOut className="h-4 w-4" />{t("nav.logout")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter></Sidebar><button aria-label="Resize sidebar" className={`absolute top-0 h-full w-1 cursor-col-resize hover:bg-violet-200 ${isRtl ? "left-0" : "right-0"}`} onMouseDown={() => setIsResizing(true)} /></div><SidebarInset className={`min-w-0 bg-slate-50/70 ${isRtl ? "lg:mr-[var(--sidebar-width)]" : "lg:ml-[var(--sidebar-width)]"}`}><main className="min-h-screen p-4 sm:p-7">{isMobile ? <div className="mb-4 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"><span className="font-semibold text-slate-900">{appName}</span><PanelLeft className="h-5 w-5 text-slate-500" /></div> : null}{children}</main></SidebarInset></>;
}
