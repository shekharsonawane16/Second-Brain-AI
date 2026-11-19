import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-indigo-400">
            <Icon size={19} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
