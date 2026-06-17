/** Standard 4×6 in (100×150 mm) thermal label used across the app. */
export const THERMAL_LABEL = {
  width: "100mm",
  height: "150mm",
  widthMm: 100,
  heightMm: 150,
} as const;

export const THERMAL_LABEL_HINT =
  "Preview at actual label size (100×150 mm). Long packing lists continue on additional labels.";

type ThermalLabelBorder = "slate" | "violet" | "gray";

const borderClass: Record<ThermalLabelBorder, string> = {
  slate: "border-slate-300",
  violet: "border-violet-200",
  gray: "border-gray-300",
};

/** Outer shell for a single thermal label — preview and print use the same dimensions. */
export function thermalLabelShellClass(options?: { border?: ThermalLabelBorder }): string {
  const border = borderClass[options?.border ?? "slate"];

  return [
    "bg-white border-2 border-dashed",
    border,
    "w-[100mm] h-[150mm] p-4 flex flex-col text-black rounded-xl shadow-sm overflow-hidden",
    "print:border-none print:shadow-none print:rounded-none",
    "print:w-[100mm] print:h-[150mm] print:p-3 print:break-after-page print:overflow-hidden",
  ].join(" ");
}

/** Grid wrapper for label preview / batch print pages. */
export const thermalLabelGridClass =
  "thermal-label-grid flex flex-wrap gap-6 justify-center px-4 pb-8 pt-2 print:p-0 print:gap-0 print:m-0";

/** Root page wrapper — scopes @page size so full-page manifests are unaffected. */
export const thermalLabelPageClass = "thermal-label-print min-h-screen pb-24 text-black";

export const THERMAL_BARCODE = {
  format: "CODE128" as const,
  margin: 0,
  background: "transparent",
};
