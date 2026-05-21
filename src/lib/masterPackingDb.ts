import { supabase } from "./supabaseClient";
import { generateMasterBarcode, sessionCodeFromId } from "./masterBoxBarcode";
import type {
  ManifestInnerBox,
  ManifestMasterBox,
  MasterBox,
  MasterBoxContent,
  MasterBoxContentRow,
  PackingSession,
  PoBoxRow,
  PurchaseOrderRow,
} from "../types/masterPacking";

export async function fetchActivePurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, retailer_name, status, po_date, delivery_date")
    .not("status", "in", '("Completed","Partial Fulfillment")')
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PurchaseOrderRow[];
}

export async function fetchPackingSessions(): Promise<PackingSession[]> {
  const { data, error } = await supabase
    .from("packing_sessions")
    .select("*")
    .neq("status", "completed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PackingSession[];
}

export async function createPackingSession(poIds: string[]): Promise<PackingSession> {
  if (poIds.length === 0) throw new Error("Select at least one PO.");

  const sessionCode = String(Date.now() % 100000000).padStart(8, "0");
  const { data: session, error: sessionError } = await supabase
    .from("packing_sessions")
    .insert([{ status: "draft", session_code: sessionCode }])
    .select()
    .single();
  if (sessionError) throw sessionError;
  if (!session) throw new Error("Session was not created (no row returned). Check RLS policies on packing_sessions.");

  const code = sessionCodeFromId(session.id);
  const { error: updateError } = await supabase
    .from("packing_sessions")
    .update({ session_code: code })
    .eq("id", session.id);
  if (updateError) throw updateError;

  const links = poIds.map((po_id) => ({ session_id: session.id, po_id }));
  const { error: linkError } = await supabase.from("packing_session_pos").insert(links);
  if (linkError) throw linkError;

  return { ...session, session_code: code } as PackingSession;
}

export async function fetchSession(sessionId: string): Promise<PackingSession | null> {
  const { data, error } = await supabase.from("packing_sessions").select("*").eq("id", sessionId).single();
  if (error) return null;
  return data as PackingSession;
}

export async function fetchSessionPos(sessionId: string): Promise<PurchaseOrderRow[]> {
  const { data: links, error: linkError } = await supabase
    .from("packing_session_pos")
    .select("po_id")
    .eq("session_id", sessionId);
  if (linkError) throw linkError;
  const poIds = (links ?? []).map((l: { po_id: string }) => l.po_id);
  if (poIds.length === 0) return [];

  const { data: pos, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, retailer_name, status, po_date, delivery_date")
    .in("id", poIds);
  if (error) throw error;
  return (pos ?? []) as PurchaseOrderRow[];
}

export async function fetchMasterBoxes(sessionId: string): Promise<MasterBox[]> {
  const { data, error } = await supabase
    .from("po_master_boxes")
    .select("*")
    .eq("session_id", sessionId)
    .order("box_number");
  if (error) throw error;
  return (data ?? []) as MasterBox[];
}

export async function createMasterBox(session: PackingSession): Promise<MasterBox> {
  const existing = await fetchMasterBoxes(session.id);
  const nextNumber = existing.length > 0 ? Math.max(...existing.map((b) => b.box_number)) + 1 : 1;
  const master_barcode = generateMasterBarcode(session.session_code, nextNumber);

  const { data, error } = await supabase
    .from("po_master_boxes")
    .insert([
      {
        session_id: session.id,
        master_barcode,
        box_number: nextNumber,
        status: "open",
      },
    ])
    .select()
    .single();
  if (error) throw error;

  if (session.status === "draft") {
    await supabase.from("packing_sessions").update({ status: "packing" }).eq("id", session.id);
  }

  return data as MasterBox;
}

export async function sealMasterBox(masterBoxId: string): Promise<void> {
  await supabase
    .from("po_master_boxes")
    .update({ status: "sealed", sealed_at: new Date().toISOString() })
    .eq("id", masterBoxId);
}

export async function reopenMasterBox(masterBoxId: string): Promise<void> {
  await supabase
    .from("po_master_boxes")
    .update({ status: "open", sealed_at: null })
    .eq("id", masterBoxId);
}

export async function deletePackingSession(sessionId: string): Promise<void> {
  const { error } = await supabase.from("packing_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}

export async function deleteMasterBox(masterBoxId: string): Promise<void> {
  const { error } = await supabase.from("po_master_boxes").delete().eq("id", masterBoxId);
  if (error) throw error;
}

export async function removeInnerFromMaster(contentId: string): Promise<void> {
  const { error } = await supabase.from("po_master_box_contents").delete().eq("id", contentId);
  if (error) throw error;
}

export async function findInnerAssignment(
  poBoxId: string
): Promise<MasterBoxContent | null> {
  const { data, error } = await supabase
    .from("po_master_box_contents")
    .select("*")
    .eq("po_box_id", poBoxId)
    .maybeSingle();
  if (error) return null;
  return data as MasterBoxContent | null;
}

export async function fetchMasterBoxContents(masterBoxId: string): Promise<MasterBoxContentRow[]> {
  const { data: contents, error } = await supabase
    .from("po_master_box_contents")
    .select("*")
    .eq("master_box_id", masterBoxId)
    .order("scanned_at", { ascending: true });
  if (error) throw error;
  if (!contents?.length) return [];

  const rows = contents as MasterBoxContent[];
  const poIds = [...new Set(rows.map((c) => c.po_id))];
  const poBoxIds = rows.map((c) => c.po_box_id);

  const { data: pos } = await supabase.from("purchase_orders").select("id, po_number").in("id", poIds);
  const poNumberById = Object.fromEntries((pos ?? []).map((p: { id: string; po_number: string }) => [p.id, p.po_number]));

  const { data: boxes } = await supabase.from("po_boxes").select("id, product_barcode").in("id", poBoxIds);
  const productBarcodeByBoxId = Object.fromEntries(
    (boxes ?? []).map((b: { id: string; product_barcode: string }) => [b.id, b.product_barcode])
  );

  const { data: items } = await supabase
    .from("po_items")
    .select("po_id, barcode, product_name")
    .in("po_id", poIds);

  const productNameByKey: Record<string, string> = {};
  (items ?? []).forEach((it: { po_id: string; barcode: string; product_name: string }) => {
    productNameByKey[`${it.po_id}:${it.barcode}`] = it.product_name;
  });

  return rows.map((c) => {
    const pb = productBarcodeByBoxId[c.po_box_id] ?? "";
    return {
      ...c,
      po_number: poNumberById[c.po_id] ?? "Unknown",
      product_name: productNameByKey[`${c.po_id}:${pb}`] ?? "Aeris Product",
    };
  });
}

export async function fetchSessionPoIds(sessionId: string): Promise<string[]> {
  const { data, error } = await supabase.from("packing_session_pos").select("po_id").eq("session_id", sessionId);
  if (error) throw error;
  return (data ?? []).map((r: { po_id: string }) => r.po_id);
}

export async function findInnerBoxInSession(
  sessionId: string,
  innerBarcode: string
): Promise<(PoBoxRow & { po_number: string; product_name: string }) | null> {
  const poIds = await fetchSessionPoIds(sessionId);
  if (poIds.length === 0) return null;

  const { data: box, error } = await supabase
    .from("po_boxes")
    .select("*")
    .eq("box_barcode", innerBarcode.trim())
    .in("po_id", poIds)
    .maybeSingle();
  if (error || !box) return null;

  const { data: po } = await supabase.from("purchase_orders").select("po_number").eq("id", box.po_id).single();
  const { data: item } = await supabase
    .from("po_items")
    .select("product_name")
    .eq("po_id", box.po_id)
    .eq("barcode", box.product_barcode)
    .maybeSingle();

  return {
    ...(box as PoBoxRow),
    po_number: po?.po_number ?? "Unknown PO",
    product_name: item?.product_name ?? "Aeris Product",
  };
}

export async function findMasterBoxInSession(
  sessionId: string,
  masterBarcode: string
): Promise<MasterBox | null> {
  const { data, error } = await supabase
    .from("po_master_boxes")
    .select("*")
    .eq("session_id", sessionId)
    .eq("master_barcode", masterBarcode.trim().toUpperCase())
    .maybeSingle();
  if (error) return null;
  return data as MasterBox | null;
}

export async function isInnerBoxAlreadyAssigned(poBoxId: string): Promise<boolean> {
  const { data } = await supabase.from("po_master_box_contents").select("id").eq("po_box_id", poBoxId).maybeSingle();
  return !!data;
}

export async function assignInnerToMaster(
  masterBox: MasterBox,
  inner: PoBoxRow & { po_number?: string }
): Promise<MasterBoxContent> {
  const { data, error } = await supabase
    .from("po_master_box_contents")
    .insert([
      {
        master_box_id: masterBox.id,
        po_box_id: inner.id,
        inner_barcode: inner.box_barcode,
        po_id: inner.po_id,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data as MasterBoxContent;
}

export async function fetchContentsForSession(sessionId: string): Promise<
  (MasterBoxContent & {
    master_barcode: string;
    box_number: number;
  })[]
> {
  const masters = await fetchMasterBoxes(sessionId);
  if (masters.length === 0) return [];

  const masterIds = masters.map((m) => m.id);
  const { data, error } = await supabase.from("po_master_box_contents").select("*").in("master_box_id", masterIds);
  if (error) throw error;

  const byId = Object.fromEntries(masters.map((m) => [m.id, m]));
  return (data ?? []).map((c: MasterBoxContent) => ({
    ...c,
    master_barcode: byId[c.master_box_id].master_barcode,
    box_number: byId[c.master_box_id].box_number,
  }));
}

export async function completePackingSession(sessionId: string, packedBy: string): Promise<void> {
  await supabase
    .from("packing_sessions")
    .update({
      status: "completed",
      packed_by: packedBy,
      completed_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  const openBoxes = await fetchMasterBoxes(sessionId);
  for (const box of openBoxes.filter((b) => b.status === "open")) {
    await sealMasterBox(box.id);
  }
}

export async function buildManifest(sessionId: string): Promise<{
  session: PackingSession;
  pos: PurchaseOrderRow[];
  master_boxes: ManifestMasterBox[];
  total_master_boxes: number;
  total_inner_boxes: number;
}> {
  const session = await fetchSession(sessionId);
  if (!session) throw new Error("Session not found");

  const pos = await fetchSessionPos(sessionId);
  const masters = await fetchMasterBoxes(sessionId);
  const poIds = pos.map((p) => p.id);

  const masterIds = masters.map((m) => m.id);
  const { data: allContents } =
    masterIds.length > 0
      ? await supabase.from("po_master_box_contents").select("*").in("master_box_id", masterIds)
      : { data: [] };

  const contents = (allContents ?? []) as MasterBoxContent[];
  const poNumberById = Object.fromEntries(pos.map((p) => [p.id, p.po_number]));

  const { data: items } =
    poIds.length > 0
      ? await supabase.from("po_items").select("po_id, barcode, product_name").in("po_id", poIds)
      : { data: [] };

  const productNameByPoBarcode: Record<string, string> = {};
  (items ?? []).forEach((it: { po_id: string; barcode: string; product_name: string }) => {
    productNameByPoBarcode[`${it.po_id}:${it.barcode}`] = it.product_name;
  });

  const { data: boxes } =
    poIds.length > 0 ? await supabase.from("po_boxes").select("*").in("po_id", poIds) : { data: [] };
  const boxById = Object.fromEntries((boxes ?? []).map((b: PoBoxRow) => [b.id, b]));

  const master_boxes: ManifestMasterBox[] = masters.map((master) => {
    const innerForMaster = contents.filter((c) => c.master_box_id === master.id);
    const inner_boxes: ManifestInnerBox[] = innerForMaster.map((c) => {
      const box = boxById[c.po_box_id];
      const productKey = box ? `${c.po_id}:${box.product_barcode}` : "";
      return {
        inner_barcode: c.inner_barcode,
        po_number: poNumberById[c.po_id] ?? "Unknown",
        product_name: productNameByPoBarcode[productKey] ?? "Aeris Product",
        carton_number: box?.carton_number ?? 0,
        scanned_at: c.scanned_at,
      };
    });
    return {
      box_number: master.box_number,
      master_barcode: master.master_barcode,
      status: master.status,
      inner_boxes,
    };
  });

  return {
    session,
    pos,
    master_boxes,
    total_master_boxes: masters.length,
    total_inner_boxes: contents.length,
  };
}
