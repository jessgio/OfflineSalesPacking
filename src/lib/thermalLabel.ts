/** Standard 4×6 in (100×150 mm) thermal label used across the app. */
export const THERMAL_LABEL = {
  width: "100mm",
  height: "150mm",
  widthMm: 100,
  heightMm: 150,
} as const;

export const THERMAL_LABEL_HINT =
  "Preview at label width (100 mm). Standard height is 150 mm; labels with many items grow taller so nothing is cut off.";

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
    "w-[100mm] min-h-[150mm] h-auto p-4 flex flex-col text-black rounded-xl shadow-sm",
    "print:border-none print:shadow-none print:rounded-none",
    "print:w-[100mm] print:min-h-[150mm] print:h-auto print:p-3 print:break-after-page",
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
