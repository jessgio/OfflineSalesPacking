import { cx } from "../dashboard/primitives";
import { biteshipStatusStyle, formatBiteshipStatusLabel } from "../../lib/biteshipWebhook";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BiteshipStatusBadge({
  status,
  updatedAt,
  className,
}: {
  status: string | null | undefined;
  updatedAt?: string | null;
  className?: string;
}) {
  if (!status) return null;

  return (
    <span className={cx("inline-flex flex-col gap-0.5", className)}>
      <span
        className={cx(
          "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap w-fit",
          biteshipStatusStyle(status)
        )}
      >
        {formatBiteshipStatusLabel(status)}
      </span>
      {updatedAt && (
        <span className="text-[10px] text-gray-500">Updated {formatWhen(updatedAt)}</span>
      )}
    </span>
  );
}
