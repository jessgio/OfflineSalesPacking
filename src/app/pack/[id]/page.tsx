"use client";

import { useState, useEffect, useRef, use } from "react";
import { supabase } from "../../../lib/supabaseClient";
// ADDED CALENDAR AND TRUCK HERE VVV
import { ArrowLeft, CheckCircle2, AlertOctagon, ScanLine, Loader2, UserCircle, QrCode, Lock, Search, Filter, AlertTriangle, Printer, RotateCcw, Calendar, Truck } from "lucide-react";
import Link from "next/link";

export default function PackStation(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params); 
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]); 
  const [barcodeInput, setBarcodeInput] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("status");
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [stagedProductBarcode, setStagedProductBarcode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState({ message: "Scan a Product or LPN Box Label to begin.", type: "default" });

  const [packerName, setPackerName] = useState("");
  const [isClaimed, setIsClaimed] = useState(false);
  const claimInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadData = async () => {
      const { data: poData } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
      if (poData) {
        setPo(poData);
        if (poData.packed_by && poData.packed_by !== 'Unassigned') {
          setPackerName(poData.packed_by);
          setIsClaimed(true);
        }
      }
      const { data: itemsData } = await supabase.from("po_items").select("*").eq("po_id", poId).order("id");
      if (itemsData) setItems(itemsData);

      const { data: boxData } = await supabase.from("po_boxes").select("*").eq("po_id", poId);
      if (boxData) setBoxes(boxData);
    };
    loadData();
  }, [poId]);

  useEffect(() => {
    const keepFocus = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('select') || 
        target.closest('input:not([type="hidden"])') || 
        target.closest('button') || 
        target.closest('a')
      ) {
        return; 
      }
      if (!isClaimed) { claimInputRef.current?.focus(); } else { inputRef.current?.focus(); }
    };
    
    document.addEventListener("click", keepFocus);
    if (!isClaimed) { claimInputRef.current?.focus(); } else { inputRef.current?.focus(); }
    return () => document.removeEventListener("click", keepFocus);
  }, [isClaimed]);

  const playSound = (type: "success" | "error" | "stage" | "complete") => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    
    if (type === "success") {
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime); 
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === "complete") {
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime); 
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); 
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.2); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    } else if (type === "stage") {
      osc.type = "sine"; osc.frequency.setValueAtTime(600, ctx.currentTime); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } else {
      osc.type = "square"; osc.frequency.setValueAtTime(150, ctx.currentTime); 
      osc.frequency.setValueAtTime(100, ctx.currentTime + 0.15); 
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.4);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleClaimPO = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = packerName.trim().toUpperCase();
    if (!cleanedName || cleanedName.length < 2) { playSound("error"); return; }
    playSound("success");
    await supabase.from("purchase_orders").update({ packed_by: cleanedName }).eq("id", poId);
    setPo({ ...po, packed_by: cleanedName });
    setIsClaimed(true);
  };

  const processScanCode = async (scannedCode: string) => {
    if (!scannedCode) return;

    if (po && (po.status === "Completed" || po.status === "Partial Fulfillment")) {
      playSound("error");
      setFeedback({ message: `❌ LOCKED: This PO has already been completely fulfilled and locked.`, type: "error" });
      return;
    }

    const isProductBarcode = items.some(i => i.barcode === scannedCode);
    const isBoxLabel = boxes.some(b => b.box_barcode === scannedCode);

    if (!isProductBarcode && !isBoxLabel) {
      playSound("error");
      setFeedback({ message: `❌ UNKNOWN BARCODE: This barcode belongs to neither a product nor an inner box.`, type: "error" });
      setStagedProductBarcode(null); 
      return;
    }

    if (isProductBarcode && !stagedProductBarcode) {
      const item = items.find(i => i.barcode === scannedCode);
      const currentlySecuredForThisItem = boxes.filter(b => b.product_barcode === item.barcode && b.is_scanned).length;
      
      if (currentlySecuredForThisItem >= item.inner_boxes || item.is_short) {
        playSound("error");
        setFeedback({ message: `⚠️ ALREADY DONE: Target reached or marked Short for [${item.product_name}]`, type: "error" });
        return;
      }

      playSound("stage");
      setStagedProductBarcode(scannedCode);
      setFeedback({ message: `🔵 PRODUCT VERIFIED: [${item.product_name}]. Now scan the newly attached LPN Box Label.`, type: "blue" });
      return;
    }

    if (stagedProductBarcode && isBoxLabel) {
      const boxMatchesProduct = boxes.find(b => b.box_barcode === scannedCode && b.product_barcode === stagedProductBarcode);
      
      if (!boxMatchesProduct) {
        playSound("error");
        setFeedback({ message: `❌ MISMATCH: That thermal label does not belong to the product you just scanned!`, type: "error" });
        setStagedProductBarcode(null); 
        return;
      }

      if (boxMatchesProduct.is_scanned) {
        playSound("error");
        setFeedback({ message: `⚠️ DUPLICATE: Inner Box [Carton ${boxMatchesProduct.carton_number}] was already packed!`, type: "error" });
        setStagedProductBarcode(null);
        return;
      }

      const timestamp = new Date().toISOString();
      const updatedBoxes = boxes.map(b => b.id === boxMatchesProduct.id ? { ...b, is_scanned: true, packed_at: timestamp, packed_by: packerName } : b);
      setBoxes(updatedBoxes);
      await supabase.from("po_boxes").update({ is_scanned: true, packed_at: timestamp, packed_by: packerName }).eq("id", boxMatchesProduct.id);

      const itemIndex = items.findIndex(i => i.barcode === stagedProductBarcode);
      const item = items[itemIndex];
      const newBoxCount = updatedBoxes.filter(b => b.product_barcode === item.barcode && b.is_scanned).length;
      const isItemFullyPacked = newBoxCount >= item.inner_boxes;
      
      const unitsPerBox = item.inner_boxes > 0 ? (item.target_qty / item.inner_boxes) : 0;
      const trueUnitsScanned = newBoxCount * unitsPerBox;
      
      const newHistory = [...(Array.isArray(item.scan_history) ? item.scan_history : []), `${timestamp}|${packerName}`];

      const updatedItems = [...items];
      updatedItems[itemIndex].scanned_qty = trueUnitsScanned; 
      updatedItems[itemIndex].scan_history = newHistory;
      setItems(updatedItems);

      await supabase.from("po_items").update({ scanned_qty: trueUnitsScanned, scan_history: newHistory, is_short: false }).eq("id", item.id);

      playSound(isItemFullyPacked ? "complete" : "success");
      setFeedback({ message: `✅ SECURED: Inner Box ${boxMatchesProduct.carton_number} of ${boxMatchesProduct.total_cartons} packed.`, type: "complete" });
      setStagedProductBarcode(null); 

      if (po && po.status === "Not Started") {
        await supabase.from("purchase_orders").update({ status: "Packing" }).eq("id", po.id);
        setPo({ ...po, status: "Packing" });
      }
      return;
    }

    if (!stagedProductBarcode && isBoxLabel) {
      playSound("error");
      setFeedback({ message: `⚠️ SCAN PRODUCT FIRST: Match the physical product barcode first, then scan its inner box LPN.`, type: "error" });
      return;
    }

    if (stagedProductBarcode && isProductBarcode) {
       const newItem = items.find(i => i.barcode === scannedCode);
       const currentlySecured = boxes.filter(b => b.product_barcode === newItem.barcode && b.is_scanned).length;
       if (currentlySecured >= newItem.inner_boxes || newItem.is_short) {
          playSound("error");
          setFeedback({ message: `⚠️ ALREADY DONE: Target reached or marked short for [${newItem.product_name}]`, type: "error" });
          setStagedProductBarcode(null);
          return;
       }

       playSound("stage");
       setStagedProductBarcode(scannedCode);
       setFeedback({ message: `🔵 CHANGED PRODUCT: [${newItem.product_name}]. Now scan its LPN Box Label.`, type: "blue" });
    }
  };

  const handleHiddenScan = (e: React.FormEvent) => {
    e.preventDefault();
    processScanCode(barcodeInput.trim());
    setBarcodeInput(""); 
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const possibleBarcode = searchQuery.trim();
      const isProduct = items.some(i => i.barcode === possibleBarcode);
      const isBox = boxes.some(b => b.box_barcode === possibleBarcode);
      
      if (possibleBarcode.length > 5 && (isProduct || isBox)) {
        processScanCode(possibleBarcode);
        setSearchQuery("");
        inputRef.current?.focus(); 
      }
    }
  };

  const handleMarkShortage = async (itemId: string, productName: string) => {
    const isConfirmed = window.confirm(`Mark [${productName}] as short-shipped? Only do this if physical cartons are missing.`);
    if (!isConfirmed) return;

    const updatedItems = items.map(i => i.id === itemId ? { ...i, is_short: true } : i);
    setItems(updatedItems);
    await supabase.from("po_items").update({ is_short: true }).eq("id", itemId);
    setFeedback({ message: `⚠️ Marked as Shortage: ${productName}. Remaining items ignored.`, type: "error" });
    
    setStagedProductBarcode(null);
    inputRef.current?.focus();
  };

  const handleUndoShortage = async (itemId: string, productName: string) => {
    const updatedItems = items.map(i => i.id === itemId ? { ...i, is_short: false } : i);
    setItems(updatedItems);
    await supabase.from("po_items").update({ is_short: false }).eq("id", itemId);
    setFeedback({ message: `🔄 Shortage Reverted: Hand-scanner re-activated for ${productName}.`, type: "success" });
    
    if (po && (po.status === "Completed" || po.status === "Partial Fulfillment")) {
      await supabase.from("purchase_orders").update({ status: "Packing" }).eq("id", po.id);
      setPo({ ...po, status: "Packing" });
    }
    inputRef.current?.focus();
  };

  const handleFinishAndPrint = async () => {
    const hasShortages = items.some(i => i.is_short);
    await supabase.from("purchase_orders").update({ status: hasShortages ? "Partial Fulfillment" : "Completed" }).eq("id", po.id);
    setPo({ ...po, status: hasShortages ? "Partial Fulfillment" : "Completed" });
    window.print();
  };

  let effectiveCartonTarget = 0;
  let effectiveCartonScanned = 0;

  items.forEach(item => {
    const securedForThisItem = boxes.filter(b => b.product_barcode === item.barcode && b.is_scanned).length;
    if (item.is_short) {
      effectiveCartonTarget += securedForThisItem;
    } else {
      effectiveCartonTarget += item.inner_boxes;
    }
    effectiveCartonScanned += securedForThisItem;
  });

  const progressPercent = effectiveCartonTarget === 0 ? 0 : Math.round((effectiveCartonScanned / effectiveCartonTarget) * 100);
  const isOrderFullyPacked = effectiveCartonTarget > 0 && effectiveCartonScanned === effectiveCartonTarget;
  const isHistorical = po?.status === "Completed" || po?.status === "Partial Fulfillment";

  if (!po) return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-blue-500" /></div>;

  if (!isClaimed) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8 z-50 fixed inset-0">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-10 text-center animate-fade-in-up">
          <div className="bg-blue-100 text-blue-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><UserCircle className="w-10 h-10" /></div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">{isHistorical ? "Audit Record" : "Check In"}</h1>
          <p className="text-gray-500 font-medium mb-8">
            {isHistorical ? "Enter your initials to view historic audit log." : "Type your initials to unlock this 2FA packing station."}
          </p>
          <form onSubmit={handleClaimPO}>
            <input ref={claimInputRef} type="text" placeholder="e.g., ADITYA" value={packerName} onChange={(e) => setPackerName(e.target.value)} className="w-full text-center text-2xl font-bold uppercase tracking-widest border-2 border-gray-300 rounded-xl py-4 focus:outline-none focus:border-blue-500 mb-6" />
            <button type="submit" className="w-full bg-blue-600 text-white font-bold text-lg rounded-xl py-4 hover:bg-blue-700 transition">Unlock Station</button>
          </form>
          <div className="mt-6 border-t pt-6">
             <Link href="/"><button className="text-gray-400 font-medium hover:text-gray-600">← Back to Dashboard</button></Link>
          </div>
        </div>
      </div>
    );
  }

  let displayItems = [...items];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    displayItems = displayItems.filter(i => 
      i.product_name.toLowerCase().includes(q) || 
      i.barcode.includes(q)
    );
  }

  displayItems.sort((a, b) => {
    if (a.barcode === stagedProductBarcode) return -1;
    if (b.barcode === stagedProductBarcode) return 1;

    const aSecured = boxes.filter(box => box.product_barcode === a.barcode && box.is_scanned).length;
    const bSecured = boxes.filter(box => box.product_barcode === b.barcode && box.is_scanned).length;
    const aDone = aSecured >= a.inner_boxes || a.is_short;
    const bDone = bSecured >= b.inner_boxes || b.is_short;

    if (sortBy === "status") {
      if (aDone === bDone) return 0;
      return aDone ? 1 : -1;
    }
    if (sortBy === "name-asc") return a.product_name.localeCompare(b.product_name);
    if (sortBy === "qty-desc") return b.inner_boxes - a.inner_boxes; 
    return 0; 
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col pb-24 print:bg-white text-gray-900">
      
      <div className="print:hidden">
        <form onSubmit={handleHiddenScan} className="opacity-0 absolute top-0 left-0">
          <input ref={inputRef} type="text" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} autoFocus />
        </form>

        <header className="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <Link href="/"><button className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"><ArrowLeft className="w-5 h-5 text-gray-700" /></button></Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 border-b pb-2 mb-2">PO: {po.po_number}</h1>
              <div className="flex gap-6 items-center text-sm font-medium">
                <span className="text-blue-700 font-bold">{po.retailer_name}</span>
                <span className="flex items-center gap-1.5 text-gray-500 ml-4 border-l pl-4"><Calendar className="w-4 h-4" /> Received: {po.po_date}</span>
                <span className="flex items-center gap-1.5 text-red-600 font-bold border-l pl-4"><Truck className="w-4 h-4" /> Deadline: {po.delivery_date}</span>
                <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded ml-4 border border-green-200 font-bold"><UserCircle className="w-4 h-4" /> Packer: {packerName}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-black text-blue-600">{progressPercent}%</div>
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">
              {isHistorical ? "Fully Processed" : isOrderFullyPacked ? "Ready to Ship" : "Cartons Packed"}
            </p>
          </div>
        </header>

        <div className="w-full bg-gray-200 h-3">
          <div className={`h-3 transition-all duration-300 ease-out flex justify-end ${isOrderFullyPacked || isHistorical ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${progressPercent}%` }}></div>
        </div>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
          
          {isOrderFullyPacked || isHistorical ? (
            <div className="bg-green-50 border-2 border-green-500 p-8 rounded-xl shadow-lg text-center animate-fade-in-up">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-black text-green-900 mb-2">Order Completed & Verified</h2>
              <p className="text-green-700 font-medium mb-6">Packed perfectly by <strong>{po.packed_by || packerName}</strong>.</p>
              <button onClick={handleFinishAndPrint} className="bg-green-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition flex items-center gap-3 justify-center w-full max-w-md mx-auto shadow-md">
                <Printer className="w-6 h-6" /> Print Official Packing Slip
              </button>
            </div>
          ) : (
            <div className={`p-8 rounded-xl border-4 flex flex-col items-center justify-center text-center gap-4 shadow-sm transition-colors ${
              feedback.type === 'error' ? 'bg-red-50 border-red-500 text-red-900' :
              feedback.type === 'complete' ? 'bg-green-50 border-green-500 text-green-900' :
              feedback.type === 'blue' ? 'bg-blue-50 border-blue-500 text-blue-900 animate-pulse' :
              'bg-white border-gray-300 text-gray-500'
            }`}>
              {feedback.type === 'blue' ? <Lock className="w-12 h-12 text-blue-600" /> : 
               feedback.type === 'complete' ? <CheckCircle2 className="w-12 h-12 text-green-600" /> :
               <ScanLine className="w-12 h-12" />}
              
              <div>
                <h2 className="text-3xl font-black">{feedback.message}</h2>
                {feedback.type === 'blue' && <p className="text-xl font-bold mt-2 text-blue-600">Scan generated label on box to authenticate.</p>}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="relative w-full sm:max-w-md flex items-center">
              <Search className="w-5 h-5 absolute left-3 text-gray-400" />
              <input ref={searchInputRef} type="text" placeholder="Search Product or Master Barcode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Filter className="w-5 h-5 text-gray-500" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} onBlur={() => inputRef.current?.focus()} className="border border-gray-300 rounded-lg px-4 py-3 text-gray-700 bg-gray-50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full cursor-pointer hover:bg-white">
                <option value="status">Urgent First (Pending on Top)</option>
                <option value="name-asc">Product Name (A - Z)</option>
                <option value="qty-desc">Inner Boxes (Highest First)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4 w-12 text-center">2FA</th>
                  <th className="p-4">SKU Group & Exception Checks</th>
                  <th className="p-4 text-center">Inner Boxes Secured</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-500 font-medium">No items match your search.</td></tr>
                ) : displayItems.map((item) => {
                  
                  const requiredCartons = item.inner_boxes;
                  const securedCartons = boxes.filter(b => b.product_barcode === item.barcode && b.is_scanned).length;
                  const isComplete = securedCartons >= requiredCartons;
                  const isShort = item.is_short && !isComplete; 
                  const done = isComplete || isShort;
                  
                  const progress = requiredCartons === 0 ? 0 : (securedCartons / requiredCartons) * 100;
                  const isCurrentlyStaged = stagedProductBarcode === item.barcode;

                  return (
                    <tr key={item.id} className={`border-b transition-colors ${
                      isCurrentlyStaged ? 'bg-blue-50 border-l-4 border-l-blue-600 shadow-inner' : 
                      isComplete ? 'bg-green-50/50' : 
                      isShort ? 'bg-amber-50 border-l-4 border-l-amber-500' : 'hover:bg-gray-50'
                    }`}>
                      <td className="p-4 text-center align-middle">
                        {isComplete ? <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto" /> : 
                         isShort ? <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" /> : 
                         isCurrentlyStaged ? <Lock className="w-6 h-6 text-blue-600 mx-auto" /> : 
                         <QrCode className="w-6 h-6 text-gray-300 mx-auto" />}
                      </td>

                      <td className="p-4">
                        <p className={`font-bold text-lg leading-tight ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{item.product_name}</p>
                        <p className={`font-mono text-xs mt-1 ${done ? 'text-gray-400' : 'text-gray-500'}`}>Product Barcode: {item.barcode}</p>

                        <div className="flex items-center gap-4 mt-2">
                          {!done && !isHistorical && (
                            <button onClick={() => handleMarkShortage(item.id, item.product_name)} className="text-amber-600 hover:text-amber-800 text-xs font-bold uppercase underline transition">
                              Report Missing Cartons
                            </button>
                          )}
                          {isShort && (
                            <div className="flex items-center gap-3">
                              <span className="text-amber-600 text-[10px] font-bold uppercase bg-amber-100 px-2 py-0.5 rounded flex items-center border border-amber-200">
                                <AlertTriangle className="w-3 h-3 mr-1"/> Shortage Declared
                              </span>
                              {!isHistorical && (
                                <button onClick={() => handleUndoShortage(item.id, item.product_name)} className="text-gray-500 hover:text-gray-900 text-xs font-bold uppercase flex items-center gap-1 transition pr-2">
                                  <RotateCcw className="w-3 h-3" /> UNDO
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {!done && (
                          <div className="w-full bg-gray-200 h-1.5 mt-3 rounded-full overflow-hidden">
                             <div className={`h-1.5 ${isCurrentlyStaged ? 'bg-blue-600' : 'bg-blue-400'}`} style={{ width: `${progress}%` }}></div>
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-center">
                        <span className={`text-3xl font-black ${isComplete ? 'text-green-600' : isShort ? 'text-amber-600' : isCurrentlyStaged ? 'text-blue-700' : 'text-gray-900'}`}>{securedCartons}</span>
                        <span className="text-gray-400 font-bold mx-2">/</span>
                        <span className="text-gray-600 font-bold text-xl">{requiredCartons}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* ------------------------------------------------------------- 
          THE PDF PRINT VIEW
      ------------------------------------------------------------- */}
      <div className="hidden print:block p-8 bg-white text-black font-sans w-full">
        <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-4xl font-black tracking-tighter mb-1">AERIS BEAUTE</h1>
            <p className="text-sm font-semibold text-gray-600">Offical LPN Packing Slip — {po?.status}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold mb-1">PO Number: {po.po_number}</h2>
            <p className="text-sm font-medium">B2B Retailer: <strong>{po.retailer_name}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8 bg-gray-100 p-4 rounded-lg border border-gray-300">
           <div><p className="text-xs font-bold text-gray-500 uppercase">PO Date</p><p className="font-semibold text-lg">{po.po_date}</p></div>
           <div><p className="text-xs font-bold text-gray-500 uppercase">Delivery Deadline</p><p className="font-semibold text-lg">{po.delivery_date}</p></div>
           <div><p className="text-xs font-bold text-gray-500 uppercase">2FA Authorize User</p><p className="font-bold text-lg text-blue-800 uppercase">{po?.packed_by || packerName}</p></div>
           <div><p className="text-xs font-bold text-gray-500 uppercase">Print Timestamp</p><p className="font-semibold text-sm">{new Date().toLocaleString()}</p></div>
        </div>

        <table className="w-full text-left border-collapse border border-black mb-12">
          <thead>
            <tr className="bg-gray-100 border-black border-b-2">
              <th className="p-3 border-r border-black font-bold uppercase text-xs">Barcode</th>
              <th className="p-3 border-r border-black font-bold uppercase text-xs">Product Description</th>
              <th className="p-3 border-r border-black font-bold text-center uppercase text-xs">Inner Boxes Ordered</th>
              <th className="p-3 border-r border-black font-bold text-center uppercase text-xs">Inner Boxes Packed</th>
              <th className="p-3 border-r border-black font-bold text-center uppercase text-xs">Total Unit Qty</th>
              <th className="p-3 font-bold uppercase text-xs text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
               const securedCartons = boxes.filter(b => b.product_barcode === item.barcode && b.is_scanned).length;
               return (
                 <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-300`}>
                   <td className="p-3 border-r border-black font-mono text-xs">{item.barcode}</td>
                   <td className="p-3 border-r border-black text-sm font-medium">{item.product_name}</td>
                   <td className="p-3 border-r border-black text-center font-semibold">{item.inner_boxes}</td>
                   <td className="p-3 border-r border-black text-center font-bold text-gray-900">{securedCartons}</td>
                   <td className="p-3 border-r border-black text-center font-bold text-gray-900">{item.scanned_qty}</td>
                   <td className="p-3 text-center text-[10px] font-bold uppercase">
                     {securedCartons >= item.inner_boxes ? 'Fulfilled' : item.is_short ? 'Short-Shipped' : 'Pending'}
                   </td>
                 </tr>
               )
            })}
          </tbody>
        </table>

        <div className="flex justify-between items-center pt-12 mt-12 border-t-2 border-dashed border-gray-400">
          <div className="text-center">
            <div className="border-b-2 font-black text-2xl border-black w-64 pb-2 mb-2">{po?.packed_by || packerName}</div>
            <p className="font-bold text-xs uppercase text-gray-600">Employee Digital Signature</p>
          </div>
          <div className="text-center flex-1 ml-12">
            <p className="font-black text-2xl tracking-widest opacity-20">LPN SCAN VERIFIED</p>
          </div>
        </div>

      </div>
    </div>
  );
}