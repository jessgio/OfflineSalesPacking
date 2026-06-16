"use client";

import Barcode from "react-barcode";
import type { MarketingRequest } from "../../types/marketing";
import {
  barcodeWidthForValue,
  biteshipLabelReference,
  biteshipLabelStatus,
  formatCourierCompanyLabel,
  resolveBiteshipWaybillId,
} from "../../lib/marketingBiteshipLabel";
import { THERMAL_BARCODE, thermalLabelShellClass } from "../../lib/thermalLabel";

function LabelBarcode({
  value,
  height,
  fontSize,
}: {
  value: string;
  height: number;
  fontSize: number;
}) {
  return (
    <Barcode
      value={value}
      format={THERMAL_BARCODE.format}
      width={barcodeWidthForValue(value)}
      height={height}
      displayValue
      margin={THERMAL_BARCODE.margin}
      fontSize={fontSize}
      background={THERMAL_BARCODE.background}
    />
  );
}

export function MarketingBiteshipShippingLabel({
  request,
  waybillId,
}: {
  request: MarketingRequest;
  waybillId?: string | null;
}) {
  const awb = resolveBiteshipWaybillId(request, waybillId);
  const reference = biteshipLabelReference(request);
  const statusLabel = biteshipLabelStatus(request);
  const courierCompany = formatCourierCompanyLabel(request.biteship_courier_company);
  const courierType = request.biteship_courier_type?.trim().toUpperCase() ?? null;

  const addressLines = [
    request.address_line1,
    request.address_line2,
    `${request.city}, ${request.state} ${request.postal_code}`,
    request.country,
  ].filter(Boolean);

  return (
    <div className={thermalLabelShellClass({ border: "violet" })}>
      <div className="border-b-2 border-black pb-2 mb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-violet-700">
              Biteship · Carrier label
            </p>
            <h2 className="font-black text-lg leading-tight uppercase tracking-tight truncate">
              {courierCompany}
            </h2>
            {courierType && (
              <p className="text-[10px] font-bold uppercase text-gray-700">{courierType}</p>
            )}
          </div>
          {statusLabel && (
            <span className="text-[8px] font-black uppercase px-1.5 py-0.5 border-2 border-black shrink-0">
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      <div className="mb-2">
        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">Ship to</p>
        <p className="text-sm font-black leading-tight">{request.recipient_name}</p>
        {request.recipient_phone && (
          <p className="text-xs font-bold text-gray-800">{request.recipient_phone}</p>
        )}
        {addressLines.map((line) => (
          <p key={line} className="text-[11px] font-semibold leading-snug">
            {line}
          </p>
        ))}
      </div>

      <div className="border-y-2 border-black py-2 mb-2 flex flex-col items-center">
        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-600 mb-1 w-full text-center">
          Air waybill
        </p>
        {awb ? (
          <>
            <LabelBarcode value={awb} height={52} fontSize={13} />
            <p className="text-[8px] font-bold uppercase tracking-wider text-gray-600 mt-1">
              Scan at handover · affix to package
            </p>
          </>
        ) : (
          <div className="w-full py-4 px-2 text-center border-2 border-dashed border-gray-400 rounded-lg">
            <p className="text-xs font-bold text-gray-700">AWB pending</p>
            <p className="text-[9px] text-gray-600 mt-1 leading-snug">
              Reprint after Biteship assigns the waybill number.
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto flex flex-col items-center pt-1">
        <p className="text-[8px] font-bold uppercase tracking-widest text-gray-600 mb-1 w-full text-center">
          Internal reference
        </p>
        <LabelBarcode value={reference} height={36} fontSize={11} />
        {request.biteship_order_id && (
          <p className="text-[7px] font-mono text-gray-500 mt-1 truncate max-w-full">
            Order {request.biteship_order_id}
          </p>
        )}
        {request.shipped_by && (
          <p className="text-[7px] text-gray-600 mt-0.5 uppercase font-bold tracking-wide">
            Packed by {request.shipped_by}
          </p>
        )}
      </div>
    </div>
  );
}
