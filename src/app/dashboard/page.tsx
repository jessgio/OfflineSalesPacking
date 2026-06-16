"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import { UploadCloud, Package, ArrowRight, Loader2, Trash2, Calendar, Truck, Combine, X, Store, Users, Printer, Archive, Search, Box, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { extractPdfTextFromFile } from "../../lib/sociolla/extractPdfText";
import { mapSociollaLinesToProducts } from "../../lib/sociolla/productMapping";
import { parseSociollaPoText } from "../../lib/sociolla/sociollaPoParser";
import { needsCartonPlanning } from "../../lib/sociolla/cartonPlan";
import { DashButton, SurfaceCard } from "../../components/dashboard/primitives";
import {
  DASHBOARD_PO_PAGE_SIZE,
  fetchDashboardPoCount,
  fetchDashboardPosPage,
  type DashboardPoRow,
} from "../../lib/purchaseOrdersDb";

const sourceTabBtnBase = "px-4 py-2 text-sm font-bold flex items-center gap-2 rounded-md transition";
const queueTabBtnBase = "px-6 py-3 font-bold text-lg rounded-t-lg transition-colors border-b-4";
const emptyStateClass =
  "col-span-full p-8 border-2 border-dashed border-gray-200 rounded-xl text-center text-gray-600 bg-white";
const bulkActionBtnBase =
  "text-sm font-bold rounded-lg transition disabled:opacity-50 flex items-center gap-2";

