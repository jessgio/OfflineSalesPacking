"use client";

import { useState, useEffect, useRef, use, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  ArrowLeft,
  CheckCircle2,
  ScanLine,
  Loader2,
  UserCircle,
  QrCode,
  Lock,
  Search,
  Filter,
  AlertTriangle,
  Printer,
  RotateCcw,
  Calendar,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { needsCartonPlanning } from "../../../lib/sociolla/cartonPlan";
import { DashButton } from "../../../components/dashboard/primitives";
import {
  fetchAllPoBoxContentsForPo,
  fetchPoBoxContentsForBox,
  fetchPoBoxCount,
  fetchPoBoxStats,
  fetchPoBoxesForPo,
  LARGE_PO_BOX_THRESHOLD,
  lookupPoBoxByBarcode,
  type PoBoxContentRow,
  type PoBoxRow,
  type PoBoxStats,
} from "../../../lib/poBoxesDb";

export default function PackStation(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params); 
  const poId = params.id;

  const [po, setPo] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<PoBoxRow[]>([]);
  const [boxContents, setBoxContents] = useState<PoBoxContentRow[]>([]);
  const [onDemandBoxes, setOnDemandBoxes] = useState(false);
  const [boxStats, setBoxStats] = useState<PoBoxStats | null>(null);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("status");
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [stagedProductBarcode, setStagedProductBarcode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState({ message: "Scan a product barcode to begin.", type: "default" });

  const [packerName, setPackerName] = useState("");
  const [isClaimed, setIsClaimed] = useState(false);
  const claimInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanInFlight = useRef(false);
  const lastScanRef = useRef({ code: "", at: 0 });
  const audioCtxRef = useRef<AudioContext | null>(null);

  const itemByBarcode = useMemo(
    () => Object.fromEntries(items.map((i) => [i.barcode, i])),
    [items]
  );
  const securedCountByProductBarcode = useMemo(() => {
    if (onDemandBoxes && boxStats) return boxStats.scannedByProduct;
    const counts: Record<string, number> = {};
    for (const box of boxes) {
      if (box.is_scanned) {
        counts[box.product_barcode] = (counts[box.product_barcode] ?? 0) + 1;
      }
    }
    return counts;
  }, [boxes, onDemandBoxes, boxStats]);

  const cacheBox = (box: PoBoxRow) => {
    setBoxes((prev) => (prev.some((b) => b.id === box.id) ? prev : [...prev, box]));
  };

  const resolveBoxByBarcode = async (barcode: string): Promise<PoBoxRow | null> => {
    const cached = boxes.find((b) => b.box_barcode === barcode);
    if (cached) return cached;
    if (!onDemandBoxes) return null;
    const box = await lookupPoBoxByBarcode(poId, barcode);
    if (box) cacheBox(box);
    return box;
  };

  const bumpSecuredCount = (productBarcode: string) => {
    if (!onDemandBoxes) return;
    setBoxStats((prev) =>
      prev
        ? {
            ...prev,
            scannedTotal: prev.scannedTotal + 1,
            scannedByProduct: {
              ...prev.scannedByProduct,
              [productBarcode]: (prev.scannedByProduct[productBarcode] ?? 0) + 1,
            },
          }
        : prev
    );
  };

  useEffect(() => {
    const loadData = async () => {
      const { data: poData } = await supabase.from("purchase_orders").select("*").eq("id", poId).single();
      if (poData) {
        setPo(poData);
        if (poData.packed_by && poData.packed_by !== "Unassigned") {
          setPackerName(poData.packed_by);
          setIsClaimed(true);
        }
      }

      const { data: itemsData } = await supabase.from("po_items").select("*").eq("po_id", poId).order("id");
      if (itemsData) setItems(itemsData);

      const boxCount = await fetchPoBoxCount(poId);
      const useOnDemand = boxCount > LARGE_PO_BOX_THRESHOLD;
      setOnDemandBoxes(useOnDemand);

      if (useOnDemand) {
        setBoxes([]);
        setBoxContents([]);
        setBoxStats(await fetchPoBoxStats(poId));
      } else {
        const boxData = await fetchPoBoxesForPo(poId);
        setBoxes(boxData);
        setBoxStats(null);
        if (poData?.carton_plan_status === "finalized" && boxData.length > 0) {
          setBoxContents(await fetchAllPoBoxContentsForPo(poId));
        } else {
          setBoxContents([]);
        }
      }
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
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
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

  const handleClaimPO = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = packerName.trim().toUpperCase();
    if (!cleanedName || cleanedName.length < 2) { playSound("error"); return; }
    playSound("success");
    await supabase.from("purchase_orders").update({ packed_by: cleanedName }).eq("id", poId);
    setPo({ ...po, packed_by: cleanedName });
    setIsClaimed(true);
  };

  const cartonPackMode = po?.carton_plan_status === "finalized";

  const pendingLinesForBox = (boxId: string) =>
    boxContents.filter((c) => c.po_box_id === boxId && c.scanned_qty < c.qty);

  const describePendingBox = (boxId: string) => {
    const lines = pendingLinesForBox(boxId);
    return lines
      .map((c) => {
        const item = items.find((i) => i.barcode === c.product_barcode);
        return `[${item?.product_name ?? c.product_barcode}] ×${c.qty - c.scanned_qty}`;
      })
      .join(", ");
  };

  const sealCarton = async (boxId: string) => {
    const box = boxes.find((b) => b.id === boxId);
    if (!box || box.is_scanned) return;

    const timestamp = new Date().toISOString();
    const lines = boxContents.filter((c) => c.po_box_id === boxId);

    const updatedItems = [...items];
    const itemPersistTasks = lines.map((line) => {
      const idx = updatedItems.findIndex((i) => i.barcode === line.product_barcode);
      if (idx === -1) return Promise.resolve();
      const newQty = (updatedItems[idx].scanned_qty ?? 0) + line.qty;
      const newHistory = [
        ...(Array.isArray(updatedItems[idx].scan_history) ? updatedItems[idx].scan_history : []),
        `${timestamp}|${packerName}|carton ${box.carton_number}`,
      ];
      updatedItems[idx] = { ...updatedItems[idx], scanned_qty: newQty, scan_history: newHistory, is_short: false };
      return supabase
        .from("po_items")
        .update({ scanned_qty: newQty, scan_history: newHistory, is_short: false })
        .eq("id", updatedItems[idx].id);
    });

    await Promise.all([
      supabase
        .from("po_boxes")
        .update({ is_scanned: true, packed_at: timestamp, packed_by: packerName })
        .eq("id", boxId),
      ...lines.map((line) =>
        supabase.from("po_box_contents").update({ scanned_qty: line.qty }).eq("id", line.id)
      ),
      ...itemPersistTasks,
    ]);

    const updatedBoxes = boxes.map((b) =>
      b.id === boxId ? { ...b, is_scanned: true, packed_at: timestamp, packed_by: packerName } : b
    );
    setBoxes(updatedBoxes);

    const updatedContents = boxContents.map((c) =>
      c.po_box_id === boxId ? { ...c, scanned_qty: c.qty } : c
    );
    setBoxContents(updatedContents);
    setItems(updatedItems);
    setActiveBoxId(null);

    if (onDemandBoxes && box) {
      bumpSecuredCount(box.product_barcode);
    }

    if (po && po.status === "Not Started") {
      await supabase.from("purchase_orders").update({ status: "Packing" }).eq("id", po.id);
      setPo({ ...po, status: "Packing" });
    }
  };

  const processCartonScan = async (scannedCode: string) => {
    const isProductBarcode = !!itemByBarcode[scannedCode];
    const matchedBox = isProductBarcode ? null : await resolveBoxByBarcode(scannedCode);

    if (matchedBox) {
      if (matchedBox.is_scanned) {
        playSound("error");
        setFeedback({
          message: `⚠️ DUPLICATE: Inner Box [Carton ${matchedBox.carton_number}] was already packed!`,
          type: "error",
        });
        return;
      }

      if (onDemandBoxes) {
        setBoxContents(await fetchPoBoxContentsForBox(matchedBox.id));
      }

      setActiveBoxId(matchedBox.id);
      playSound("stage");
      const pending = describePendingBox(matchedBox.id);
      setFeedback({
        message: `🔵 INNER BOX ${matchedBox.carton_number}: Scan product(s) — ${pending}`,
        type: "blue",
      });
      return;
    }

    if (activeBoxId && isProductBarcode) {
      const content = boxContents.find(
        (c) => c.po_box_id === activeBoxId && c.product_barcode === scannedCode
      );
      if (!content) {
        playSound("error");
        setFeedback({ message: `❌ MISMATCH: That product is not in this inner box.`, type: "error" });
        return;
      }
      if (content.scanned_qty >= content.qty) {
        playSound("error");
        setFeedback({ message: `⚠️ Already verified for this inner box.`, type: "error" });
        return;
      }

      const nextContents = boxContents.map((c) =>
        c.id === content.id ? { ...c, scanned_qty: c.qty } : c
      );
      setBoxContents(nextContents);
      await supabase.from("po_box_contents").update({ scanned_qty: content.qty }).eq("id", content.id);

      const stillPending = nextContents.filter(
        (c) => c.po_box_id === activeBoxId && c.scanned_qty < c.qty
      );

      if (stillPending.length === 0) {
        const box = boxes.find((b) => b.id === activeBoxId)!;
        await sealCarton(activeBoxId);
        playSound("complete");
        setFeedback({
          message: `✅ SECURED: Inner Box ${box.carton_number} of ${box.total_cartons} packed.`,
          type: "complete",
        });
      } else {
        playSound("success");
        setFeedback({
          message: `✓ Verified. Still need: ${describePendingBox(activeBoxId)}`,
          type: "blue",
        });
      }
      return;
    }

    if (isProductBarcode && !activeBoxId) {
      playSound("error");
      setFeedback({
        message: `⚠️ SCAN INNER LPN FIRST: Scan the inner box label, then scan each product in that box.`,
        type: "error",
      });
      return;
    }

    playSound("error");
    setFeedback({
      message: `❌ UNKNOWN BARCODE: Scan an inner LPN or a product in the active box.`,
      type: "error",
    });
  };

  const processScanCode = async (scannedCode: string) => {
    if (!scannedCode || scanInFlight.current) return;

    const now = Date.now();
    if (lastScanRef.current.code === scannedCode && now - lastScanRef.current.at < 500) return;
    lastScanRef.current = { code: scannedCode, at: now };

    scanInFlight.current = true;
    try {
    if (cartonPackMode) {
      await processCartonScan(scannedCode);
      return;
    }

    if (po && (po.status === "Completed" || po.status === "Partial Fulfillment")) {
      playSound("error");
      setFeedback({ message: `❌ LOCKED: This PO has already been completely fulfilled and locked.`, type: "error" });
      return;
    }

    const isProductBarcode = !!itemByBarcode[scannedCode];
    const matchedBox = isProductBarcode ? null : await resolveBoxByBarcode(scannedCode);
    const isBoxLabel = !!matchedBox;

    if (!isProductBarcode && !isBoxLabel) {
      playSound("error");
      setFeedback({ message: `❌ UNKNOWN BARCODE: This barcode belongs to neither a product nor an inner box.`, type: "error" });
      setStagedProductBarcode(null); 
      return;
    }

    if (isProductBarcode && !stagedProductBarcode) {
      const item = itemByBarcode[scannedCode];
      const currentlySecuredForThisItem = securedCountByProductBarcode[item.barcode] ?? 0;
      
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

    if (stagedProductBarcode && isBoxLabel && matchedBox) {
      const boxMatchesProduct =
        matchedBox.product_barcode === stagedProductBarcode ? matchedBox : undefined;
      
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
      const sealedBox: PoBoxRow = {
        ...boxMatchesProduct,
        is_scanned: true,
        packed_at: timestamp,
        packed_by: packerName,
      };
      if (onDemandBoxes) {
        cacheBox(sealedBox);
      } else {
        setBoxes((prev) => prev.map((b) => (b.id === sealedBox.id ? sealedBox : b)));
      }
      bumpSecuredCount(sealedBox.product_barcode);
      await supabase.from("po_boxes").update({ is_scanned: true, packed_at: timestamp, packed_by: packerName }).eq("id", boxMatchesProduct.id);

      const itemIndex = items.findIndex(i => i.barcode === stagedProductBarcode);
      const item = items[itemIndex];
      const newBoxCount = (securedCountByProductBarcode[item.barcode] ?? 0) + 1;
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
       const newItem = itemByBarcode[scannedCode];
       const currentlySecured = securedCountByProductBarcode[newItem.barcode] ?? 0;
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
    } finally {
      scanInFlight.current = false;
      inputRef.current?.focus();
    }
  };

  const handleHiddenScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    setBarcodeInput("");
    await processScanCode(code);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const possibleBarcode = searchQuery.trim();
      if (possibleBarcode.length > 5) {
        void processScanCode(possibleBarcode);
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

  if (cartonPackMode) {
    if (onDemandBoxes && boxStats) {
      effectiveCartonTarget = boxStats.totalBoxes;
      effectiveCartonScanned = boxStats.scannedTotal;
    } else {
      effectiveCartonTarget = boxes.length;
      effectiveCartonScanned = boxes.filter((b) => b.is_scanned).length;
    }
  } else {
    items.forEach((item) => {
      const securedForThisItem = securedCountByProductBarcode[item.barcode] ?? 0;
      if (item.is_short) {
        effectiveCartonTarget += securedForThisItem;
      } else {
        effectiveCartonTarget += item.inner_boxes;
      }
      effectiveCartonScanned += securedForThisItem;
    });
  }

  const progressPercent = effectiveCartonTarget === 0 ? 0 : Math.round((effectiveCartonScanned / effectiveCartonTarget) * 100);
  const isOrderFullyPacked = effectiveCartonTarget > 0 && effectiveCartonScanned === effectiveCartonTarget;
  const isHistorical = po?.status === "Completed" || po?.status === "Partial Fulfillment";

  if (!po) return <div className="p-8 text-center"><Loader2 className="animate-spin w-8 h-8 mx-auto text-blue-500" /></div>;

  if (needsCartonPlanning(po)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-xl border p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Inner box plan required</h2>
          <p className="text-gray-600 mb-6">Configure how SKUs are split across inner boxes before packing.</p>
          <Link href={`/plan/${poId}`} className="block bg-pink-600 text-white py-3 rounded-lg font-bold mb-3">
            Plan Inner Boxes
          </Link>
          <Link href="/dashboard" className="text-gray-600 text-sm">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!isClaimed) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8 z-50 fixed inset-0">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-10 text-center">
          <div className="bg-blue-100 text-blue-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><UserCircle className="w-10 h-10" /></div>
          <h1 className="text-3xl font-black text-gray-900 mb-2">{isHistorical ? "Audit Record" : "Check In"}</h1>
          <p className="text-gray-600 font-medium mb-8">
            {isHistorical ? "Enter your initials to view historic audit log." : "Type your initials to unlock this 2FA packing station."}
          </p>
          <form onSubmit={handleClaimPO}>
            <input ref={claimInputRef} type="text" placeholder="e.g., ADITYA" value={packerName} onChange={(e) => setPackerName(e.target.value)} className="w-full text-center text-2xl font-bold uppercase tracking-widest text-gray-900 border-2 border-gray-300 rounded-xl py-4 focus:outline-none focus:border-blue-500 mb-6" />
            <DashButton type="submit" variant="primary" size="lg" className="w-full rounded-xl py-4">Unlock Station</DashButton>
          </form>
          <div className="mt-6 border-t pt-6">
             <Link href="/dashboard"><DashButton variant="ghost" size="sm" className="text-gray-600 font-medium hover:text-gray-600">← Back to Dashboard</DashButton></Link>
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

    const aSecured = securedCountByProductBarcode[a.barcode] ?? 0;
    const bSecured = securedCountByProductBarcode[b.barcode] ?? 0;
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
            <Link href="/dashboard"><DashButton variant="ghost" size="sm" className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><ArrowLeft className="w-5 h-5 text-gray-700" /></DashButton></Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 border-b pb-2 mb-2">PO: {po.po_number}</h1>
              <div className="flex gap-6 items-center text-sm font-medium">
                <span className="text-blue-700 font-bold">{po.retailer_name}</span>
                <span className="flex items-center gap-1.5 text-gray-600 ml-4 border-l pl-4"><Calendar className="w-4 h-4" /> Received: {po.po_date}</span>
                <span className="flex items-center gap-1.5 text-red-600 font-bold border-l pl-4"><Truck className="w-4 h-4" /> Deadline: {po.delivery_date}</span>
                <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded ml-4 border border-green-200 font-bold"><UserCircle className="w-4 h-4" /> Packer: {packerName}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-3xl font-black text-blue-600">{progressPercent}%</div>
            <p className="text-gray-600 text-sm font-medium uppercase tracking-wider">
              {isHistorical ? "Fully Processed" : isOrderFullyPacked ? "Ready to Ship" : "Cartons Packed"}
            </p>
          </div>
        </header>

        <div className="w-full bg-gray-200 h-3">
          <div className={`h-3 transition-all duration-300 ease-out flex justify-end ${isOrderFullyPacked || isHistorical ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${progressPercent}%` }}></div>
        </div>

        <main className="flex-1 p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
          
          {isOrderFullyPacked || isHistorical ? (
            <div className="bg-green-50 border-2 border-green-500 p-8 rounded-xl shadow-lg text-center">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-black text-green-900 mb-2">Order Completed & Verified</h2>
              <p className="text-green-700 font-medium mb-6">Packed perfectly by <strong>{po.packed_by || packerName}</strong>.</p>
              <DashButton onClick={handleFinishAndPrint} variant="success" size="lg" className="px-8 py-4 rounded-lg text-lg w-full max-w-md mx-auto shadow-md">
                <Printer className="w-6 h-6" /> Print Official Packing Slip
              </DashButton>
            </div>
          ) : (
            <div className={`p-8 rounded-xl border-4 flex flex-col items-center justify-center text-center gap-4 shadow-sm transition-colors ${
              feedback.type === 'error' ? 'bg-red-50 border-red-500 text-red-900' :
              feedback.type === 'complete' ? 'bg-green-50 border-green-500 text-green-900' :
              feedback.type === 'blue' ? 'bg-blue-50 border-blue-500 text-blue-900 animate-pulse' :
              'bg-white border-gray-300 text-gray-600'
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
              <Search className="w-5 h-5 absolute left-3 text-gray-600" />
              <input ref={searchInputRef} type="text" placeholder="Search Product or Master Barcode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleSearchKeyDown} className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Filter className="w-5 h-5 text-gray-600" />
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
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                  <th className="p-4 w-12 text-center">2FA</th>
                  <th className="p-4">SKU Group & Exception Checks</th>
                  <th className="p-4 text-center">Inner Boxes Secured</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.length === 0 ? (
                  <tr><td colSpan={3} className="p-8 text-center text-gray-600 font-medium">No items match your search.</td></tr>
                ) : displayItems.map((item) => {
                  
                  const requiredCartons = cartonPackMode ? item.target_qty : item.inner_boxes;
                  const securedCartons = cartonPackMode
                    ? item.scanned_qty ?? 0
                    : securedCountByProductBarcode[item.barcode] ?? 0;
                  const isComplete = cartonPackMode
                    ? securedCartons >= item.target_qty
                    : securedCartons >= requiredCartons;
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
                         <QrCode className="w-6 h-6 text-gray-500 mx-auto" />}
                      </td>

                      <td className="p-4">
                        <p className={`font-bold text-lg leading-tight ${done ? 'text-gray-600 line-through' : 'text-gray-900'}`}>{item.product_name}</p>
                        <p className={`font-mono text-xs mt-1 ${done ? 'text-gray-600' : 'text-gray-600'}`}>Product Barcode: {item.barcode}</p>

                        <div className="flex items-center gap-4 mt-2">
                          {!done && !isHistorical && (
                            <DashButton onClick={() => handleMarkShortage(item.id, item.product_name)} className="text-amber-600 hover:text-amber-800 text-xs uppercase underline">
                              Report Missing Cartons
                            </DashButton>
                          )}
                          {isShort && (
                            <div className="flex items-center gap-3">
                              <span className="text-amber-600 text-[10px] font-bold uppercase bg-amber-100 px-2 py-0.5 rounded flex items-center border border-amber-200">
                                <AlertTriangle className="w-3 h-3 mr-1"/> Shortage Declared
                              </span>
                              {!isHistorical && (
                                <DashButton onClick={() => handleUndoShortage(item.id, item.product_name)} className="text-gray-600 hover:text-gray-900 text-xs uppercase pr-2">
                                  <RotateCcw className="w-3 h-3" /> UNDO
                                </DashButton>
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
                        <span className="text-gray-600 font-bold mx-2">/</span>
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
            <h2 className="text-xl font-bold text-gray-900 mb-1">PO Number: {po.po_number}</h2>
            <p className="text-sm font-medium">B2B Retailer: <strong>{po.retailer_name}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8 bg-gray-100 p-4 rounded-lg border border-gray-300">
           <div><p className="text-xs font-bold text-gray-600 uppercase">PO Date</p><p className="font-semibold text-lg text-gray-900">{po.po_date}</p></div>
           <div><p className="text-xs font-bold text-gray-600 uppercase">Delivery Deadline</p><p className="font-semibold text-lg text-gray-900">{po.delivery_date}</p></div>
           <div><p className="text-xs font-bold text-gray-600 uppercase">2FA Authorize User</p><p className="font-bold text-lg text-blue-800 uppercase">{po?.packed_by || packerName}</p></div>
           <div><p className="text-xs font-bold text-gray-600 uppercase">Print Timestamp</p><p className="font-semibold text-sm text-gray-900">{new Date().toLocaleString()}</p></div>
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