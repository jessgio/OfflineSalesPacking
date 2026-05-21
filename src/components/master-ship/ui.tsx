import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export function MasterShipShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 ${className}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition mb-3"
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-8 pb-6 border-b border-slate-200">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-2 text-base text-slate-600 leading-relaxed max-w-2xl">{subtitle}</p>}
    </header>
  );
}

export function TopBar({
  backHref,
  backLabel,
  title,
  subtitle,
  badge,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm print:hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href={backHref}
            className="shrink-0 p-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            aria-label={backLabel}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{title}</h1>
              {badge}
            </div>
            {subtitle && <div className="mt-0.5 text-sm text-slate-600">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700 ring-slate-200",
    packing: "bg-amber-50 text-amber-900 ring-amber-200",
    completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    open: "bg-sky-50 text-sky-800 ring-sky-200",
    sealed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  };
  const label =
    normalized === "draft"
      ? "Draft"
      : normalized === "packing"
        ? "Packing"
        : normalized === "completed"
          ? "Completed"
          : normalized === "open"
            ? "Open"
            : normalized === "sealed"
              ? "Sealed"
              : status;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${styles[normalized] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      {label}
    </span>
  );
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-violet-600 shrink-0" />}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-slate-600 leading-relaxed">{description}</p>}
        </div>
        {action}
      </div>
      <div className="px-5 sm:px-6 py-5 sm:py-6">{children}</div>
    </section>
  );
}

export function WorkflowSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
        <li
          key={step}
          className="flex gap-3 p-4 rounded-xl bg-violet-50/80 border border-violet-100 text-sm text-slate-700 leading-snug"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white text-xs font-bold">
            {i + 1}
          </span>
          <span className="pt-0.5 font-medium">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

export function AlertBanner({
  children,
  variant = "error",
}: {
  children: ReactNode;
  variant?: "error" | "warning" | "info";
}) {
  const styles = {
    error: "bg-red-50 text-red-900 border-red-200",
    warning: "bg-amber-50 text-amber-950 border-amber-200",
    info: "bg-sky-50 text-sky-900 border-sky-200",
  };
  return (
    <div className={`mb-6 p-4 rounded-xl border text-sm leading-relaxed font-medium ${styles[variant]}`}>
      {children}
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="text-center py-10 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
      <p className="text-slate-700 font-semibold">{message}</p>
      {hint && <p className="mt-2 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function BtnPrimary({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-50 transition shadow-sm ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-800 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnDanger({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BarcodeDisplay({
  value,
  size = "md",
  inverted = false,
}: {
  value: string;
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg sm:text-xl",
  };
  return (
    <p
      className={`font-mono font-bold tracking-wide break-all ${sizes[size]} ${inverted ? "text-white" : "text-slate-800"}`}
    >
      {value}
    </p>
  );
}
