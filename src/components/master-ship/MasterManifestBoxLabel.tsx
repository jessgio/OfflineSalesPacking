import Barcode from "react-barcode";
import type { ManifestMasterBox } from "../../types/masterPacking";
import { THERMAL_BARCODE, thermalLabelShellClass } from "../../lib/thermalLabel";

function tableTypography(skuCount: number) {
  if (skuCount <= 5) {
    return {
      table: "text-[11px] leading-snug",
      qty: "text-[12px] font-black",
      header: "text-[11px]",
      rowPy: "py-1",
    };
  }
  if (skuCount <= 8) {
    return {
      table: "text-[10px] leading-snug",
      qty: "text-[11px] font-black",
      header: "text-[10px]",
      rowPy: "py-0.5",
    };
  }
  return {
    table: "text-[9px] leading-tight",
    qty: "text-[10px] font-black",
    header: "text-[9px]",
    rowPy: "py-0.5",
  };
}

export function MasterManifestBoxLabel({
  master,
  sessionCode,
  poSummary,
  retailerName,
}: {
  master: ManifestMasterBox;
  sessionCode: string;
  poSummary: string;
  retailerName?: string;
}) {
  const innerCartonCount = master.inner_boxes.reduce((sum, row) => sum + row.count, 0);
  const skuCount = master.inner_boxes.length;
  const type = tableTypography(skuCount);

  return (
    <div className={thermalLabelShellClass({ border: "violet" })}>
      <div className="shrink-0 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">Aeris Beaute</p>
          <h2 className="font-black text-xl tracking-tight uppercase mt-0.5 leading-none">
            Master #{master.box_number}
          </h2>
          <p className="text-[8px] font-semibold mt-1.5 leading-tight">
            Session <span className="font-mono">{sessionCode}</span>
          </p>
          <p className="text-[8px] font-bold border-b border-black pb-1.5 mt-1 leading-tight">
            PO {poSummary}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-end pt-0.5">
          <Barcode
            value={master.master_barcode}
            format={THERMAL_BARCODE.format}
            width={1.1}
            height={32}
            displayValue
            margin={THERMAL_BARCODE.margin}
            fontSize={7}
            background={THERMAL_BARCODE.background}
          />
        </div>
      </div>

      {retailerName && (
        <p className="shrink-0 text-[7px] text-slate-700 mt-1 leading-tight line-clamp-2">{retailerName}</p>
      )}

      <div className="shrink-0 flex items-center justify-between gap-2 py-1.5 mt-1 border-y border-slate-300">
        <span className="text-[8px] font-black uppercase tracking-wide">
          {innerCartonCount} inner carton{innerCartonCount === 1 ? "" : "s"}
        </span>
        <span
          className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded ${
            master.status === "sealed"
              ? "bg-emerald-100 text-emerald-900 print:bg-transparent print:border print:border-emerald-800"
              : "bg-amber-100 text-amber-900 print:bg-transparent print:border print:border-amber-800"
          }`}
        >
          {master.status}
        </span>
      </div>

      <div className="flex-1 min-h-0 mt-1.5 overflow-hidden">
        {master.inner_boxes.length === 0 ? (
          <p className="text-[8px] italic text-slate-600">No inner cartons assigned</p>
        ) : (
          <table className={`w-full table-fixed ${type.table}`}>
            <colgroup>
              <col className="w-[11%]" />
              <col className="w-[39%]" />
              <col className="w-[50%]" />
            </colgroup>
            <thead>
              <tr className={`border-b border-slate-300 text-left ${type.header}`}>
                <th className={`${type.rowPy} pr-1 font-bold`}>Qty</th>
                <th className={`${type.rowPy} pr-1 font-bold`}>SKU</th>
                <th className={`${type.rowPy} font-bold`}>Product</th>
              </tr>
            </thead>
            <tbody>
              {master.inner_boxes.map((inner) => (
                <tr key={`${inner.product_barcode}:${inner.po_number}`} className="border-b border-slate-100 last:border-0">
                  <td className={`${type.rowPy} pr-1 ${type.qty} tabular-nums align-top text-center`}>
                    {inner.count}
                  </td>
                  <td className={`${type.rowPy} pr-1 font-mono font-semibold align-top break-all leading-tight`}>
                    {inner.product_barcode || "—"}
                  </td>
                  <td className={`${type.rowPy} align-top leading-tight line-clamp-2`}>
                    {inner.product_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="shrink-0 text-[7px] text-slate-600 uppercase font-bold tracking-wide mt-auto pt-1.5 text-center">
        Paste on outer master box
      </p>
    </div>
  );
}
