"use client";

import { useState, useEffect, use } from "react";
import { supabase } from "../../../lib/supabaseClient";
import Barcode from "react-barcode";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import Link from "next/link";
import { needsCartonPlanning } from "../../../lib/sociolla/cartonPlan";

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
        <p className="text-gray-500 font-medium">Generating Thermal Configurations...</p>
      </div>
    );
  }

  if (needsCartonPlanning(po)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Plan inner boxes first</h2>
          <p className="text-gray-500 mb-6">Assign SKUs to inner boxes before printing LPN labels.</p>
          <Link href={`/plan/${poId}`}>
            <button className="bg-pink-600 text-white px-6 py-2 rounded-lg font-bold w-full">Plan Inner Boxes</button>
          </Link>
        </div>
      </div>
    );
  }

  if (boxes.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Labels Found</h2>
          <p className="text-gray-500 mb-6">There are no inner boxes registered for this PO.</p>
          <Link href="/">
             <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold w-full">Return Home</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24 text-black">
      <div className="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm z-10 sticky top-0 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/"><button className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"><ArrowLeft className="w-5 h-5" /></button></Link>
          <h1 className="text-xl font-bold">Label Printer: PO {po.po_number}</h1>
        </div>
        <button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 transition text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md">
          <Printer className="w-4 h-4" /> Print {boxes.length} Labels
        </button>
      </div>

      <div className="p-8 max-w-5xl mx-auto print:p-0 print:m-0 flex flex-wrap gap-6 justify-center">
        {boxes.map((box) => (
          <div 
            key={box.id} 
            className="bg-white border-2 border-dashed border-gray-300 w-80 h-auto p-6 flex flex-col justify-between items-center rounded-xl text-center shadow-sm print:border-none print:w-[100mm] print:h-[150mm] print:page-break-after-always print:shadow-none print:rounded-none print:justify-start print:pt-12"
          >
             <div className="w-full">
               <h2 className="font-black text-3xl tracking-tighter uppercase mb-1">AERIS BEAUTE</h2>
               <p className="text-sm font-bold border-b-2 border-black w-full pb-2 mb-4">PO: {po.po_number}</p>
               
               <p className="text-lg font-extrabold text-gray-900 leading-tight min-h-[3rem] flex items-center justify-center px-2">
                  {box.product_name}
               </p>

               <div className="my-4 border-y-4 border-black w-full py-2 font-black tracking-widest text-xl text-black">
                  CARTON {box.carton_number} OF {box.total_cartons}
               </div>
             </div>

             <div className="mt-2 scale-110 print:scale-125 transform origin-top overflow-hidden flex flex-col items-center w-full">
                <Barcode 
                   value={box.box_barcode} 
                   format="CODE128" 
                   width={2.2} 
                   height={65} 
                   displayValue={true} 
                   margin={0}
                   fontSize={16}
                   background="transparent"
                />
                <p className="text-[11px] text-gray-500 mt-5 uppercase font-bold tracking-widest">LPN Verification Required</p>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
