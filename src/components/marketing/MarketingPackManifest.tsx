import type { MarketingRequest } from "../../types/marketing";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function MarketingPackManifest({ requests }: { requests: MarketingRequest[] }) {
  const packedAt = requests[0]?.packed_at ?? null;
  const packedBy = requests[0]?.packed_by ?? null;
  const totalItems = requests.reduce((sum, req) => sum + (req.items?.length ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border-none print:rounded-none text-black">
      <div className="px-6 sm:px-10 py-8 border-b-4 border-gray-900 print:px-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-600">Aeris Beaute</p>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mt-1 uppercase tracking-tight">
          Marketing packing manifest
        </h1>
        <div className="grid sm:grid-cols-3 gap-6 mt-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Total packages</p>
            <p className="text-3xl font-black text-gray-900 mt-0.5 tabular-nums">{requests.length}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Packed by</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{packedBy ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Packed at</p>
            <p className="text-base font-semibold text-gray-800 mt-0.5 leading-snug">{formatWhen(packedAt)}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-4">
          {totalItems} line item{totalItems === 1 ? "" : "s"} across {requests.length} package
          {requests.length === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="px-6 sm:px-10 py-6 print:px-0">
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-gray-50 text-left border-b border-gray-200 text-xs font-bold uppercase text-gray-600">
                <th className="py-3 px-4 w-10">#</th>
                <th className="py-3 px-4">Barcode</th>
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Courier</th>
                <th className="py-3 px-4 text-right">Items</th>
                <th className="py-3 px-4">Packed at</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req, index) => (
                <tr key={req.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 px-4 font-bold text-gray-700 tabular-nums">{index + 1}</td>
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-900">{req.barcode}</td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-gray-900">{req.recipient_name}</p>
                    <p className="text-xs text-gray-600">
                      {req.city}, {req.country}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-gray-800">{req.preferred_courier ?? "—"}</td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900 tabular-nums">
                    {req.items?.length ?? 0}
                  </td>
                  <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{formatWhen(req.packed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 space-y-4">
          {requests.map((req) => (
            <article key={req.id} className="break-inside-avoid border border-gray-200 rounded-xl overflow-hidden">
              <header className="bg-gray-900 text-white px-4 py-2.5 flex flex-wrap justify-between items-center gap-2">
                <span className="font-bold">
                  {req.barcode} · {req.recipient_name}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide opacity-90">
                  {req.items?.length ?? 0} item{(req.items?.length ?? 0) === 1 ? "" : "s"}
                </span>
              </header>
              <ul className="px-4 py-3 space-y-1 text-sm text-gray-800">
                {(req.items ?? []).map((item) => (
                  <li key={item.id ?? `${item.product_name}-${item.qty}`}>
                    <span className="font-bold tabular-nums">{item.qty}×</span> {item.product_name}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <footer className="px-6 py-4 border-t border-gray-100 text-center text-xs text-gray-600 print:mt-8">
        Marketing fulfillment · packing manifest
      </footer>
    </div>
  );
}
