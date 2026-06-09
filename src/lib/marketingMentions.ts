import type { MarketingChatParticipant } from "../types/marketing";

export function mentionHandleFromEmail(email: string): string {
  return email.split("@")[0]?.toLowerCase() ?? email.toLowerCase();
}

export function participantHandle(participant: MarketingChatParticipant): string {
  return participant.handle;
}

/** Find @handle tokens in message body (handle = email local-part). */
export function parseMentionedEmails(
  body: string,
  participants: MarketingChatParticipant[],
  excludeEmail?: string
): string[] {
  const byHandle = new Map(
    participants.map((p) => [p.handle.toLowerCase(), p.email.toLowerCase()])
  );

  const mentioned = new Set<string>();
  const regex = /@([a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const email = byHandle.get(match[1].toLowerCase());
    if (email && email !== excludeEmail?.toLowerCase()) {
      mentioned.add(email);
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
