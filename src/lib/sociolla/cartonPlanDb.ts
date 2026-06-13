import { supabase } from "../supabaseClient";
import type { CartonPlanBox } from "../../types/cartonPlan";

export async function persistCartonPlanDraft(poId: string, plan: CartonPlanBox[]): Promise<void> {
  const { error } = await supabase.from("po_carton_plans").upsert({
    po_id: poId,
    plan,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function loadCartonPlanDraft(poId: string): Promise<CartonPlanBox[] | null> {
  const { data, error } = await supabase.from("po_carton_plans").select("plan").eq("po_id", poId).maybeSingle();
  if (error) throw error;
  if (data?.plan && Array.isArray(data.plan)) {
    return data.plan as CartonPlanBox[];
  }
  return null;
}
