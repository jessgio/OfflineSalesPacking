"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { UploadCloud, Package, ArrowRight, Loader2, Trash2, Calendar, Truck, Combine, X, Store, Users, Printer, Archive, Search } from "lucide-react";
import Link from "next/link";

export default function ManagerDashboard() {
  const [pos, setPos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [selectedPOs, setSelectedPOs] = useState<string[]>([]);
  
  const [activeTab, setActiveTab] = useState<"DFI" | "SOCIOLLA" | "RESELLER">("DFI");
  const [viewMode, setViewMode] = useState<"ACTIVE" | "HISTORY">("ACTIVE");

  useEffect(() => { fetchPOs(); }, []);

  // SAFETY FEATURE: Clear selections whenever you switch views so you don't accidentally delete the wrong things
  useEffect(() => {
    setSelectedPOs([]);
  }, [viewMode]);

  const fetchPOs = async () => {
    const { data, error } = await supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });
    if (!error && data) setPos(data);
  };

  const handleDeletePO = async (id: string, poNumber: string) => {
    const isConfirmed = window.confirm(`DANGER: Are you absolutely sure you want to completely delete PO ${poNumber}? This cannot be undone.`);
    if (!isConfirmed) return;

    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (!error) { setSelectedPOs((prev: string[]) => prev.filter((poId: string) => poId !== id)); fetchPOs(); }
  };

  const handleBulkDelete = async () => {
    const isConfirmed = window.confirm(`DANGER: Are you sure you want to permanently delete all ${selectedPOs.length} selected POs?`);
    if (!isConfirmed) return;
    setUploading(true);
    setMessage({ text: "Deleting selected POs...", type: "info" });
    try {
      const { error } = await supabase.from("purchase_orders").delete().in("id", selectedPOs);
      if (error) throw error;
      setMessage({ text: `Successfully deleted ${selectedPOs.length} POs.`, type: "success" });
      setSelectedPOs([]); fetchPOs();
    } catch (err: any) { setMessage({ text: "Failed to delete POs.", type: "error" }); } finally { setUploading(false); }
  };

  const togglePoSelection = (id: string) => {
    setSelectedPOs((prev: string[]) => prev.includes(id) ? prev.filter((poId: string) => poId !== id) : [...prev, id]);
  };

  const handleMergePOs = async () => {
    const isConfirmed = window.confirm(`Merge ${selectedPOs.length} POs? This combines items and deletes original orders.`);
    if (!isConfirmed) return;
    setUploading(true);
    setMessage({ text: "Aggregating POs...", type: "info" });
    try {
      const posToMerge = pos.filter((p: any) => selectedPOs.includes(p.id));
      const combinedNumbers = posToMerge.map((p: any) => p.po_number).join(' + ');
      const retailer = posToMerge[0].retailer_name; 
      const poDate = posToMerge[0].po_date;
      const deliveryDate = posToMerge[0].delivery_date;

      const { data: allItems, error: itemsError } = await supabase.from("po_items").select("*").in("po_id", selectedPOs);
      if (itemsError) throw itemsError;

      const mergedItemsMap: Record<string, any> = {};
      allItems.forEach((item: any) => {
        if (!mergedItemsMap[item.barcode]) {
          mergedItemsMap[item.barcode] = { ...item, target_qty: 0, inner_boxes: 0, scanned_qty: 0, scan_history: [] };
        }
        mergedItemsMap[item.barcode].target_qty += item.target_qty;
        mergedItemsMap[item.barcode].inner_boxes += item.inner_boxes;
        mergedItemsMap[item.barcode].scanned_qty += item.scanned_qty;
        const oldHistory = Array.isArray(item.scan_history) ? item.scan_history : [];
        mergedItemsMap[item.barcode].scan_history = [...mergedItemsMap[item.barcode].scan_history, ...oldHistory];
      });

      const mergedItemsArray = Object.values(mergedItemsMap);
      const totalCombinedItems = mergedItemsArray.reduce((sum: number, item: any) => sum + item.target_qty, 0);
      const hasStartedPacking = mergedItemsArray.some((item: any) => item.scanned_qty > 0 || item.is_short);
      const newPoName = `MERGED: ${combinedNumbers}`.substring(0, 200); 
      
      const { data: newPo, error: newPoError } = await supabase.from("purchase_orders").insert([{
        po_number: newPoName, retailer_name: retailer, po_date: poDate, delivery_date: deliveryDate, total_items: totalCombinedItems, status: hasStartedPacking ? "Packing" : "Not Started"
      }]).select().single();
      if (newPoError) throw newPoError;

      const itemsToInsert = mergedItemsArray.map((item: any) => ({ ...item, po_id: newPo.id }));
      const { error: insertError } = await supabase.from("po_items").insert(itemsToInsert);
      if (insertError) throw insertError;

      await supabase.from("purchase_orders").delete().in("id", selectedPOs);
      setMessage({ text: `Successfully merged into 1 MASTER PO!`, type: "success" });
      setSelectedPOs([]); fetchPOs(); 
    } catch (error: any) { setMessage({ text: error.message || "Failed to merge.", type: "error" }); } finally { setUploading(false); }
  };

  const formatErpDate = (raw: string) => {
    if (!raw) return "";
    const d = raw.replace(/\D/g, '');
    if (d.length === 8) return `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;
    return raw.substring(0, 15); 
  };

  const get8DigitPO = (poNum: string) => {
    const digits = poNum.replace(/\D/g, '');
    const safeDigits = digits.length > 0 ? digits : Math.floor(Math.random() * 100000000).toString();
    return safeDigits.substring(0,8).padEnd(8, '0');
  };

  const handleFileUpload = async (event: any) => {
    const files = Array.from(event.target.files) as File[];
    if (files.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      setMessage({ text: `Processing file ${f + 1} of ${files.length}: ${file.name}...`, type: "info" });

      try {
        let text = await file.text();
        text = text.replace(/^\uFEFF/, ''); 

        let parsedItems: any[] = [];
        let globalPoNum = "";
        let globalBuyer = "";
        let globalPoDate = "";
        let globalDelDate = "";

        if (activeTab === "DFI") {
          const rawLinesText = text.split(/\r?\n/).filter((line: string) => line.trim().length > 0);
          
          for (let i = 1; i < rawLinesText.length; i++) {
            const line = rawLinesText[i];
            const cols = line.split(/",""|,""|"",|","/);
            const cleanCols = cols.map((c: string) => c.replace(/"/g, '').trim());

            if (cleanCols[0] === 'PO Number' || cleanCols.length < 30) continue; 

            const poNum = cleanCols[0];
            const poDateRaw = cleanCols[1];
            const buyerRaw = cleanCols[3];
            const delDateRaw = cleanCols[23];
            const barcode = cleanCols[25];
            const desc = cleanCols[27];
            const packQty = parseInt(cleanCols[30], 10) || 1;
            const orderQty = parseInt(cleanCols[31], 10) || 0;

            if (!barcode || barcode.length < 5 || barcode.includes('PLU')) continue;

            if (!globalPoNum && poNum) globalPoNum = poNum;
            if (!globalBuyer && buyerRaw) globalBuyer = buyerRaw;
            if (!globalPoDate && poDateRaw) globalPoDate = formatErpDate(poDateRaw);
            if (!globalDelDate && delDateRaw) globalDelDate = formatErpDate(delDateRaw);

            parsedItems.push({
              barcode: barcode,
              productName: desc || "Aeris SKU",
              innerBoxes: orderQty, 
              targetQty: orderQty * packQty 
            });
          }
          if (parsedItems.length === 0) throw new Error(`Data Mapping Error. Check columns!`);
        }

        if (activeTab === "SOCIOLLA" || activeTab === "RESELLER") throw new Error("Module pending setup.");

        const uniqueBarcodes = parsedItems.map((item: any) => item.barcode);
        const { data: masterProducts } = await supabase.from('products').select('barcode, clean_name').in('barcode', uniqueBarcodes);
        const productDictionary: Record<string, string> = {};
        if (masterProducts) masterProducts.forEach((p: any) => { productDictionary[p.barcode] = p.clean_name; });

        const totalItems = parsedItems.reduce((sum: number, item: any) => sum + item.targetQty, 0);       
        const cleanPoNumber = globalPoNum || `PO-${Math.floor(Math.random()*1000)}`;
        const base8PO = get8DigitPO(cleanPoNumber);

        const { data: poData, error: poError } = await supabase.from("purchase_orders").insert([{ 
            po_number: cleanPoNumber, retailer_name: globalBuyer || activeTab, po_date: globalPoDate || 'N/A', delivery_date: globalDelDate || 'N/A', total_items: totalItems, status: "Not Started" 
        }]).select().single();
        if (poError) throw poError;

        const itemsToInsert = parsedItems.map((item: any) => ({
          po_id: poData.id, barcode: item.barcode, product_name: productDictionary[item.barcode] || item.productName || "Aeris SKU",
          inner_boxes: item.innerBoxes, target_qty: item.targetQty, scanned_qty: 0, is_short: false, scan_history: []
        }));

        const { error: itemsError } = await supabase.from("po_items").insert(itemsToInsert).select();
        if (itemsError) throw itemsError;

        const boxesToInsert: any[] = [];
        let universalSequence = 1;
        parsedItems.forEach(item => {
          for (let cartonNo = 1; cartonNo <= item.innerBoxes; cartonNo++) {
            const paddedSeq = String(universalSequence).padStart(5, '0');
            boxesToInsert.push({ po_id: poData.id, product_barcode: item.barcode, box_barcode: `${base8PO}${paddedSeq}`, carton_number: cartonNo, total_cartons: item.innerBoxes, is_scanned: false });
            universalSequence++;
          }
        });

        if (boxesToInsert.length > 0) {
          const { error: boxesError } = await supabase.from("po_boxes").insert(boxesToInsert);
          if (boxesError) throw boxesError;
        }

        successCount++;
      } catch (error: any) { failCount++; }
    }

    setUploading(false); fetchPOs(); event.target.value = null; 
    if (failCount === 0) setMessage({ text: `Success! Bulk processed ${successCount} POs.`, type: "success" });
    else setMessage({ text: `Completed ${successCount} files. Failed on ${failCount} files.`, type: successCount > 0 ? "info" : "error" });
  };

  const activePOs = pos.filter(p => !["Completed", "Partial Fulfillment"].includes(p.status));
  const historyPOs = pos.filter(p => ["Completed", "Partial Fulfillment"].includes(p.status));

  return (
    <div className="min-h-screen bg-gray-50 pb-32"> 
      <div className="max-w-6xl mx-auto p-8">
        <header className="mb-8 border-b pb-4 border-gray-200">
          <h1 className="text-3xl font-bold text-gray-900">Aeris Fulfillment Dashboard</h1>
          <p className="text-gray-500 mt-1">LPN (Inner Box 2FA) Scan-to-Pack Engine</p>
        </header>

        <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mb-8 max-w-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800"><UploadCloud className="text-blue-500" /> Upload PO</h2>
            <div className="flex bg-gray-100 p-1 rounded-lg mt-4 sm:mt-0">
               <button onClick={() => { setActiveTab("DFI"); setMessage({text:"", type:""}); }} className={`px-4 py-2 text-sm font-bold flex items-center gap-2 rounded-md transition ${activeTab === 'DFI' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><Store className="w-4 h-4" /> DFI / Guardian</button>
               <button onClick={() => { setActiveTab("SOCIOLLA"); setMessage({text:"", type:""}); }} className={`px-4 py-2 text-sm font-bold flex items-center gap-2 rounded-md transition ${activeTab === 'SOCIOLLA' ? 'bg-white shadow-sm text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}><Store className="w-4 h-4" /> Sociolla</button>
               <button onClick={() => { setActiveTab("RESELLER"); setMessage({text:"", type:""}); }} className={`px-4 py-2 text-sm font-bold flex items-center gap-2 rounded-md transition ${activeTab === 'RESELLER' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}><Users className="w-4 h-4" /> Resellers</button>
            </div>
          </div>
          <div className={`border-2 border-dashed rounded-xl p-8 text-center transition tracking-wide relative ${activeTab === 'DFI' ? 'border-gray-300 bg-gray-50 hover:bg-gray-100' : activeTab === 'SOCIOLLA' ? 'border-pink-200 bg-pink-50/30 hover:bg-pink-50' : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50'}`}>
            <input type="file" accept=".csv,.txt,.xlsx" multiple onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
            {uploading ? (
              <div className="flex flex-col items-center text-blue-600"><Loader2 className="animate-spin w-8 h-8 mb-2" /><span className="font-semibold">Processing Data...</span></div>
            ) : (
              <div><p className="font-semibold text-lg text-gray-700">Click or Drag <span className="font-bold">{activeTab}</span> Files Here</p><p className="text-sm text-gray-500 mt-1">Multi-file Supported. LPN Mode Enabled.</p></div>
            )}
          </div>
          {message.text && (
            <div className={`mt-4 p-4 rounded-lg font-medium border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : message.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>{message.text}</div>
          )}
        </section>

        <div className="flex gap-4 mb-6 border-b border-gray-200 pb-2">
           <button onClick={() => setViewMode("ACTIVE")} className={`px-6 py-3 font-bold text-lg rounded-t-lg transition-colors border-b-4 ${viewMode === "ACTIVE" ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
             <span className="flex items-center gap-2"><Package className="w-5 h-5" /> Active Queue ({activePOs.length})</span>
           </button>
           <button onClick={() => setViewMode("HISTORY")} className={`px-6 py-3 font-bold text-lg rounded-t-lg transition-colors border-b-4 ${viewMode === "HISTORY" ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
             <span className="flex items-center gap-2"><Archive className="w-5 h-5" /> Historical Archive ({historyPOs.length})</span>
           </button>
        </div>

        <section>          
          {viewMode === "ACTIVE" ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {activePOs.length === 0 ? (
               <div className="col-span-full p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-500 bg-white">All caught up! Active Queue is empty.</div>
             ) : (
               activePOs.map((po: any) => {
                 const isSelected = selectedPOs.includes(po.id);
                 return (
                   <div key={po.id} className={`bg-white border-2 p-6 rounded-xl shadow-sm flex flex-col justify-between transition group relative cursor-default ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 hover:border-black'}`}>
                     
                     <div className="absolute top-4 left-4 z-10 cursor-pointer p-2 -m-2" onClick={() => togglePoSelection(po.id)}>
                       <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                         {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                       </div>
                     </div>

                     <button onClick={() => handleDeletePO(po.id, po.po_number)} className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition opacity-0 group-hover:opacity-100" title="Delete PO"><Trash2 className="w-5 h-5" /></button>
                     <div className="pl-8 pt-1">
                       <div className="flex justify-between items-start mb-3">
                         <h3 className="font-bold text-lg text-gray-900 pr-8 line-clamp-2">PO: {po.po_number}</h3>
                         <span className={`px-2 py-1 flex-shrink-0 text-[0.7rem] font-bold rounded-full ${po.status === 'Completed' ? 'bg-green-100 text-green-700' : po.status === 'Packing' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>{po.status}</span>
                       </div>
                       <p className="text-sm font-bold text-blue-600 mb-4">{po.retailer_name}</p>
                       <div className="flex flex-col gap-2 mt-4 px-3 py-3 bg-gray-50/80 rounded-lg text-sm">
                         <div className="flex justify-between items-center text-gray-600"><span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Received:</span><span className="font-semibold">{po.po_date}</span></div>
                         <div className="flex justify-between items-center text-red-600 bg-red-50 px-2 py-1 -mx-2 rounded"><span className="flex items-center gap-1.5 font-bold"><Truck className="w-4 h-4" /> Deadline:</span><span className="font-bold">{po.delivery_date}</span></div>
                       </div>
                       <p className="text-sm font-semibold text-gray-500 mt-4 px-2 py-1">{po.total_items} Total Units Target</p>
                     </div>
                     
                     <div className="mt-6 flex flex-col gap-2">
                        <Link href={`/labels/${po.id}`}><button className="w-full bg-blue-50 text-blue-700 border border-blue-200 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition"><Printer className="w-4 h-4" /> Print LPN Labels</button></Link>
                        <Link href={`/pack/${po.id}`}><button className="w-full bg-black text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition active:scale-[0.98]">Start 2FA Scan <ArrowRight className="w-4 h-4" /></button></Link>
                     </div>
                   </div>
                 );
               })
             )}
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {historyPOs.length === 0 ? (
               <div className="col-span-full p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-500 bg-white">No history found.</div>
             ) : (
               historyPOs.map((po: any) => {
                 const isSelected = selectedPOs.includes(po.id);

                 return (
                   <div key={po.id} className={`bg-gray-50 border-2 p-6 rounded-xl shadow-sm flex flex-col justify-between transition group relative cursor-default ${isSelected ? 'border-red-500 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}`}>
                     
                     {/* ENABLED CHECKBOX ON HISTORY TAB FOR MASS DELETION */}
                     <div className="absolute top-4 left-4 z-10 cursor-pointer p-2 -m-2" onClick={() => togglePoSelection(po.id)}>
                       <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-red-500 border-red-500' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                         {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                       </div>
                     </div>

                     <button onClick={() => handleDeletePO(po.id, po.po_number)} className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5" /></button>
                     
                     <div className="pl-8 pt-1">
                       <div className="flex justify-between items-start mb-3">
                         <h3 className="font-bold text-lg text-gray-900 pr-8 line-clamp-2">PO: {po.po_number}</h3>
                         <span className={`px-2 py-1 flex-shrink-0 text-[0.7rem] font-bold rounded-full ${po.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{po.status}</span>
                       </div>
                       <p className="text-sm font-bold text-gray-600 mb-4">{po.retailer_name}</p>
                       <div className="flex justify-between items-center bg-gray-200/50 px-3 py-2 rounded mb-2">
                         <span className="text-xs font-bold text-gray-500 uppercase">Packed By</span>
                         <span className="font-bold text-gray-800">{po.packed_by || 'Unknown'}</span>
                       </div>
                     </div>

                     <Link href={`/pack/${po.id}`} className="mt-6 block">
                       <button className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition"><Search className="w-4 h-4" /> View Audit & Reprint</button>
                     </Link>
                   </div>
                 );
               })
             )}
            </div>
          )}
        </section>
      </div>

      {selectedPOs.length > 0 && ( 
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center justify-between gap-8 z-50 w-full max-w-2xl animate-fade-in-up">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xl ${viewMode === 'ACTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
              {selectedPOs.length}
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight">POs Selected</p>
              <p className="text-xs text-gray-500 font-medium">{viewMode === 'ACTIVE' ? "Batch pick or delete" : "Bulk purge archive"}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSelectedPOs([])} className="px-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-1 transition"><X className="w-4 h-4" /> Clear</button>
            <button onClick={handleBulkDelete} disabled={uploading} className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 text-sm font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</button>
            {viewMode === "ACTIVE" && (
              <button onClick={handleMergePOs} disabled={selectedPOs.length < 2 || uploading} className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition"><Combine className="w-4 h-4" /> Merge POs</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}