"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { UploadCloud, Package, ArrowRight, Loader2, Trash2, Calendar, Truck, Combine, X } from "lucide-react";
import Link from "next/link";

export default function ManagerDashboard() {
  const [pos, setPos] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  
  const [selectedPOs, setSelectedPOs] = useState<string[]>([]);

  useEffect(() => {
    fetchPOs();
  }, []);

  const fetchPOs = async () => {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setPos(data);
  };

  const handleDeletePO = async (id: string, poNumber: string) => {
    const isConfirmed = window.confirm(`DANGER: Are you absolutely sure you want to delete PO ${poNumber}?`);
    if (!isConfirmed) return;

    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (!error) {
      setSelectedPOs((prev: string[]) => prev.filter((poId: string) => poId !== id)); 
      fetchPOs(); 
    }
  };

  const formatErpDate = (raw: string) => {
    const d = raw.replace(/\D/g, '');
    if (d.length === 8) return `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;
    return raw;
  };

  const togglePoSelection = (id: string) => {
    setSelectedPOs((prev: string[]) => 
      prev.includes(id) ? prev.filter((poId: string) => poId !== id) : [...prev, id]
    );
  };

  const handleMergePOs = async () => {
    const isConfirmed = window.confirm(`Merge ${selectedPOs.length} POs? This will combine all items into one Master PO and delete the originals.`);
    if (!isConfirmed) return;

    setUploading(true);
    setMessage({ text: "Aggregating POs...", type: "info" });

    try {
      const posToMerge = pos.filter((p: any) => selectedPOs.includes(p.id));
      const combinedNumbers = posToMerge.map((p: any) => p.po_number).join(' + ');
      
      const retailer = posToMerge[0].retailer_name; 
      const poDate = posToMerge[0].po_date;
      const deliveryDate = posToMerge[0].delivery_date;

      const { data: allItems, error: itemsError } = await supabase
        .from("po_items")
        .select("*")
        .in("po_id", selectedPOs);

      if (itemsError) throw itemsError;

      const mergedItemsMap: Record<string, any> = {};
      
      allItems.forEach((item: any) => {
        if (!mergedItemsMap[item.barcode]) {
          mergedItemsMap[item.barcode] = {
            barcode: item.barcode,
            product_name: item.product_name,
            target_qty: 0,
            inner_boxes: 0,
            scanned_qty: 0,
            scan_history: []
          };
        }
        mergedItemsMap[item.barcode].target_qty += item.target_qty;
        mergedItemsMap[item.barcode].inner_boxes += item.inner_boxes;
        mergedItemsMap[item.barcode].scanned_qty += item.scanned_qty;
        
        const oldHistory = Array.isArray(item.scan_history) ? item.scan_history : [];
        mergedItemsMap[item.barcode].scan_history = [...mergedItemsMap[item.barcode].scan_history, ...oldHistory];
      });

      const mergedItemsArray = Object.values(mergedItemsMap);
      const totalCombinedItems = mergedItemsArray.reduce((sum: number, item: any) => sum + item.target_qty, 0);
      const hasStartedPacking = mergedItemsArray.some((item: any) => item.scanned_qty > 0);

      const newPoName = `MERGED: ${combinedNumbers}`.substring(0, 200); 
      
      const { data: newPo, error: newPoError } = await supabase
        .from("purchase_orders")
        .insert([{
          po_number: newPoName,
          retailer_name: retailer,
          po_date: poDate,
          delivery_date: deliveryDate,
          total_items: totalCombinedItems,
          status: hasStartedPacking ? "Packing" : "Not Started"
        }])
        .select()
        .single();

      if (newPoError) throw newPoError;

      const itemsToInsert = mergedItemsArray.map((item: any) => ({
        ...item,
        po_id: newPo.id
      }));

      const { error: insertError } = await supabase.from("po_items").insert(itemsToInsert);
      if (insertError) throw insertError;

      const { error: deleteError } = await supabase.from("purchase_orders").delete().in("id", selectedPOs);
      if (deleteError) throw deleteError;

      setMessage({ text: `Successfully merged into 1 MASTER PO!`, type: "success" });
      setSelectedPOs([]); 
      fetchPOs(); 

    } catch (error: any) {
      setMessage({ text: error.message || "Failed to merge POs.", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (event: any) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setMessage({ text: "Slicing Aeris ERP Export...", type: "info" });

    try {
      let text = await file.text();
      text = text.replace(/^\uFEFF/, ''); 
      const lines = text.split(/\r?\n/).filter((line: string) => line.trim().length > 0);

      const headerLine = lines[0];
      const rawHeaders = headerLine.split(/",""|,""|"",|","/);
      
      // FIXED TYPE ERRORS (Added :string)
      const headers = rawHeaders.map((h: string) => h.replace(/"/g, '').trim());

      const iPo = headers.findIndex((h: string) => h.includes('PO Number'));
      const iBuyer = headers.findIndex((h: string) => h.includes('Buyer Name'));
      const iPlu = headers.findIndex((h: string) => h.includes('Code - PLU'));
      const iDesc = headers.findIndex((h: string) => h.includes('Product Description'));
      const iQty = headers.findIndex((h: string) => h.includes('Order Quantity'));
      const iPackQty = headers.findIndex((h: string) => h.includes('Pack Quantity'));
      const iPoDate = headers.findIndex((h: string) => h.includes('PO Date'));
      const iDelivDate = headers.findIndex((h: string) => h.includes('Delivery Date'));

      if (iPlu === -1) throw new Error("CRITICAL: 'Code - PLU' not found.");

      const parsedItems: any[] = [];
      let globalPoNumber = "Unknown PO";
      let globalBuyerName = "Aeris Retailer";
      let globalPoDate = "";
      let globalDelivDate = "";

      for (let i = 1; i < lines.length; i++) {
        const rowLine = lines[i];
        const rawCols = rowLine.split(/",""|,""|"",|","/);
        
        // FIXED TYPE ERRORS (Added :string)
        const cols = rawCols.map((c: string) => c.replace(/"/g, '').trim());

        const barcode = cols[iPlu];
        if (!barcode || barcode.length < 5) continue;

        if (globalPoNumber === "Unknown PO" && iPo !== -1 && cols[iPo]) globalPoNumber = cols[iPo];
        if (globalBuyerName === "Aeris Retailer" && iBuyer !== -1 && cols[iBuyer]) globalBuyerName = cols[iBuyer];
        if (!globalPoDate && iPoDate !== -1 && cols[iPoDate]) globalPoDate = formatErpDate(cols[iPoDate]);
        if (!globalDelivDate && iDelivDate !== -1 && cols[iDelivDate]) globalDelivDate = formatErpDate(cols[iDelivDate]);

        const orderQty = iQty !== -1 ? parseInt(cols[iQty], 10) || 0 : 0;
        const packQty = iPackQty !== -1 ? parseInt(cols[iPackQty], 10) || 1 : 1; 

        parsedItems.push({
          barcode: barcode,
          productName: iDesc !== -1 ? cols[iDesc] : "Aeris SKU",
          innerBoxes: orderQty, 
          targetQty: orderQty * packQty 
        });
      }

      if (parsedItems.length === 0) throw new Error("Could not detect any line items.");

      setMessage({ text: "Cross-referencing Master Catalog...", type: "info" });
      const uniqueBarcodes = parsedItems.map((item: any) => item.barcode);
      const { data: masterProducts } = await supabase.from('products').select('barcode, clean_name').in('barcode', uniqueBarcodes);

      const productDictionary: Record<string, string> = {};
      if (masterProducts) {
        masterProducts.forEach((p: any) => { productDictionary[p.barcode] = p.clean_name; });
      }

      const totalItems = parsedItems.reduce((sum: number, item: any) => sum + item.targetQty, 0);

      const { data: poData, error: poError } = await supabase
        .from("purchase_orders")
        .insert([{ 
            po_number: globalPoNumber, 
            retailer_name: globalBuyerName,
            po_date: globalPoDate || 'N/A',
            delivery_date: globalDelivDate || 'N/A',
            total_items: totalItems,
            status: "Not Started" 
        }])
        .select()
        .single();

      if (poError) throw poError;

      const itemsToInsert = parsedItems.map((item: any) => ({
        po_id: poData.id,
        barcode: item.barcode,
        product_name: productDictionary[item.barcode] || item.productName,
        inner_boxes: item.innerBoxes, 
        target_qty: item.targetQty,
        scanned_qty: 0,
        scan_history: []
      }));

      const { error: itemsError } = await supabase.from("po_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      setMessage({ text: `Success! PO ${globalPoNumber} added.`, type: "success" });
      fetchPOs(); 
      event.target.value = null; 

    } catch (error: any) {
      setMessage({ text: error.message, type: "error" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32"> 
      <div className="max-w-6xl mx-auto p-8">
        <header className="mb-8 border-b pb-4 border-gray-200">
          <h1 className="text-3xl font-bold text-gray-900">Aeris Fulfillment Dashboard</h1>
          <p className="text-gray-500 mt-1">Scan-to-Pack Management System</p>
        </header>

        {/* UPLOAD ZONE */}
        <section className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mb-8 max-w-2xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-800">
            <UploadCloud className="text-blue-500" /> Upload New PO
          </h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50 hover:bg-gray-100 transition relative">
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
            {uploading ? (
              <div className="flex flex-col items-center text-blue-600">
                <Loader2 className="animate-spin w-8 h-8 mb-2" />
                <span className="font-semibold">Processing Data...</span>
              </div>
            ) : (
              <div>
                <p className="font-semibold text-lg text-gray-700">Click or Drag File here</p>
                <p className="text-sm text-gray-500 mt-1">Auto-corrects malformed Aeris ERP output</p>
              </div>
            )}
          </div>

          {message.text && (
            <div className={`mt-4 p-4 rounded-lg font-medium border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : message.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
              {message.text}
            </div>
          )}
        </section>

        {/* PO QUEUE ZONE */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Package className="text-gray-800" />
            <h2 className="text-xl font-bold text-gray-800">Active Packing Queue</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pos.length === 0 ? (
              <div className="col-span-full p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-500 bg-white">
                Queue is empty. Upload to start.
              </div>
            ) : (
              pos.map((po: any) => {
                const isSelected = selectedPOs.includes(po.id);

                return (
                  <div 
                    key={po.id} 
                    className={`bg-white border-2 p-6 rounded-xl shadow-sm flex flex-col justify-between transition group relative cursor-default ${
                      isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 hover:border-black'
                    }`}
                  >
                    
                    <div className="absolute top-4 left-4 z-10 cursor-pointer p-2 -m-2" onClick={() => togglePoSelection(po.id)}>
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover:border-gray-400'
                      }`}>
                        {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>

                    <button onClick={() => handleDeletePO(po.id, po.po_number)} className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition opacity-0 group-hover:opacity-100" title="Delete PO">
                      <Trash2 className="w-5 h-5" />
                    </button>

                    <div className="pl-8 pt-1">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-bold text-lg text-gray-900 pr-8 line-clamp-2">PO: {po.po_number}</h3>
                        <span className={`px-2 py-1 flex-shrink-0 text-[0.7rem] font-bold rounded-full ${po.status === 'Completed' ? 'bg-green-100 text-green-700' : po.status === 'Packing' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'}`}>
                          {po.status}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-blue-600 mb-4">{po.retailer_name}</p>
                      
                      <div className="flex flex-col gap-2 mt-4 px-3 py-3 bg-gray-50/80 rounded-lg text-sm">
                        <div className="flex justify-between items-center text-gray-600">
                          <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Received:</span>
                          <span className="font-semibold">{po.po_date}</span>
                        </div>
                        <div className="flex justify-between items-center text-red-600 bg-red-50 px-2 py-1 -mx-2 rounded">
                          <span className="flex items-center gap-1.5 font-bold"><Truck className="w-4 h-4" /> Deadline:</span>
                          <span className="font-bold">{po.delivery_date}</span>
                        </div>
                      </div>

                      <p className="text-sm font-semibold text-gray-500 mt-4 px-2 py-1">
                        {po.total_items} Total Units (Actual Picks)
                      </p>
                    </div>
                    
                    <Link href={`/pack/${po.id}`} className="mt-6 block">
                      <button className="w-full bg-black text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-gray-800 transition active:scale-[0.98]">
                        Start Packing <ArrowRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {selectedPOs.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center justify-between gap-8 z-50 w-full max-w-2xl animate-fade-in-up">
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 text-blue-800 w-10 h-10 rounded-full flex items-center justify-center font-black text-xl">
              {selectedPOs.length}
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight">POs Selected</p>
              <p className="text-xs text-gray-500 font-medium">Batch pick to save time</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button onClick={() => setSelectedPOs([])} className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg flex items-center gap-2 transition">
              <X className="w-4 h-4" /> Clear
            </button>
            <button onClick={handleMergePOs} disabled={selectedPOs.length < 2 || uploading} className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition shadow-md shadow-blue-200">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Combine className="w-4 h-4" />} 
              Merge POs
            </button>
          </div>
        </div>
      )}

    </div>
  );
}