export default function ManagerDashboard() {
  const [pos, setPos] = useState<DashboardPoRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [selectedPOs, setSelectedPOs] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeQueueCount, setActiveQueueCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  
  const [activeTab, setActiveTab] = useState<"DFI" | "SOCIOLLA" | "RESELLER">("DFI");
  const [viewMode, setViewMode] = useState<"ACTIVE" | "HISTORY">("ACTIVE");

  const totalPages = Math.max(1, Math.ceil(totalCount / DASHBOARD_PO_PAGE_SIZE));

  const refreshTabCounts = async () => {
    const [active, history] = await Promise.all([
      fetchDashboardPoCount("ACTIVE"),
      fetchDashboardPoCount("HISTORY"),
    ]);
    setActiveQueueCount(active);
    setHistoryCount(history);
  };

  const fetchPOs = async (targetPage = page) => {
    setListLoading(true);
    try {
      const { rows, totalCount: count } = await fetchDashboardPosPage(viewMode, targetPage);
      setPos(rows);
      setTotalCount(count);
      await refreshTabCounts();
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    setSelectedPOs([]);
    setPage(1);
  }, [viewMode]);

  useEffect(() => {
    setSelectedPOs([]);
  }, [page]);

  useEffect(() => {
    void fetchPOs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, page]);

  const handleDeletePO = async (id: string, poNumber: string) => {
    const isConfirmed = window.confirm(`DANGER: Are you absolutely sure you want to completely delete PO ${poNumber}? \n\nNote: If this is a finished order, you can just leave it in the Historical Archive!`);
    if (!isConfirmed) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (!error) {
      setSelectedPOs((prev: string[]) => prev.filter((poId: string) => poId !== id));
      void fetchPOs();
    }
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
      const { data: posToMerge, error: mergeFetchError } = await supabase
        .from("purchase_orders")
        .select("id, po_number, retailer_name, po_date, delivery_date")
        .in("id", selectedPOs);
      if (mergeFetchError) throw mergeFetchError;
      if (!posToMerge?.length) throw new Error("Could not load selected POs for merge.");
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

      // BOX LPN GENERATION FOR MERGED PO
      const boxesToInsert: any[] = [];
      let universalSequence = 1;
      let globalCartonNo = 1; 
      const base8PO = get8DigitPO(newPoName);
      const globalTotalBoxes = mergedItemsArray.reduce((sum: number, item: any) => sum + item.inner_boxes, 0);

      mergedItemsArray.forEach((item: any) => {
        for (let i = 0; i < item.inner_boxes; i++) {
          const paddedSeq = String(universalSequence).padStart(5, '0');
          boxesToInsert.push({
            po_id: newPo.id, product_barcode: item.barcode, box_barcode: `${base8PO}${paddedSeq}`,
            carton_number: globalCartonNo, total_cartons: globalTotalBoxes, is_scanned: false
          });
          universalSequence++;
          globalCartonNo++;
        }
      });

      if (boxesToInsert.length > 0) {
        await supabase.from("po_boxes").insert(boxesToInsert);
      }

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
    let errorLogs: string[] = [];

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
        let sociollaUnmapped: string[] = [];
        const isSociolla = activeTab === "SOCIOLLA";

        // ====================================================================
        // DFI STRICT PARSER
        // ====================================================================
        if (activeTab === "DFI") {
          
          const parseStandardCSV = (str: string) => {
            const rows = [];
            let row = [];
            let curr = '';
            let inQuotes = false;
            for (let i = 0; i < str.length; i++) {
              const char = str[i];
              const nextChar = str[i + 1];
              
              if (char === '"' && inQuotes && nextChar === '"') {
                curr += '"'; i++;
              } else if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                row.push(curr.trim()); curr = '';
              } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') i++; 
                row.push(curr.trim());
                rows.push(row);
                row = []; curr = '';
              } else {
                curr += char;
              }
            }
            row.push(curr.trim());
            if (row.length > 0) rows.push(row);
            return rows.filter(r => r.join('').trim().length > 0);
          };

          const grid = parseStandardCSV(text);

          if (grid.length < 2) throw new Error("File formatting is completely empty.");

          const findColumnIndex = (row: string[], aliases: string[], exclude: string[] = []) => {
            for (let alias of aliases) {
              const exactIdx = row.findIndex((c: string) => {
                 const cleanC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
                 return cleanC === alias.replace(/[^a-z0-9]/g, '') && !exclude.some(ex => cleanC.includes(ex));
              });
              if (exactIdx !== -1) return exactIdx;
            }
            for (let alias of aliases) {
              const partialIdx = row.findIndex((c: string) => {
                 const cleanC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
                 return cleanC.includes(alias.replace(/[^a-z0-9]/g, '')) && !exclude.some(ex => cleanC.includes(ex));
              });
              if (partialIdx !== -1) return partialIdx;
            }
            return -1;
          };

          let hRow = -1;
          let colMap = { po: -1, buyer: -1, barcode: -1, desc: -1, qty: -1, pack: -1, poDate: -1, delDate: -1 };

          for (let i = 0; i < Math.min(grid.length, 30); i++) {
            const row = grid[i];

            const barcodeIdx = findColumnIndex(row, ['codeplu', 'barcode', 'plu', 'upc', 'ean', 'sku']);
            const qtyIdx = findColumnIndex(row, ['orderquantity', 'qty', 'quantity', 'amount'], ['pack', 'inner']);

            if (barcodeIdx !== -1 && qtyIdx !== -1) {
              hRow = i; 
              colMap.barcode = barcodeIdx;
              colMap.qty = qtyIdx;
              colMap.desc = findColumnIndex(row, ['productdescription', 'description', 'name', 'product', 'item']);
              colMap.pack = findColumnIndex(row, ['packquantity', 'pack', 'inner', 'caseqty']);
              colMap.po = findColumnIndex(row, ['ponumber', 'purchaseorder', 'orderid']);
              colMap.poDate = findColumnIndex(row, ['podate', 'orderdate']);
              colMap.delDate = findColumnIndex(row, ['deliverydate', 'deadline', 'shipdate', 'delivery']);
              colMap.buyer = findColumnIndex(row, ['buyername', 'retailername', 'storename', 'buyer']);
              break;
            }
          }

          if (hRow === -1 || colMap.barcode === -1) {
            throw new Error(`Could not find Barcode or valid Order Quantity headers.`);
          }

          for (let i = hRow + 1; i < grid.length; i++) {
            const cols = grid[i];
            const barcode = cols[colMap.barcode];
            
            if (!barcode || barcode.length < 5 || barcode.includes('PLU')) continue;

            if (!globalPoNum && colMap.po !== -1 && cols[colMap.po]) globalPoNum = cols[colMap.po];
            if (!globalBuyer && colMap.buyer !== -1 && cols[colMap.buyer]) globalBuyer = cols[colMap.buyer];
            if (!globalPoDate && colMap.poDate !== -1 && cols[colMap.poDate]) globalPoDate = formatErpDate(cols[colMap.poDate]);
            if (!globalDelDate && colMap.delDate !== -1 && cols[colMap.delDate]) globalDelDate = formatErpDate(cols[colMap.delDate]);

            const orderQty = colMap.qty !== -1 ? parseInt(cols[colMap.qty], 10) || 0 : 0;
            const packQty = colMap.pack !== -1 ? parseInt(cols[colMap.pack], 10) || 1 : 1; 

            parsedItems.push({
              barcode: barcode,
              productName: colMap.desc !== -1 ? cols[colMap.desc] : "Aeris SKU",
              innerBoxes: orderQty, 
              targetQty: orderQty * packQty 
            });
          }

          if (parsedItems.length === 0) throw new Error("Headers found, but no items detected below them.");
        }

        if (activeTab === "SOCIOLLA") {
          const sociollaText = file.name.toLowerCase().endsWith(".pdf")
            ? await extractPdfTextFromFile(file)
            : text;

          if (!sociollaText.trim()) throw new Error("Could not read text from Sociolla PDF.");

          const parsed = parseSociollaPoText(sociollaText);
          globalPoNum = parsed.poNumber;
          globalBuyer = parsed.retailerName;
          globalPoDate = parsed.poDate;
          globalDelDate = parsed.deliveryDate;

          const sociollaSkus = parsed.lines.map((line) => line.sociollaSku);
          const { data: sociollaProducts } = await supabase
            .from("products")
            .select("barcode, clean_name, sociolla_sku")
            .in("sociolla_sku", sociollaSkus);

          const { mapped, unmappedSkus } = mapSociollaLinesToProducts(parsed.lines, sociollaProducts ?? []);
          sociollaUnmapped = unmappedSkus;

          parsedItems = mapped.map((line) => ({
            barcode: line.barcode,
            retailerSku: line.sociollaSku,
            productName: line.productName,
            innerBoxes: 0,
            targetQty: line.targetQty,
          }));

          if (parsedItems.length === 0) throw new Error("No Sociolla line items found in file.");
        }

        if (activeTab === "RESELLER") throw new Error("Module under construction.");

        // =============================================================
        // UNIVERSAL DATABASE SAVE LOGIC
        // =============================================================
        const uniqueBarcodes = parsedItems.map((item: any) => item.barcode);
        let productDictionary: Record<string, string> = {};

        if (isSociolla) {
          parsedItems.forEach((item: any) => {
            productDictionary[item.barcode] = item.productName;
          });
        } else {
          const { data: masterProducts } = await supabase.from('products').select('barcode, clean_name').in('barcode', uniqueBarcodes);
          if (masterProducts) {
            masterProducts.forEach((p: any) => { productDictionary[p.barcode] = p.clean_name; });
          }
        }

        const totalItems = parsedItems.reduce((sum: number, item: any) => sum + item.targetQty, 0);       
        const cleanPoNumber = globalPoNum || `PO-${Math.floor(Math.random()*1000)}`;
        const base8PO = isSociolla ? "" : get8DigitPO(cleanPoNumber);

        const { data: poData, error: poError } = await supabase
          .from("purchase_orders")
          .insert([{ 
              po_number: cleanPoNumber, 
              retailer_name: globalBuyer || activeTab,
              po_date: globalPoDate || 'N/A',
              delivery_date: globalDelDate || 'N/A',
              total_items: totalItems,
              status: "Not Started",
              carton_plan_status: isSociolla ? "draft" : null,
          }])
          .select()
          .single();

        if (poError) throw new Error(`Database Error (PO): ${poError.message}`);

        const itemsToInsert = parsedItems.map((item: any) => ({
          po_id: poData.id,
          barcode: item.barcode,
          retailer_sku: item.retailerSku ?? null,
          product_name: productDictionary[item.barcode] || item.productName || "Aeris SKU",
          inner_boxes: item.innerBoxes, 
          target_qty: item.targetQty,
          scanned_qty: 0,
          scan_history: []
        }));

        const { error: itemsError } = await supabase.from("po_items").insert(itemsToInsert).select();
        if (itemsError) throw new Error(`Database Error (Items): ${itemsError.message}`);

        if (isSociolla) {
          const { error: planError } = await supabase.from("po_carton_plans").insert({
            po_id: poData.id,
            plan: [],
          });
          if (planError) throw new Error(`Database Error (Carton plan): ${planError.message}`);
        }

        const boxesToInsert: any[] = [];
        const globalTotalBoxes = parsedItems.reduce((sum: number, item: any) => sum + item.innerBoxes, 0);

        if (!isSociolla) {
          let universalSequence = 1;
          let globalCartonNo = 1;

          parsedItems.forEach((item) => {
            for (let i = 0; i < item.innerBoxes; i++) {
              const paddedSeq = String(universalSequence).padStart(5, "0");
              const uniqueBoxBarcode = `${base8PO}${paddedSeq}`;

              boxesToInsert.push({
                po_id: poData.id,
                product_barcode: item.barcode,
                box_barcode: uniqueBoxBarcode,
                carton_number: globalCartonNo,
                total_cartons: globalTotalBoxes,
                is_scanned: false,
              });
              universalSequence++;
              globalCartonNo++;
            }
          });
        }

        if (boxesToInsert.length > 0) {
          const { error: boxesError } = await supabase.from("po_boxes").insert(boxesToInsert);
          if (boxesError) throw new Error(`Database Error (Boxes): ${boxesError.message}`);
        }

        successCount++;
        if (sociollaUnmapped.length > 0) {
          errorLogs.push(
            `${file.name}: imported with ${sociollaUnmapped.length} unmapped Sociolla SKU(s) — add sociolla_sku in products: ${sociollaUnmapped.slice(0, 5).join(", ")}${sociollaUnmapped.length > 5 ? "…" : ""}`
          );
        }

      } catch (error: any) {
        console.error(`Upload error on ${file.name}:`, error);
        errorLogs.push(`${file.name}: ${error.message}`);
        failCount++;
      }
    }

    setUploading(false); fetchPOs(); event.target.value = null; 
    
    const unmappedWarnings = errorLogs.filter((e) => e.includes("unmapped Sociolla"));
    const hardErrors = errorLogs.filter((e) => !e.includes("unmapped Sociolla"));

    if (failCount === 0 && hardErrors.length === 0) {
      const warnText = unmappedWarnings.length ? ` Warnings: ${unmappedWarnings.join(" | ")}` : "";
      setMessage({ text: `Success! Bulk processed ${successCount} PO(s).${warnText}`, type: unmappedWarnings.length ? "info" : "success" });
    } else {
      setMessage({ text: `Failed on ${failCount} file(s). ${[...hardErrors, ...unmappedWarnings].join(" | ")}`, type: "error" });
    }
  };

  const visiblePOs = pos;
  const showPagination = totalCount > DASHBOARD_PO_PAGE_SIZE;

  return (
    <div className="min-h-screen bg-gray-50 pb-32"> 
      <div className="max-w-6xl mx-auto p-8">
        <header className="mb-8 border-b pb-4 border-gray-200 flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Aeris Fulfillment Dashboard</h1>
            <p className="text-gray-600 mt-1">LPN (Inner Box 2FA) Scan-to-Pack Engine</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/marketing/fulfill">
              <DashButton variant="primary" size="lg" className="bg-violet-600 rounded-xl hover:bg-violet-700 shadow-sm">
                <Package className="w-5 h-5" /> Marketing Fulfillment
              </DashButton>
            </Link>
            <Link href="/master-ship">
              <DashButton variant="primary" size="lg" className="bg-purple-600 rounded-xl hover:bg-purple-700 shadow-sm">
                <Box className="w-5 h-5" /> Master Box Shipping
              </DashButton>
            </Link>
          </div>
        </header>

        <SurfaceCard className="p-8 mb-8 max-w-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b pb-4">
            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800"><UploadCloud className="text-blue-500" /> Upload PO</h2>
            <div className="flex bg-gray-100 p-1 rounded-lg mt-4 sm:mt-0">
               <DashButton onClick={() => { setActiveTab("DFI"); setMessage({text:"", type:""}); }} className={`${sourceTabBtnBase} ${activeTab === 'DFI' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-700'}`}><Store className="w-4 h-4" /> DFI / Guardian</DashButton>
               <DashButton onClick={() => { setActiveTab("SOCIOLLA"); setMessage({text:"", type:""}); }} className={`${sourceTabBtnBase} ${activeTab === 'SOCIOLLA' ? 'bg-white shadow-sm text-pink-600' : 'text-gray-600 hover:text-gray-700'}`}><Store className="w-4 h-4" /> Sociolla</DashButton>
               <DashButton onClick={() => { setActiveTab("RESELLER"); setMessage({text:"", type:""}); }} className={`${sourceTabBtnBase} ${activeTab === 'RESELLER' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-600 hover:text-gray-700'}`}><Users className="w-4 h-4" /> Resellers</DashButton>
            </div>
          </div>
          <div className={`border-2 border-dashed rounded-xl p-8 text-center transition tracking-wide relative ${activeTab === 'DFI' ? 'border-gray-300 bg-gray-50 hover:bg-gray-100' : activeTab === 'SOCIOLLA' ? 'border-pink-200 bg-pink-50/30 hover:bg-pink-50' : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50'}`}>
            <input type="file" accept={activeTab === "SOCIOLLA" ? ".pdf" : ".csv,.txt,.xlsx"} multiple onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
            {uploading ? (
              <div className="flex flex-col items-center text-blue-600"><Loader2 className="animate-spin w-8 h-8 mb-2" /><span className="font-semibold">Processing Data...</span></div>
            ) : (
              <div><p className="font-semibold text-lg text-gray-700">Click or Drag <span className="font-bold">{activeTab}</span> Files Here</p><p className="text-sm text-gray-600 mt-1">{activeTab === "SOCIOLLA" ? "Upload PDF file. Set inner box first, then print LPN labels." : "Multi-file supported. LPN mode enabled."}</p></div>
            )}
          </div>
          {message.text && (
            <div className={`mt-4 p-4 rounded-lg font-medium border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : message.type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>{message.text}</div>
          )}
        </SurfaceCard>

        <div className="flex gap-4 mb-6 border-b border-gray-200 pb-2">
           <DashButton onClick={() => setViewMode("ACTIVE")} className={`${queueTabBtnBase} rounded-t-lg rounded-b-none ${viewMode === "ACTIVE" ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
             <span className="flex items-center gap-2"><Package className="w-5 h-5" /> Active Queue ({activeQueueCount})</span>
           </DashButton>
           <DashButton onClick={() => setViewMode("HISTORY")} className={`${queueTabBtnBase} rounded-t-lg rounded-b-none ${viewMode === "HISTORY" ? 'border-gray-800 text-gray-900' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>
             <span className="flex items-center gap-2"><Archive className="w-5 h-5" /> Historical Archive ({historyCount})</span>
           </DashButton>
        </div>

        <section>
          {listLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-blue-600">
              <Loader2 className="animate-spin w-8 h-8 mb-3" />
              <p className="text-sm font-semibold text-gray-600">Loading purchase orders…</p>
            </div>
          ) : viewMode === "ACTIVE" ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {visiblePOs.length === 0 ? (
               <div className={emptyStateClass}>All caught up! Active Queue is empty.</div>
             ) : (
               visiblePOs.map((po) => {
                 const isSelected = selectedPOs.includes(po.id);
                 return (
                   <div key={po.id} className={`bg-white border-2 p-6 rounded-xl shadow-sm flex flex-col justify-between transition group relative cursor-default ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200 hover:border-black'}`}>
                     <div className="absolute top-4 left-4 z-10 cursor-pointer p-2 -m-2" onClick={() => togglePoSelection(po.id)}>
                       <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                         {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                       </div>
                     </div>
                    <DashButton onClick={() => handleDeletePO(po.id, po.po_number)} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100" title="Delete PO"><Trash2 className="w-5 h-5" /></DashButton>
                     <div className="pl-8 pt-1">
                       <div className="flex justify-between items-start mb-3">
                         <h3 className="font-bold text-lg text-gray-900 pr-8 line-clamp-2">PO: {po.po_number}</h3>
                         <span className={`px-2 py-1 flex-shrink-0 text-[0.7rem] font-bold rounded-full ${po.status === 'Completed' ? 'bg-green-100 text-green-700' : po.status === 'Packing' ? 'bg-yellow-100 text-yellow-700' : needsCartonPlanning(po) ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-700'}`}>{needsCartonPlanning(po) ? 'Planning' : po.status}</span>
                       </div>
                       <p className="text-sm font-bold text-blue-600 mb-4">{po.retailer_name}</p>
                       <div className="flex flex-col gap-2 mt-4 px-3 py-3 bg-gray-50/80 rounded-lg text-sm">
                         <div className="flex justify-between items-center text-gray-600"><span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Received:</span><span className="font-semibold">{po.po_date}</span></div>
                         <div className="flex justify-between items-center text-red-600 bg-red-50 px-2 py-1 -mx-2 rounded"><span className="flex items-center gap-1.5 font-bold"><Truck className="w-4 h-4" /> Deadline:</span><span className="font-bold">{po.delivery_date}</span></div>
                       </div>
                     </div>
                     <div className="mt-6 flex flex-col gap-2">
                        {needsCartonPlanning(po) ? (
                         <Link href={`/plan/${po.id}`}><DashButton className="w-full bg-pink-600 text-white py-3 hover:bg-pink-700"><LayoutGrid className="w-4 h-4" /> Plan Inner Boxes</DashButton></Link>
                        ) : (
                          <>
                            <Link href={`/labels/${po.id}`}><DashButton variant="subtle" size="lg" className="w-full border py-3"><Printer className="w-4 h-4" /> Print LPN Labels</DashButton></Link>
                            <Link href={`/pack/${po.id}`}><DashButton variant="dark" size="lg" className="w-full py-3 active:scale-[0.98]">Start 2FA Scan <ArrowRight className="w-4 h-4" /></DashButton></Link>
                          </>
                        )}
                     </div>
                   </div>
                 );
               })
             )}
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {visiblePOs.length === 0 ? (
               <div className={emptyStateClass}>No history found.</div>
             ) : (
               visiblePOs.map((po) => {
                 const isSelected = selectedPOs.includes(po.id);
                 return (
                   <div key={po.id} className={`bg-gray-50 border-2 p-6 rounded-xl shadow-sm flex flex-col justify-between transition group relative cursor-default ${isSelected ? 'border-red-500 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}`}>
                     <div className="absolute top-4 left-4 z-10 cursor-pointer p-2 -m-2" onClick={() => togglePoSelection(po.id)}>
                       <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-red-500 border-red-500' : 'bg-white border-gray-300 group-hover:border-gray-400'}`}>
                         {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                       </div>
                     </div>
                    <DashButton onClick={() => handleDeletePO(po.id, po.po_number)} className="absolute top-4 right-4 p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5" /></DashButton>
                     <div className="pl-8 pt-1">
                       <div className="flex justify-between items-start mb-3">
                         <h3 className="font-bold text-lg text-gray-900 pr-8 line-clamp-2">PO: {po.po_number}</h3>
                         <span className={`px-2 py-1 flex-shrink-0 text-[0.7rem] font-bold rounded-full ${po.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{po.status}</span>
                       </div>
                       <p className="text-sm font-bold text-gray-600 mb-4">{po.retailer_name}</p>
                       <div className="flex justify-between items-center bg-gray-200/50 px-3 py-2 rounded mb-2">
                         <span className="text-xs font-bold text-gray-600 uppercase">Packed By</span>
                         <span className="font-bold text-gray-800">{po.packed_by || 'Unknown'}</span>
                       </div>
                     </div>
                    <Link href={`/pack/${po.id}`} className="mt-6 block">
                      <DashButton className="w-full bg-white border-2 border-gray-300 text-gray-700 py-3 hover:bg-gray-100"><Search className="w-4 h-4" /> View Audit & Reprint</DashButton>
                    </Link>
                   </div>
                 );
               })
             )}
            </div>
          )}

          {showPagination && !listLoading && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-200 pt-6">
              <p className="text-sm text-gray-600">
                Showing {(page - 1) * DASHBOARD_PO_PAGE_SIZE + 1}–
                {Math.min(page * DASHBOARD_PO_PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <DashButton
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  variant="subtle"
                  size="sm"
                  className="px-4 py-2"
                >
                  Previous
                </DashButton>
                <span className="text-sm font-semibold text-gray-700 px-2">
                  Page {page} of {totalPages}
                </span>
                <DashButton
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  variant="subtle"
                  size="sm"
                  className="px-4 py-2"
                >
                  Next
                </DashButton>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedPOs.length > 0 && ( 
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center justify-between gap-8 z-50 w-full max-w-2xl">
          <div className="flex items-center gap-4">
             <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xl ${viewMode === 'ACTIVE' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>{selectedPOs.length}</div>
             <div><p className="font-bold text-gray-900 leading-tight">POs Selected</p><p className="text-xs text-gray-600 font-medium">{viewMode === 'ACTIVE' ? "Batch pick or delete" : "Bulk purge archive"}</p></div>
          </div>
          <div className="flex gap-2">
            <DashButton onClick={() => setSelectedPOs([])} variant="ghost" size="sm" className="text-gray-600"><X className="w-4 h-4" /> Clear</DashButton>
            <DashButton onClick={handleBulkDelete} disabled={uploading} variant="danger" size="md" className={bulkActionBtnBase}><Trash2 className="w-4 h-4" /> Delete</DashButton>
            {viewMode === "ACTIVE" && (
              <DashButton onClick={handleMergePOs} disabled={selectedPOs.length < 2 || uploading} variant="primary" size="md" className={bulkActionBtnBase}><Combine className="w-4 h-4" /> Merge POs</DashButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
