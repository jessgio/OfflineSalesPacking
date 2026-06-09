import { supabase } from "./supabaseClient";
import { getSupabaseErrorMessage } from "./supabaseError";
import { mentionHandleFromEmail } from "./marketingMentions";
import type {
  MarketingChatParticipant,
  MarketingRequestMessage,
  MarketingSession,
  MarketingUserRole,
} from "../types/marketing";

export async function fetchChatParticipants(): Promise<MarketingChatParticipant[]> {
  const { data, error } = await supabase
    .from("marketing_users")
    .select("email, display_name, role")
    .eq("active", true)
    .order("role")
    .order("display_name");

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load chat participants"));

  return (data ?? []).map((row) => ({
    email: row.email,
    display_name: row.display_name,
    role: row.role as MarketingUserRole,
    handle: mentionHandleFromEmail(row.email),
  }));
}

export async function fetchRequestMessages(requestId: string): Promise<MarketingRequestMessage[]> {
  const { data, error } = await supabase
    .from("marketing_request_messages")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(getSupabaseErrorMessage(error, "Failed to load messages"));
  return data ?? [];
}

export async function postRequestMessage(
  session: MarketingSession,
  requestId: string,
  body: string
): Promise<MarketingRequestMessage> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Message cannot be empty.");

  const { data, error } = await supabase
    .from("marketing_request_messages")
    .insert({
      request_id: requestId,
      author_email: session.email,
      author_name: session.displayName,
      author_role: session.role,
      body: trimmed,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(getSupabaseErrorMessage(error, "Failed to send message"));
  }

  return data;
}
