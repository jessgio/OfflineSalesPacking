import Barcode from "react-barcode";
import type { MarketingRequest } from "../../types/marketing";
import { THERMAL_BARCODE, thermalLabelShellClass } from "../../lib/thermalLabel";

export function MarketingShippingLabel({ request }: { request: MarketingRequest }) {
  const addressLines = [
    request.recipient_name,
    request.recipient_phone,
    request.address_line1,
    request.address_line2,
    `${request.city}, ${request.state} ${request.postal_code}`,
    request.country,
  ].filter(Boolean);

  const dueLabel = request.due_date
    ? new Date(request.due_date + "T12:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className={thermalLabelShellClass({ border: "gray" })}>
      <div className="border-b-2 border-black pb-2 mb-3">
        <h2 className="font-black text-xl tracking-tighter uppercase">AERIS BEAUTE</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">Marketing shipment</p>
        {(request.preferred_courier || dueLabel) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {request.preferred_courier && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 border-2 border-black">
                {request.preferred_courier}
              </span>
            )}
            {dueLabel && (
              <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-black text-white">
                Due {dueLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-4">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">Ship to</p>
        {addressLines.map((line, i) => (
          <p
            key={i}
            className={
              i === 0
                ? "text-base font-black leading-tight"
                : i === 1 && request.recipient_phone
                  ? "text-sm font-bold leading-snug"
                  : "text-sm font-semibold leading-snug"
            }
          >
            {line}
          </p>
        ))}
      </div>

      <div className="border-y-2 border-black py-2 mb-3 flex-1">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-2">Pack these items</p>
        <ul className="space-y-1">
          {(request.items ?? []).map((item) => (
            <li key={item.id ?? `${item.product_name}-${item.qty}`} className="text-sm font-bold leading-tight">
              <span className="inline-block w-8">{item.qty}×</span>
              {item.product_name}
            </li>
          ))}
        </ul>
      </div>

      {request.notes && (
        <p className="text-[10px] bg-gray-100 border border-gray-200 rounded px-2 py-1.5 mb-3 font-medium">
          Note: {request.notes}
        </p>
      )}

      <div className="mt-auto flex flex-col items-center pt-2">
        <Barcode
          value={request.barcode}
          format={THERMAL_BARCODE.format}
          width={1.8}
          height={50}
          displayValue
          margin={THERMAL_BARCODE.margin}
          fontSize={14}
          background={THERMAL_BARCODE.background}
        />
        <p className="text-[9px] text-gray-600 mt-2 uppercase font-bold tracking-widest text-center">
          Scan when packed · paste on package
        </p>
        <p className="text-[8px] text-gray-600 mt-1">Req by {request.requested_by_name}</p>
      </div>
    </div>
  );
}
