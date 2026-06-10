"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { DashButton, cx, fieldInput } from "../dashboard/primitives";
import {
  fetchChatParticipants,
  fetchRequestMessages,
  markRequestChatRead,
  postRequestMessage,
} from "../../lib/marketingChatDb";
import { renderMessageWithMentions } from "../../lib/marketingMentions";
import type {
  MarketingChatParticipant,
  MarketingRequestMessage,
  MarketingSession,
} from "../../types/marketing";

async function notifyChatMessage(messageId: string): Promise<void> {
  await fetch("/api/marketing-chat/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
}

export function RequestChat({
  requestId,
  packageLabel,
  session,
  defaultOpen = false,
  unreadCount = 0,
  onRead,
}: {
  requestId: string;
  packageLabel: string;
  session: MarketingSession | null;
  defaultOpen?: boolean;
  unreadCount?: number;
  onRead?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<MarketingRequestMessage[]>([]);
  const [participants, setParticipants] = useState<MarketingChatParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchRequestMessages(requestId);
      setMessages(data);
      if (session) {
        await markRequestChatRead(session, requestId);
        onRead?.();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load chat");
    }
  }, [requestId, session, onRead]);

  useEffect(() => {
    fetchChatParticipants().then(setParticipants).catch(() => setParticipants([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadMessages().finally(() => setLoading(false));
  }, [open, loadMessages]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [open, loadMessages]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  const mentionCandidates = (() => {
    if (mentionQuery === null || !session) return [];
    const q = mentionQuery.toLowerCase();
    return participants
      .filter((p) => p.email !== session.email)
      .filter(
        (p) =>
          p.handle.toLowerCase().includes(q) ||
          p.display_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
      )
      .slice(0, 6);
  })();

  const handleDraftChange = (value: string) => {
    setDraft(value);
    const el = inputRef.current;
    if (!el) return;

    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const atMatch = before.match(/@([a-zA-Z0-9._-]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (participant: MarketingChatParticipant) => {
    const el = inputRef.current;
    if (!el) return;

    const cursor = el.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const after = draft.slice(cursor);
    const atStart = before.lastIndexOf("@");
    if (atStart === -1) return;

    const next = `${before.slice(0, atStart)}@${participant.handle} ${after}`;
    setDraft(next);
    setMentionQuery(null);
    el.focus();
  };

  const handleSend = async () => {
    if (!session || !draft.trim()) return;
    setSending(true);
    setError("");

    try {
      const message = await postRequestMessage(session, requestId, draft);
      setDraft("");
      setMentionQuery(null);
      await loadMessages();
      await notifyChatMessage(message.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionCandidates.length > 0 && mentionQuery !== null) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-bold text-violet-700 hover:text-violet-900"
      >
        <MessageSquare className="w-4 h-4" />
        Discussion
        {!open && unreadCount > 0 ? (
          <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
            {unreadCount} new
          </span>
        ) : messages.length > 0 ? (
          <span className="text-xs font-bold bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full">
            {messages.length}
          </span>
        ) : null}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
          <div className="px-3 py-2 bg-white border-b border-gray-100 text-xs text-gray-600">
            Thread for <span className="font-semibold text-gray-800">{packageLabel}</span> · mention with{" "}
            <span className="font-mono text-violet-700">@handle</span> (e.g. @marketing, @fulfillment)
          </div>

          <div ref={listRef} className="max-h-48 overflow-y-auto px-3 py-2 space-y-2 min-h-[4rem]">
            {loading && messages.length === 0 ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-4">No messages yet. Start the conversation.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cx(
                    "text-sm rounded-lg px-3 py-2",
                    msg.author_email === session?.email
                      ? "bg-violet-100 text-violet-950 ml-6"
                      : "bg-white border border-gray-200 mr-6"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-xs">{msg.author_name}</span>
                    <span
                      className={cx(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                        msg.author_role === "admin" ? "bg-slate-200 text-slate-700" : "bg-pink-100 text-pink-800"
                      )}
                    >
                      {msg.author_role}
                    </span>
                    <span className="text-[10px] text-gray-500 ml-auto">
                      {new Date(msg.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="leading-snug whitespace-pre-wrap break-words">
                    {renderMessageWithMentions(msg.body, participants).map((part, i) =>
                      part.type === "mention" ? (
                        <span key={i} className="font-bold text-violet-700 bg-violet-50 px-0.5 rounded">
                          {part.value}
                        </span>
                      ) : (
                        <span key={i}>{part.value}</span>
                      )
                    )}
                  </p>
                </div>
              ))
            )}
          </div>

          {session ? (
            <div className="p-3 bg-white border-t border-gray-100 relative">
              {mentionCandidates.length > 0 && (
                <ul className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-36 overflow-auto">
                  {mentionCandidates.map((p, i) => (
                    <li key={p.email}>
                      <button
                        type="button"
                        onClick={() => insertMention(p)}
                        className={cx(
                          "w-full text-left px-3 py-2 text-sm hover:bg-violet-50",
                          i === mentionIndex && "bg-violet-50"
                        )}
                      >
                        <span className="font-mono font-bold text-violet-700">@{p.handle}</span>
                        <span className="text-gray-600 ml-2">{p.display_name}</span>
                        <span className="text-[10px] uppercase text-gray-500 ml-1">({p.role})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Write a message… Use @fulfillment or @marketing to notify"
                  className={`${fieldInput} resize-none text-sm flex-1`}
                />
                <DashButton
                  type="button"
                  variant="primary"
                  size="md"
                  className="self-end shrink-0"
                  disabled={sending || !draft.trim()}
                  onClick={handleSend}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </DashButton>
              </div>
              {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </div>
          ) : (
            <p className="px-3 py-3 text-xs text-gray-600 border-t border-gray-100 bg-white">
              Sign in to join this discussion.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
