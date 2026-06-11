import type { MarketingChatParticipant, MarketingUserRole } from "../types/marketing";

export function mentionHandleFromEmail(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? email.toLowerCase();
}

export function participantHandle(participant: MarketingChatParticipant): string {
  return participant.handle;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ROLE_MENTION_ALIASES: Record<string, MarketingUserRole[]> = {
  fulfillment: ["fulfillment", "admin"],
  marketing: ["requester"],
  requester: ["requester"],
  admin: ["admin"],
};

function addMention(mentioned: Set<string>, email: string, excludeEmail?: string): void {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return;
  if (excludeEmail && normalized === normalizeEmail(excludeEmail)) return;
  mentioned.add(normalized);
}

/** Find @handle, @display name, and role alias tokens in message body. */
export function parseMentionedEmails(
  body: string,
  participants: MarketingChatParticipant[],
  excludeEmail?: string
): string[] {
  const byHandle = new Map(
    participants.map((p) => [p.handle.toLowerCase(), p.email.toLowerCase()])
  );

  const mentioned = new Set<string>();

  const sortedByDisplayName = [...participants].sort(
    (a, b) => b.display_name.length - a.display_name.length
  );
  for (const participant of sortedByDisplayName) {
    const escaped = escapeRegExp(participant.display_name.trim());
    if (!escaped) continue;
    const nameRegex = new RegExp(`@${escaped}(?=\\s|$|[.,!?;:])`, "i");
    if (nameRegex.test(body)) {
      addMention(mentioned, participant.email, excludeEmail);
    }
  }

  const regex = /@([a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const token = match[1].toLowerCase();
    const email = byHandle.get(token);
    if (email) {
      addMention(mentioned, email, excludeEmail);
      continue;
    }

    const roles = ROLE_MENTION_ALIASES[token];
    if (roles) {
      for (const participant of participants) {
        if (roles.includes(participant.role)) {
          addMention(mentioned, participant.email, excludeEmail);
        }
      }
    }
  }

  return [...mentioned];
}

export function renderMessageWithMentions(
  body: string,
  participants: MarketingChatParticipant[]
): Array<{ type: "text" | "mention"; value: string }> {
  const handles = new Set(participants.map((p) => p.handle.toLowerCase()));
  const parts: Array<{ type: "text" | "mention"; value: string }> = [];
  const regex = /@([a-zA-Z0-9._-]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const handle = match[1];
    parts.push({
      type: handles.has(handle.toLowerCase()) ? "mention" : "text",
      value: match[0],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push({ type: "text", value: body.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: body }];
}
