import type { LucideIcon } from "lucide-react";
import {
  AlertOctagon, ArrowUp, BarChart3, Bell, BrainCircuit, Calendar as CalendarIcon,
  CalendarClock, CheckCircle2, Crosshair, FolderKanban, Inbox, LayoutDashboard,
  Library, ListChecks, NotebookPen, Settings as SettingsIcon, Sparkles, Sunrise,
  Trash2, Wand2
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
  hint?: string;
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/my-day", label: "My Day", icon: Sunrise },
      { href: "/inbox", label: "AI Life Inbox", icon: Inbox },
      { href: "/upcoming", label: "Upcoming", icon: CalendarClock },
      { href: "/all", label: "All Tasks", icon: ListChecks },
      { href: "/critical", label: "Critical Deadlines", icon: AlertOctagon },
      { href: "/high", label: "High Priority", icon: ArrowUp }
    ]
  },
  {
    label: "Organize",
    items: [
      { href: "/notes", label: "My Notes", icon: NotebookPen },
      { href: "/knowledge", label: "Knowledge Library", icon: Library },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/categories", label: "Categories", icon: FolderKanban },
      { href: "/calendar", label: "Calendar", icon: CalendarIcon }
    ]
  },
  {
    label: "Intelligence",
    items: [
      { href: "/assistant", label: "AI Assistant", icon: Sparkles },
      { href: "/memory", label: "AI Memory", icon: BrainCircuit },
      { href: "/planner", label: "Smart Planner", icon: Wand2, soon: true, hint: "Arrives in a later phase" },
      { href: "/analytics", label: "Analytics", icon: BarChart3 }
    ]
  },
  {
    label: "Personal",
    items: [
      { href: "/focus", label: "Focus Mode", icon: Crosshair },
      { href: "/completed", label: "Completed", icon: CheckCircle2 },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Settings", icon: SettingsIcon },
      { href: "/trash", label: "Trash", icon: Trash2 }
    ]
  }
];

const FLAT = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.soon);

export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/categories/")) return "Category";
  if (pathname.startsWith("/projects/")) return "Project";
  const match = FLAT.find((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/")));
  return match?.label ?? "Overview";
}

export function breadcrumb(pathname: string): { label: string; href?: string }[] {
  const crumbs: { label: string; href?: string }[] = [{ label: "Second Brain AI", href: "/" }];
  if (pathname.startsWith("/categories/")) {
    crumbs.push({ label: "Categories", href: "/categories" });
    crumbs.push({ label: "Category" });
    return crumbs;
  }
  if (pathname.startsWith("/projects/")) {
    crumbs.push({ label: "Projects", href: "/projects" });
    crumbs.push({ label: "Project" });
    return crumbs;
  }
  const title = pageTitle(pathname);
  if (title !== "Overview") crumbs.push({ label: title });
  return crumbs;
}
