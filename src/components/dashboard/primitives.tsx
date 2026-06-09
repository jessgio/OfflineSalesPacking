import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Readable form fields on light surfaces (warehouse dashboards stay light-themed). */
export const fieldInput =
  "w-full border border-gray-300 rounded-lg bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 [color-scheme:light]";

export function SurfaceCard({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cx("bg-white rounded-xl border border-gray-200 shadow-sm text-gray-900", className)} {...props}>
      {children}
    </div>
  );
}

export function CenteredPage({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cx("min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8 text-gray-900", className)} {...props}>
      {children}
    </div>
  );
}

const buttonVariants = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  secondary: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-100",
  subtle: "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100",
  success: "bg-green-600 text-white hover:bg-green-700",
  danger: "bg-red-100 text-red-700 hover:bg-red-200",
  ghost: "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
  dark: "bg-black text-white hover:bg-gray-800",
  pink: "bg-pink-600 text-white hover:bg-pink-700",
} as const;

const buttonSizes = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
} as const;

type DashButtonVariant = keyof typeof buttonVariants;
type DashButtonSize = keyof typeof buttonSizes;

export function DashButton({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: DashButtonVariant;
  size?: DashButtonSize;
}) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
