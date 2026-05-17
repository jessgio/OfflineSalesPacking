"use client";

import { useState, useEffect, useRef, use } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { ArrowLeft, CheckCircle2, AlertOctagon, ScanLine, Loader2, Clock, Calendar, Truck, Box, Search, Filter, AlertTriangle, Printer, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function PackStation(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params); 
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [feedback, setFeedback] = useState({ message: "Awaiting Scan...", type: "default" });
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("status");

  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadData = async () => {
      const { data: poData } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
      if (poData) setPo(poData);

      const { data: itemsData } = await supabase.from("po_items").select("*").eq("po_id", poId).order("id");
      if (itemsData) setItems(itemsData);
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
      inputRef.current?.focus();
    };
    
    document.addEventListener("click", keepFocus);
    inputRef.current?.focus(); 
    return () => document.removeEventListener("click", keepFocus);
  }, []);

  const playSound = (type: "success" | "error" | "complete") => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === "success") {
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } else if (type === "complete") {
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime); 
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); 
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.type = "sawtooth"; osc.frequency.setValueAtTime(150, ctx.currentTime); 
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const processScanCode = async (scannedCode: string) => {
    if (!scannedCode) return;
    const itemIndex = items.findIndex((i) => i.barcode === scannedCode);

    if (itemIndex === -1) {
      playSound("error");
      setFeedback({ message: `❌ ERROR: Barcode ${scannedCode} is NOT in this PO.`, type: "error" });
      return;
    }

    const item = items[itemIndex];

    if (item.scanned_qty >= item.target_qty) {
      playSound("error");
      setFeedback({ message: `⚠️ OVER-PICK: You already have enough of [${item.product_name}]!`, type: "error" });
      return;
    }

    const timestamp = new Date().toISOString();
    const currentHistory = Array.isArray(item.scan_history) ? item.scan_history : [];
    const newHistory = [...currentHistory, timestamp];

    const newScannedQty = item.scanned_qty + 1;
    const isNowComplete = newScannedQty === item.target_qty;

    playSound(isNowComplete ? "complete" : "success");
    setFeedback({ 
      message: isNowComplete ? `✅ COMPLETED: ${item.product_name}` : `📦 Scanned: ${item.product_name} (${newScannedQty} / ${item.target_qty})`, 
      type: isNowComplete ? "complete" : "success" 
    });

    const updatedItems = [...items];
    updatedItems[itemIndex].scanned_qty = newScannedQty;
    updatedItems[itemIndex].scan_history = newHistory;
    updatedItems[itemIndex].is_short = false; 
    setItems(updatedItems);

    await supabase.from("po_items").update({ scanned_qty: newScannedQty, scan_history: newHistory, is_short: false }).eq("id", item.id);

    if (po && po.status === "Not Started") {
      await supabase.from("purchase_orders").update({ status: "Packing" }).eq("id", po.id);
      setPo({ ...po, status: "Packing" });
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
      if (possibleBarcode.length > 5 && items.some(i => i.barcode === possibleBarcode)) {
        processScanCode(possibleBarcode);
        setSearchQuery("");
        inputRef.current?.focus(); 
      }
    }
  };

  const handleMarkShortage = async (itemId: string, productName: string) => {
    const isConfirmed = window.confirm(`Mark [${productName}] as short-shipped? Only do this if stock is physically missing.`);
    if (!isConfirmed) return;

    const updatedItems = items.map(i => i.id === itemId ? { ...i, is_short: true } : i);
    setItems(updatedItems);
    
    await supabase.from("po_items").update({ is_short: true }).eq("id", itemId);
    setFeedback({ message: `⚠️ Marked as Shortage: ${productName}`, type: "error" });
    inputRef.current?.focus();
  };

  // UNDO SHORTAGE LOGIC
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
    
    await supabase.from("purchase_orders")
      .update({ status: hasShortages ? "Partial Fulfillment" : "Completed" })
      .eq("id", po.id);
    
    setPo({ ...po, status: hasShortages ? "Partial Fulfillment" : "Completed" });
    window.print();
  };

  const isOrderFullyPacked = items.length > 0 && items.every(i => i.scanned_qty >= i.target_qty || i.is_short);
  
  let effectiveTarget = 0;
  let effectiveScanned = 0;
  items.forEach(i => {
    effectiveTarget += i.is_short ? i.scanned_qty : i.target_qty;
    effectiveScanned += i.scanned_qty;
  });
  const progressPercent = effectiveTarget === 0 ? 0 : Math.round((effectiveScanned / effectiveTarget) * 100);

  if (!po) return <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center min-h-screen"><Loader2 className="animate-spin w-8 h-8 mb-4 text-blue-500" /> Loading PO Data...</div>;

  let displayItems = [...items];
  
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    displayItems = displayItems.filter(i => i.product_name.toLowerCase().includes(q) || i.barcode.includes(q));
  }

  displayItems.sort((a, b) => {
    const aDone = a.scanned_qty >= a.target_qty || a.is_short;
    const bDone = b.scanned_qty >= b.target_qty || b.is_short;
    if (sortBy === "status") {
      if (aDone === bDone) return 0;
      return aDone ? 1 : -1;
    }
    if (sortBy === "name-asc") return a.product_name.localeCompare(b.product_name);
    if (sortBy === "qty-desc") return b.target_qty - a.target_qty; 
    return 0; 
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col pb-24 print:bg-white text-gray-900">
      
      {/* ------------------------------------------------------------- 
          THE APP VIEW (Hidden during PDF Print)
      ------------------------------------------------------------- */}
      <div className="print:hidden">
        <form onSubmit={handleHiddenScan} className="opacity-0 absolute top-0 left-0">
          <input ref={inputRef} type="text" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} autoFocus />
        </form>

        <header className="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                <ArrowLeft className="w-5 h-5 text-gray-700" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 border-b pb-2 mb-2">PO: {po.po_number}</h1>
              <div className="flex gap-6 items-center text-sm font-medium">
                <span className="text-blue-700 font-bold">{po.retailer_name}</span>
                <span className="flex items-center gap-1.5 text-gray-500 ml-4 border-l pl-4"><Calendar className="w-4 h-4" /> Received: {po.po_date}</span>
                <span className="flex items-center gap-1.5 text-red-600 font-bold border-l pl-4"><Truck className="w-4 h-4" /> Deadline: {po.delivery_date}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-black text-blue-600">{progressPercent}%</div>
            <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">
              {isOrderFullyPacked ? "Ready to Ship" : "Order Packed"}
            </p>
          </div>
        </header>

        <div className="w-full bg-gray-200 h-3">
          <div className={`h-3 transition-all duration-300 ease-out flex justify-end ${isOrderFullyPacked ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${progressPercent}%` }}></div>
        </div>

        <main className="flex-1 p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">
          
          {isOrderFullyPacked ? (
            <div className="bg-green-50 border-2 border-green-500 p-8 rounded-xl shadow-lg text-center animate-fade-in-up">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-black text-green-900 mb-2">Order Fully Verified</h2>
              <p className="text-green-700 font-medium mb-6">All physical scans have been reconciled with the database.</p>
              <button 
                onClick={handleFinishAndPrint}
                className="bg-green-600 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition flex items-center gap-3 justify-center w-full max-w-md mx-auto shadow-md"
              >
                <Printer className="w-6 h-6" /> Finish & Print Packing Slip
              </button>
            </div>
          ) : (
            <div className={`p-6 rounded-xl border-2 flex items-center gap-4 shadow-sm transition-colors ${feedback.type === 'error' ? 'bg-red-100 border-red-500 text-red-900' : feedback.type === 'complete' ? 'bg-green-100 border-green-500 text-green-900' : feedback.type === 'success' ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-white border-gray-300 text-gray-500'}`}>
              {feedback.type === 'error' && <AlertOctagon className="w-8 h-8 flex-shrink-0" />}
              {feedback.type === 'complete' && <CheckCircle2 className="w-8 h-8 flex-shrink-0" />}
              {feedback.type === 'success' && <ScanLine className="w-8 h-8 flex-shrink-0" />}
              <div>
                <h2 className="text-2xl font-black">{feedback.message}</h2>
                <p className="text-sm font-medium mt-1 opacity-80">Listening for scanner input...</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <div className="relative w-full sm:max-w-md flex items-center">
              <Search className="w-5 h-5 absolute left-3 text-gray-400" />
              <input ref={searchInputRef} type="text" placeholder="Search by Product..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Filter className="w-5 h-5 text-gray-500" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} onBlur={() => inputRef.current?.focus()} className="border border-gray-300 rounded-lg px-4 py-3 text-gray-700 bg-gray-50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-full cursor-pointer hover:bg-white">
                <option value="status">Urgent First (Pending on Top)</option>
                <option value="name-asc">Product Name (A - Z)</option>
                <option value="qty-desc">Quantity (Highest First)</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4 w-12 text-center">Status</th>
                  <th className="p-4">Product Name</th>
                  <th className="p-4 w-40">Barcode</th>
                  <th className="p-4 w-32 text-center text-orange-600 bg-orange-50"><div className="flex items-center justify-center gap-1"><Box className="w-4 h-4"/> Inner Boxes</div></th>
                  <th className="p-4 w-40 text-center">Units Packed</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const done = item.scanned_qty >= item.target_qty || item.is_short;
                  const isComplete = item.scanned_qty >= item.target_qty;
                  const isShort = item.is_short && !isComplete; // Logic fix: Only show short if not strictly complete
                  const progress = item.target_qty === 0 ? 0 : (item.scanned_qty / item.target_qty) * 100;
                  const historyArray = Array.isArray(item.scan_history) ? item.scan_history : [];
                  const lastScanTime = historyArray.length > 0 ? historyArray[historyArray.length - 1] : null;

                  return (
                    <tr key={item.id} className={`border-b transition-colors ${isComplete ? 'bg-green-50/50' : isShort ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      <td className="p-4 text-center align-middle">
                        {isComplete ? <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto" /> : 
                         isShort ? <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" /> : 
                         <div className="w-4 h-4 rounded-full border-2 border-gray-300 mx-auto"></div>}
                      </td>

                      <td className="p-4">
                        <p className={`font-bold text-lg ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{item.product_name}</p>
                        
                        <div className="flex items-center gap-4 mt-1">
                          {lastScanTime && (
                            <span className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                              <Clock className="w-3 h-3" /> Last scanned: {formatTime(lastScanTime)}
                            </span>
                          )}

                          {/* SHORTAGE ACTION LINKS CONFIGURED PROPERLY */}
                          {!done && (
                            <button onClick={() => handleMarkShortage(item.id, item.product_name)} className="text-amber-600 hover:text-amber-800 text-xs font-bold uppercase underline transition">
                              Report Shortage
                            </button>
                          )}
                          {isShort && (
                            <div className="flex items-center gap-3">
                              <span className="text-amber-600 text-[10px] font-bold uppercase bg-amber-100 px-2 py-0.5 rounded flex items-center border border-amber-200">
                                <AlertTriangle className="w-3 h-3 mr-1"/> Short-Shipped
                              </span>
                              <button onClick={() => handleUndoShortage(item.id, item.product_name)} className="text-gray-500 hover:text-gray-900 text-xs font-bold uppercase flex items-center gap-1 transition pr-2">
                                <RotateCcw className="w-3 h-3" /> UNDO
                              </button>
                            </div>
                          )}
                        </div>

                        {!done && (
                          <div className="w-full bg-gray-200 h-1.5 mt-2 rounded-full overflow-hidden">
                             <div className="bg-blue-500 h-1.5" style={{ width: `${progress}%` }}></div>
                          </div>
                        )}
                      </td>

                      <td className="p-4 font-mono text-gray-500 text-xs">{item.barcode}</td>

                      <td className="p-4 text-center border-l border-r bg-gray-50/30">
                        <span className="text-xl font-bold text-orange-600">{item.inner_boxes}</span>
                      </td>

                      <td className="p-4 text-center">
                        <span className={`text-2xl font-black ${isComplete ? 'text-green-600' : isShort ? 'text-amber-600' : 'text-blue-600'}`}>{item.scanned_qty}</span>
                        <span className="text-gray-400 font-bold mx-1">/</span>
                        <span className="text-gray-600 font-bold text-lg">{item.target_qty}</span>
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
          THE PDF PRINT VIEW (Invisible until printed)
      ------------------------------------------------------------- */}
      <div className="hidden print:block p-8 bg-white text-black font-sans w-full">
        <div className="flex justify-between items-end border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-4xl font-black tracking-tighter mb-1">AERIS BEAUTE</h1>
            <p className="text-sm font-semibold text-gray-600">Offical Packing Slip — {po?.status}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold mb-1">PO Number: {po.po_number}</h2>
            <p className="text-sm font-medium">B2B Retailer: <strong>{po.retailer_name}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8 bg-gray-100 p-4 rounded-lg border border-gray-300">
           <div>
             <p className="text-xs font-bold text-gray-500 uppercase">PO Date</p>
             <p className="font-semibold text-lg">{po.po_date}</p>
           </div>
           <div>
             <p className="text-xs font-bold text-gray-500 uppercase">Delivery Deadline</p>
             <p className="font-semibold text-lg">{po.delivery_date}</p>
           </div>
           <div>
             <p className="text-xs font-bold text-gray-500 uppercase">Print Timestamp</p>
             <p className="font-semibold text-lg">{new Date().toLocaleString()}</p>
           </div>
        </div>

        <table className="w-full text-left border-collapse border border-black mb-12">
          <thead>
            <tr className="bg-gray-100 border-black border-b-2">
              <th className="p-3 border-r border-black font-bold uppercase text-xs">Barcode</th>
              <th className="p-3 border-r border-black font-bold uppercase text-xs">Product Description</th>
              <th className="p-3 border-r border-black font-bold text-center uppercase text-xs">Inner Boxes</th>
              <th className="p-3 border-r border-black font-bold text-center uppercase text-xs">Request Qty</th>
              <th className="p-3 border-r border-black font-bold text-center uppercase text-xs">Packed Qty</th>
              <th className="p-3 font-bold uppercase text-xs text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-300`}>
                <td className="p-3 border-r border-black font-mono text-xs">{item.barcode}</td>
                <td className="p-3 border-r border-black text-sm font-medium">{item.product_name}</td>
                <td className="p-3 border-r border-black text-center font-bold text-gray-800">{item.inner_boxes}</td>
                <td className="p-3 border-r border-black text-center font-semibold">{item.target_qty}</td>
                <td className="p-3 border-r border-black text-center font-bold">{item.scanned_qty}</td>
                <td className="p-3 text-center text-xs font-bold uppercase">
                  {item.scanned_qty >= item.target_qty ? 'Fulfilled' : 
                   item.is_short ? 'Short-Shipped' : 'Pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-center pt-12">
          <div className="text-center">
            <div className="border-b border-black w-64 mb-2"></div>
            <p className="font-bold text-xs uppercase text-gray-600">Warehouse Packer Signature</p>
          </div>
          <div className="text-center flex-1 ml-12">
            <p className="font-black text-2xl tracking-widest opacity-20">AERIS BEAUTE VERIFIED</p>
          </div>
        </div>

      </div>
    </div>
  );
}