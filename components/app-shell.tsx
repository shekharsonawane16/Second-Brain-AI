"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell, Calendar as CalendarIcon, ChevronLeft, ChevronRight, CloudOff, LayoutDashboard,
  ListChecks, LogOut, Menu, Moon, Plus, Search, Settings as SettingsIcon, Sun, Sunrise, X
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { NAV_GROUPS, breadcrumb, pageTitle } from "@/lib/nav";
import { QuickAdd } from "./quick-add";
import { TaskDetail } from "./task-detail";
import { InstallAppButton } from "./install-app";
import { CommandPalette } from "./command-palette";
import { CinematicIntro } from "./cinematic-intro";

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { settings, updateSettings } = useStore();
  const dark = settings.theme !== "light";
  return (
    <button
      onClick={() => updateSettings({ theme: dark ? "light" : "dark" })}
      className={cn(compact ? "btn-icon border-0 bg-transparent" : "btn-icon")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function NotificationCenter() {
  const { notifications, unreadCount, markNotifRead, markAllNotifRead } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-icon relative" aria-label="Notifications" aria-expanded={open}>
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card fade-in absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden shadow-soft">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-semibold">Notifications</h3>
              <button onClick={markAllNotifRead} className="text-[11px] text-indigo-400 hover:underline">Mark all read</button>
            </div>
            <div className="scroll-thin max-h-80 overflow-y-auto p-1.5">
              {notifications.length === 0 && (
                <div className="px-2 py-8 text-center">
                  <Bell size={20} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">You&apos;re all caught up.</p>
                </div>
              )}
              {notifications.slice(0, 30).map((n) => (
                <button key={n.id} onClick={() => markNotifRead(n.id)} className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted", !n.read && "bg-indigo-500/10")}>
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-indigo-400")} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{n.title}</span>
                    <span className="block text-muted-foreground">{n.body}</span>
                  </span>
                </button>
              ))}
            </div>
            <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t px-3 py-2 text-center text-xs font-medium text-indigo-400 hover:bg-muted">
              View all notifications
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, settings, signOut } = useStore();
  const [open, setOpen] = useState(false);
  const name = settings.display_name || user?.display_name || "You";
  const initials = name.trim().slice(0, 1).toUpperCase() || "U";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white ring-1 ring-white/10 transition hover:brightness-110"
        aria-label="Account menu"
        aria-expanded={open}
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card fade-in absolute right-0 z-50 mt-2 w-64 overflow-hidden shadow-soft">
            <div className="border-b px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">{initials}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{user?.email}</span>
                </span>
              </div>
            </div>
            <div className="p-1.5">
              <Link href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"><SettingsIcon size={15} className="text-muted-foreground" /> Settings</Link>
              <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"><Bell size={15} className="text-muted-foreground" /> Notifications</Link>
              <div className="my-1 border-t" />
              <div className="px-1 py-1"><InstallAppButton variant="menu" /></div>
              <div className="my-1 border-t" />
              <button onClick={() => { setOpen(false); signOut(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-400 hover:bg-red-500/10">
                <LogOut size={15} /> Sign out
              </button>
            </div>
            <p className="border-t px-4 py-2 text-[10px] text-muted-foreground">{BRAND.tagline}</p>
          </div>
        </>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[80] flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 md:bottom-4">
      {toasts.map((t) => (
        <div key={t.id} className={cn("card toast-in pointer-events-auto flex items-start gap-2 border-l-4 p-3 shadow-soft",
          t.kind === "error" ? "border-l-red-500" : t.kind === "success" ? "border-l-emerald-500" : "border-l-indigo-500")}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-muted-foreground">{t.body}</p>}
          </div>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { tasks, todayStr } = useStore();

  const counts = (href: string): number | null => {
    const active = tasks.filter((t) => !t.trashed_at && !t.archived && t.status !== "completed");
    if (href === "/my-day") return active.filter((t) => t.deadline_date === todayStr || (t.deadline_date && t.deadline_date < todayStr) || t.is_today_focus).length;
    if (href === "/critical") return active.filter((t) => t.priority === "critical").length;
    if (href === "/all") return active.length;
    return null;
  };

  return (
    <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-1">
          {!collapsed && <p className="nav-label">{group.label}</p>}
          {collapsed && <div className="my-2 border-t" />}
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            const badge = item.soon ? null : counts(item.href);
            const content = (
              <>
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.soon && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Soon</span>}
                {!collapsed && !item.soon && badge !== null && badge > 0 && (
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", item.href === "/critical" ? "bg-red-500/15 text-red-400" : "bg-muted text-muted-foreground")}>{badge}</span>
                )}
              </>
            );
            if (item.soon) {
              return (
                <div key={group.label + item.label} className="nav-item cursor-default" title={item.hint} aria-disabled="true">
                  {content}
                </div>
              );
            }
            return (
              <Link
                key={group.label + item.href + item.label}
                href={item.href}
                onClick={onNavigate}
                className={cn("nav-item", active && "nav-item-active")}
                title={collapsed ? item.label : undefined}
              >
                {content}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function SectionsList({ collapsed }: { collapsed: boolean }) {
  const { categories } = useStore();
  if (collapsed) return null;
  const list = categories.filter((c) => !c.archived).slice(0, 6);
  if (!list.length) return null;
  return (
    <div className="border-t px-2 py-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <p className="eyebrow">Your sections</p>
        <Link href="/categories" className="text-[10px] text-indigo-400 hover:underline">Manage</Link>
      </div>
      {list.map((c) => (
        <Link key={c.id} href={`/categories/${c.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
          <span className="truncate">{c.name}</span>
        </Link>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, authLoading, user, tasks, signOut, setPaletteOpen, openQuickAdd, cloudMode, settings } = useStore();
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("sb:sidebar:collapsed") === "1"); } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("sb:sidebar:collapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed, hydrated]);

  useEffect(() => { setMobileNav(false); }, [pathname]);

  useEffect(() => {
    if (!authLoading && ready && !user && pathname !== "/login") router.replace("/login");
  }, [authLoading, ready, user, pathname, router]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setPaletteOpen]);

  if (pathname === "/login") {
    return <>{children}<Toasts /></>;
  }

  if (authLoading || !ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="fade-in text-center">
          <img src="/icons/icon-192.png" alt={BRAND.name} width={56} height={56} className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow-glow" />
          <p className="text-base font-bold">{BRAND.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{BRAND.tagline}</p>
          <div className="mx-auto mt-5 flex w-40 items-center gap-1.5">
            <span className="skeleton h-1 flex-1" /><span className="skeleton h-1 flex-1" /><span className="skeleton h-1 flex-1" />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  const overdueCount = tasks.filter((t) => t.priority === "critical" && t.deadline_date && t.deadline_date < new Date().toISOString().slice(0, 10) && t.status !== "completed" && !t.trashed_at).length;
  const crumbs = breadcrumb(pathname);
  const title = pageTitle(pathname);
  const name = settings.display_name || user.display_name || "there";

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card/50 backdrop-blur-xl transition-[width] duration-200 md:flex", collapsed ? "w-[72px]" : "w-[268px]")}>
        <div className={cn("flex items-center gap-2.5 px-3 py-4", collapsed && "justify-center px-2")}>
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/icons/icon-192.png" alt={BRAND.name} width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl" />
            {!collapsed && (
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold leading-tight">
                  Second Brain <span className="rounded bg-indigo-500/20 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-300">AI</span>
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">Your second memory</span>
              </span>
            )}
          </Link>
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Collapse sidebar">
              <ChevronLeft size={15} />
            </button>
          )}
        </div>
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="mx-auto mb-1 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Expand sidebar">
            <ChevronRight size={15} />
          </button>
        )}

        <SidebarNav collapsed={collapsed} />
        <SectionsList collapsed={collapsed} />

        <div className={cn("border-t p-2", collapsed && "flex flex-col items-center")}>
          {!collapsed && <div className="mb-1"><InstallAppButton variant="sidebar" /></div>}
          {collapsed && <div className="mb-1"><InstallAppButton variant="icon" /></div>}
          <div className={cn("flex items-center gap-2 rounded-lg p-1.5", collapsed && "justify-center")}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
              {(name || "U").slice(0, 1).toUpperCase()}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
              </span>
            )}
            {!collapsed && (
              <button onClick={signOut} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-red-400" aria-label="Sign out" title="Sign out">
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
          {!cloudMode && (
            <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-300">
              <CloudOff size={13} className="shrink-0" />
              <span><strong>Local mode</strong> — data stays in this browser. Add Supabase keys in <code>.env.local</code> for cloud sync.</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2.5 md:px-5">
            <button className="btn-icon md:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={17} /></button>

            <div className="min-w-0 flex-1">
              <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight size={11} />}
                    {c.href ? <Link href={c.href} className="hover:text-foreground">{c.label}</Link> : <span className="text-foreground/80">{c.label}</span>}
                  </span>
                ))}
              </div>
              <h2 className="truncate text-sm font-semibold md:hidden">{title}</h2>
            </div>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden w-full max-w-xs items-center gap-2 rounded-[10px] border bg-card px-3 py-2 text-left text-[13px] text-muted-foreground transition hover:border-indigo-500/50 sm:flex"
              aria-label="Search or run a command"
            >
              <Search size={15} className="shrink-0" />
              <span className="flex-1 truncate">Search or jump to…</span>
              <span className="kbd hidden lg:inline-flex">Ctrl K</span>
            </button>
            <button onClick={() => setPaletteOpen(true)} className="btn-icon sm:hidden" aria-label="Search"><Search size={17} /></button>

            <button onClick={() => openQuickAdd()} className="btn-primary flex shrink-0 items-center gap-1.5">
              <Plus size={16} />
              <span className="max-sm:hidden">Add task</span>
              <span className="kbd hidden border-white/25 bg-white/15 text-white lg:inline-flex">N</span>
            </button>
            <NotificationCenter />
            <span className="hidden sm:block"><ThemeToggle /></span>
            <UserMenu />
          </div>
        </header>

        <main key={pathname} className="page-enter mx-auto w-full max-w-[1200px] flex-1 px-3 py-5 pb-28 md:px-6 md:pb-10">
          {children}
        </main>

        {/* Mobile bottom nav with quick add */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Mobile navigation">
          <div className="relative mx-auto grid max-w-md grid-cols-5 items-end px-2 py-1.5">
            {[
              { href: "/", label: "Home", icon: LayoutDashboard },
              { href: "/my-day", label: "My Day", icon: Sunrise }
            ].map((n) => (
              <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px]", pathname === n.href ? "text-indigo-400" : "text-muted-foreground")}>
                <n.icon size={19} />{n.label}
              </Link>
            ))}
            <button
              onClick={() => openQuickAdd()}
              aria-label="Quick add task"
              className="-mt-6 flex h-12 w-12 items-center justify-center justify-self-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-glow transition active:scale-95"
            >
              <Plus size={22} />
            </button>
            {[
              { href: "/all", label: "Tasks", icon: ListChecks },
              { href: "/calendar", label: "Calendar", icon: CalendarIcon }
            ].map((n) => (
              <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px]", pathname === n.href ? "text-indigo-400" : "text-muted-foreground")}>
                <n.icon size={19} />{n.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setMobileNav(false)} />
          <div className="slide-in-right absolute left-0 top-0 flex h-full w-[280px] flex-col border-r bg-card">
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
              <img src="/icons/icon-192.png" alt="" width={30} height={30} className="h-8 w-8 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-tight">Second Brain <span className="text-indigo-400">AI</span></p>
                <p className="truncate text-[10px] text-muted-foreground">Your Life. Your Knowledge.</p>
              </div>
              <button onClick={() => setMobileNav(false)} aria-label="Close menu" className="rounded-lg p-1.5 hover:bg-muted"><X size={17} /></button>
            </div>
            <div className="px-2 py-2"><InstallAppButton variant="sidebar" /></div>
            <SidebarNav collapsed={false} onNavigate={() => setMobileNav(false)} />
            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">{(name || "U").slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
                </span>
                <button onClick={signOut} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-red-400" aria-label="Sign out"><LogOut size={15} /></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating quick-add on tablet/desktop-ish mobile landscape */}
      <button
        onClick={() => openQuickAdd()}
        className="fixed bottom-24 right-4 z-30 hidden h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-glow sm:flex md:hidden"
        aria-label="Quick add task"
      >
        <Plus size={22} />
      </button>

      <QuickAdd />
      <TaskDetail />
      <CommandPalette />
      <Toasts />
      <CinematicIntro />
    </div>
  );
}

