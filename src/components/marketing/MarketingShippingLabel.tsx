import Barcode from "react-barcode";
import type { MarketingRequest, MarketingRequestItem } from "../../types/marketing";
import {
  marketingLabelItemDensity,
  marketingLabelItemListClass,
  splitMarketingLabelItems,
} from "../../lib/marketingLabelPages";
import { THERMAL_BARCODE, thermalLabelShellClass } from "../../lib/thermalLabel";

function LabelBrandHeader({
  request,
  dueLabel,
}: {
  request: MarketingRequest;
  dueLabel: string | null;
}) {
  return (
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
  );
}

function LabelContinuationHeader({
  request,
  pageIndex,
  totalPages,
}: {
  request: MarketingRequest;
  pageIndex: number;
  totalPages: number;
}) {
  return (
    <div className="border-b-2 border-black pb-1.5 mb-2">
      <h2 className="font-black text-sm tracking-tighter uppercase">AERIS BEAUTE</h2>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
        Marketing shipment · Label {pageIndex + 1} of {totalPages}
      </p>
      <p className="text-sm font-black mt-1 leading-tight">{request.recipient_name}</p>
    </div>
  );
}

function LabelAddress({ request, addressLines }: { request: MarketingRequest; addressLines: string[] }) {
  return (
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
  );
}

function LabelItemList({
  items,
  itemListClass,
  continued,
}: {
  items: MarketingRequestItem[];
  itemListClass: string;
  continued?: boolean;
}) {
  return (
    <div className={`border-y-2 border-black py-2 mb-3 flex-1 min-h-0 ${itemListClass.includes("grid") ? "py-1.5" : ""}`}>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-2">
        {continued ? "Pack these items (continued)" : "Pack these items"}
      </p>
      <ul className={itemListClass}>
        {items.map((item) => (
          <li key={item.id ?? `${item.product_name}-${item.qty}`}>
            <span className="inline-block w-7 tabular-nums">{item.qty}×</span>
            {item.product_name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LabelBarcodeFooter({ request }: { request: MarketingRequest }) {
  return (
    <div className="mt-auto flex flex-col items-center pt-2 shrink-0">
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
  );
}

export function MarketingShippingLabel({ request }: { request: MarketingRequest }) {
  const items = request.items ?? [];
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

  const hasCourierBadges = Boolean(request.preferred_courier || dueLabel);
  const itemPages = splitMarketingLabelItems(items, {
    addressLineCount: addressLines.length,
    hasCourierBadges,
    hasNotes: Boolean(request.notes),
  });
  const totalPages = itemPages.length;
  const density = marketingLabelItemDensity(items.length);
  const itemListClass = marketingLabelItemListClass(density);

  return (
    <>
      {itemPages.map((pageItems, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === totalPages - 1;
        const isContinuation = !isFirstPage;

        return (
          <div key={pageIndex} className={thermalLabelShellClass({ border: "gray" })}>
            {isFirstPage ? (
              <LabelBrandHeader request={request} dueLabel={dueLabel} />
            ) : (
              <LabelContinuationHeader
                request={request}
                pageIndex={pageIndex}
                totalPages={totalPages}
              />
            )}

            {isFirstPage && <LabelAddress request={request} addressLines={addressLines} />}

            <LabelItemList
              items={pageItems}
              itemListClass={itemListClass}
              continued={isContinuation}
            />

            {isLastPage && request.notes && (
              <p className="text-[10px] bg-gray-100 border border-gray-200 rounded px-2 py-1.5 mb-3 font-medium shrink-0">
                Note: {request.notes}
              </p>
            )}

            {isLastPage ? (
              <LabelBarcodeFooter request={request} />
            ) : (
              <p className="mt-auto pt-2 text-center text-[10px] font-black uppercase tracking-wide shrink-0">
                Continued on next label
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
