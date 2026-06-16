"use client";

import { useState, useEffect, use } from "react";
import { supabase } from "../../../lib/supabaseClient";
import Barcode from "react-barcode";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import Link from "next/link";
import { needsCartonPlanning } from "../../../lib/sociolla/cartonPlan";
import { THERMAL_BARCODE, THERMAL_LABEL_HINT, thermalLabelGridClass, thermalLabelPageClass, thermalLabelShellClass } from "../../../lib/thermalLabel";
import { CenteredPage, DashButton, SurfaceCard } from "../../../components/dashboard/primitives";

interface BoxContentRow {
  po_box_id: string;
  product_barcode: string;
  qty: number;
}

export default function LabelPrinter(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params); 
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      const { data: poData } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
      if (poData) setPo(poData);

      const { data: boxData } = await supabase.from("po_boxes").select("*").eq("po_id", poId).order("box_barcode");
      const { data: itemData } = await supabase.from("po_items").select("barcode, product_name").eq("po_id", poId);

      const boxIds = (boxData ?? []).map((b) => b.id);
      const { data: contentsData } =
        boxIds.length > 0
          ? await supabase.from("po_box_contents").select("po_box_id, product_barcode, qty").in("po_box_id", boxIds)
          : { data: [] as BoxContentRow[] };

      const nameByBarcode: Record<string, string> = {};
      (itemData ?? []).forEach((item) => {
        nameByBarcode[item.barcode] = item.product_name;
      });

      const contentsByBox: Record<string, BoxContentRow[]> = {};
      (contentsData ?? []).forEach((row) => {
        if (!contentsByBox[row.po_box_id]) contentsByBox[row.po_box_id] = [];
        contentsByBox[row.po_box_id].push(row);
      });
      
      if (boxData) {
        const mergedBoxes = boxData.map((box) => {
          const contents = contentsByBox[box.id] ?? [];
          const product_name =
            contents.length > 1
              ? contents
                  .map((c) => `${c.qty}× ${nameByBarcode[c.product_barcode] ?? "Product"}`)
                  .join(" · ")
              : contents.length === 1
                ? nameByBarcode[contents[0].product_barcode] ?? "Aeris Product"
                : (itemData ?? []).find((item) => item.barcode === box.product_barcode)?.product_name ?? "Aeris Product";

          return { ...box, product_name, contents };
        });
        setBoxes(mergedBoxes);
      }
      
      setLoading(false);
    };
    loadData();
  }, [poId]);

  if (loading || !po) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
        <Loader2 className="animate-spin w-12 h-12 text-blue-600 mb-4" />
        <p className="text-gray-600 font-medium">Generating Thermal Configurations...</p>
      </div>
    );
  }

  if (needsCartonPlanning(po)) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Plan inner boxes first</h2>
          <p className="text-gray-600 mb-6">Assign SKUs to inner boxes before printing LPN labels.</p>
          <Link href={`/plan/${poId}`}>
            <DashButton variant="pink" size="md" className="px-6 w-full">
              Plan Inner Boxes
            </DashButton>
          </Link>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  if (boxes.length === 0) {
    return (
      <CenteredPage>
        <SurfaceCard className="p-8 text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Labels Found</h2>
          <p className="text-gray-600 mb-6">There are no inner boxes registered for this PO.</p>
          <Link href="/dashboard">
             <DashButton variant="primary" size="md" className="px-6 w-full">
               Return Home
             </DashButton>
          </Link>
        </SurfaceCard>
      </CenteredPage>
    );
  }

  return (
    <div className={`${thermalLabelPageClass} bg-gray-100`}>
      <div className="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm z-10 sticky top-0 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <DashButton variant="ghost" size="sm" className="p-2 bg-gray-100 hover:bg-gray-200">
              <ArrowLeft className="w-5 h-5" />
            </DashButton>
          </Link>
          <h1 className="text-xl font-bold">Label Printer: PO {po.po_number}</h1>
        </div>
        <DashButton onClick={() => window.print()} variant="primary" size="md" className="px-6 shadow-md">
          <Printer className="w-4 h-4" /> Print {boxes.length} Labels
        </DashButton>
      </div>

      <p className="print:hidden text-sm text-gray-600 text-center my-6 px-4">{THERMAL_LABEL_HINT}</p>

      <div className={`${thermalLabelGridClass} max-w-5xl mx-auto`}>
        {boxes.map((box) => (
          <div
            key={box.id}
            className={`${thermalLabelShellClass({ border: "gray" })} justify-between items-center text-center`}
          >
             <div className="w-full">
               <h2 className="font-black text-2xl tracking-tighter uppercase mb-1">AERIS BEAUTE</h2>
               <p className="text-sm font-bold border-b-2 border-black w-full pb-2 mb-3">PO: {po.po_number}</p>

               <p className="text-base font-extrabold text-gray-900 leading-tight min-h-[2.5rem] flex items-center justify-center px-2">
                  {box.product_name}
               </p>

               <div className="my-3 border-y-4 border-black w-full py-2 font-black tracking-widest text-lg text-black">
                  CARTON {box.carton_number} OF {box.total_cartons}
               </div>
             </div>

             <div className="flex flex-col items-center w-full">
                <Barcode
                   value={box.box_barcode}
                   format={THERMAL_BARCODE.format}
                   width={2}
                   height={52}
                   displayValue
                   margin={THERMAL_BARCODE.margin}
                   fontSize={12}
                   background={THERMAL_BARCODE.background}
                />
                <p className="text-[10px] text-gray-600 mt-3 uppercase font-bold tracking-widest">LPN Verification Required</p>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
