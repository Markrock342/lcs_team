"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Paperclip,
  FileText,
  X,
  Hash,
  Plus,
  ChevronLeft,
  Users,
  Pencil,
  Trash2,
  MoreVertical,
  CornerDownRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Input, Modal, Textarea, ProfileRoleBadges } from "@/components/ui";
import { ChatMessageItem } from "@/components/ChatMessageItem";
import { uploadFile, isImageFile } from "@/lib/upload";
import { slugifyChannelName, formatChannelDisplay } from "@/lib/channels";
import { parseMentions, notifyUser, logActivity } from "@/lib/activity";
import { isOnline, formatPresenceStatus } from "@/lib/presence";
import type { Channel, Message, Profile } from "@/lib/types";
import { format, isToday, isYesterday } from "date-fns";
import { th } from "date-fns/locale";

function formatMsgTime(date: string) {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm", { locale: th });
  if (isYesterday(d)) return `เมื่อวาน ${format(d, "HH:mm", { locale: th })}`;
  return format(d, "d MMM HH:mm", { locale: th });
}

function formatDateDivider(date: string) {
  const d = new Date(date);
  if (isToday(d)) return "วันนี้";
  if (isYesterday(d)) return "เมื่อวาน";
  return format(d, "d MMMM yyyy", { locale: th });
}

const MESSAGE_SELECT = `
  *,
  sender:profiles(*),
  reply_to:messages!reply_to_id(
    id, content, sender_id, deleted_at, file_name,
    sender:profiles(display_name)
  ),
  reads:message_reads(
    user_id, read_at,
    reader:profiles(id, display_name, username)
  )
`;

export default function ChatPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMobileChannels, setShowMobileChannels] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editingChannel, setEditingChannel] = useState(false);
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [, setPresenceTick] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendAbortRef = useRef<AbortController | null>(null);

  const filePreviewUrl = useMemo(
    () => (file && isImageFile(file.type) ? URL.createObjectURL(file) : null),
    [file]
  );

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const loadMessages = useCallback(async (channelId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages(data ?? []);
    return data ?? [];
  }, []);

  const markMessagesAsRead = useCallback(
    async (msgs: Message[], userId: string) => {
      const ids = msgs
        .filter((m) => m.sender_id !== userId && !m.deleted_at)
        .map((m) => m.id);
      if (!ids.length) return;

      const supabase = createClient();
      await supabase.from("message_reads").upsert(
        ids.map((message_id) => ({ message_id, user_id: userId })),
        { onConflict: "message_id,user_id" }
      );
    },
    []
  );

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [channelsRes, profilesRes] = await Promise.all([
        supabase.from("channels").select("*").order("created_at", { ascending: true }),
        supabase.from("profiles").select("*"),
      ]);

      const channelList = channelsRes.data ?? [];
      setChannels(channelList);
      setProfiles(profilesRes.data ?? []);

      if (user) {
        const profile = profilesRes.data?.find((p) => p.id === user.id);
        setCurrentUser(profile ?? null);
      }

      const first = channelList.find((c) => c.name === "general") ?? channelList[0] ?? null;
      if (first) {
        setActiveChannel(first);
        const msgs = await loadMessages(first.id);
        if (user) await markMessagesAsRead(msgs, user.id);
        setShowMobileChannels(false);
      }

      setLoading(false);
    }

    init();
  }, [loadMessages, markMessagesAsRead]);

  useEffect(() => {
    if (!activeChannel || !currentUser) return;

    let cancelled = false;

    async function sync() {
      const msgs = await loadMessages(activeChannel!.id);
      if (!cancelled) await markMessagesAsRead(msgs, currentUser!.id);
    }

    sync();
    const supabase = createClient();

    const msgChannel = supabase
      .channel(`messages:${activeChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          const { data: full } = await supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("id", newMsg.id)
            .single();

          if (!full) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === full.id)) return prev;
            return [...prev, full];
          });

          if (full.sender_id !== currentUser?.id) {
            await markMessagesAsRead([full], currentUser!.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        async (payload) => {
          const updated = payload.new as Message;
          const { data: full } = await supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("id", updated.id)
            .single();
          if (!full) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === full.id ? full : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reads" },
        (payload) => {
          const read = payload.new as { message_id: string; user_id: string; read_at: string };
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== read.message_id) return m;
              const existing = m.reads ?? [];
              if (existing.some((r) => r.user_id === read.user_id)) return m;
              const reader = profiles.find((p) => p.id === read.user_id);
              return {
                ...m,
                reads: [
                  ...existing,
                  {
                    user_id: read.user_id,
                    read_at: read.read_at,
                    reader: reader
                      ? {
                          id: reader.id,
                          display_name: reader.display_name,
                          username: reader.username,
                        }
                      : null,
                  },
                ],
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(msgChannel);
    };
  }, [activeChannel, loadMessages, markMessagesAsRead, currentUser, profiles]);

  useEffect(() => {
    const supabase = createClient();
    const chSub = supabase
      .channel("channels-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channels" },
        (payload) => {
          const ch = payload.new as Channel;
          setChannels((prev) => {
            if (prev.some((c) => c.id === ch.id)) return prev;
            return [...prev, ch];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chSub);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const presenceSub = supabase
      .channel("profiles-presence")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updated = payload.new as Profile;
          setProfiles((prev) =>
            prev.map((p) =>
              p.id === updated.id
                ? { ...p, last_seen_at: updated.last_seen_at }
                : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceSub);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPresenceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannel]);

  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setShowMobileChannels(false);
    setReplyTo(null);
    isNearBottomRef.current = true;
  }

  useEffect(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;

    function onScroll() {
      const node = messagesScrollRef.current;
      if (!node) return;
      isNearBottomRef.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    }

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [activeChannel, showMobileChannels]);

  async function handleCreateChannel(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugifyChannelName(newChannelName);
    if (!slug) {
      setCreateError("ชื่อแชannel ไม่ถูกต้อง");
      return;
    }
    if (channels.some((c) => c.name === slug)) {
      setCreateError("ชื่อนี้มีแล้ว");
      return;
    }

    setCreating(true);
    setCreateError("");
    const supabase = createClient();

    const { data, error } = await supabase
      .from("channels")
      .insert({
        name: slug,
        description: newChannelDesc.trim() || null,
        created_by: currentUser?.id,
      })
      .select()
      .single();

    setCreating(false);

    if (error) {
      if (error.message.includes("does not exist")) {
        setCreateError("รัน supabase/add-channels.sql ใน Supabase ก่อน");
      } else {
        setCreateError(error.message);
      }
      return;
    }

    if (data) {
      setChannels((prev) => [...prev, data]);
      setActiveChannel(data);
      setMessages([]);
      setShowMobileChannels(false);
    }

    setNewChannelName("");
    setNewChannelDesc("");
    setCreateOpen(false);
    await logActivity("create", "channel", data?.id ?? null, slug);
  }

  function openEditChannel() {
    if (!activeChannel) return;
    setEditName(activeChannel.name);
    setEditDesc(activeChannel.description ?? "");
    setEditOpen(true);
    setChannelMenuOpen(false);
  }

  async function handleEditChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChannel) return;
    const slug = slugifyChannelName(editName);
    if (!slug) return;

    setEditingChannel(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("channels")
      .update({ name: slug, description: editDesc.trim() || null })
      .eq("id", activeChannel.id)
      .select()
      .single();

    setEditingChannel(false);
    if (error || !data) return;

    setChannels((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    setActiveChannel(data);
    setEditOpen(false);
    await logActivity("update", "channel", data.id, slug);
  }

  async function handleDeleteChannel() {
    if (!activeChannel || activeChannel.name === "general") return;
    if (!confirm(`ลบแชannel #${activeChannel.name}?`)) return;

    const supabase = createClient();
    await supabase.from("channels").delete().eq("id", activeChannel.id);
    setChannels((prev) => prev.filter((c) => c.id !== activeChannel.id));
    const next = channels.find((c) => c.id !== activeChannel.id) ?? null;
    setActiveChannel(next);
    if (next) loadMessages(next.id);
    else setMessages([]);
    setChannelMenuOpen(false);
    await logActivity("delete", "channel", activeChannel.id, activeChannel.name);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (!item.type.startsWith("image/")) continue;
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) return;
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      setFile(
        new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type })
      );
      return;
    }
  }

  async function handleDeleteMessage(msg: Message) {
    if (!confirm("ลบข้อความนี้?")) return;
    const supabase = createClient();
    const deleted_at = new Date().toISOString();
    const { error } = await supabase
      .from("messages")
      .update({ deleted_at })
      .eq("id", msg.id);

    if (!error) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, deleted_at } : m))
      );
    }
  }

  function cancelSend() {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    setSending(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !file) return;
    if (!currentUser || !activeChannel) return;

    setSending(true);
    sendAbortRef.current = new AbortController();
    const signal = sendAbortRef.current.signal;
    const supabase = createClient();

    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_type: string | null = null;

    if (file) {
      const uploaded = await uploadFile(file, "chat", signal);
      if (signal.aborted) {
        setSending(false);
        sendAbortRef.current = null;
        return;
      }
      if (uploaded) {
        file_url = uploaded.url;
        file_name = file.name;
        file_type = file.type;
      }
    }

    const mentionIds = parseMentions(content, profiles);
    const replyId = replyTo?.deleted_at ? null : replyTo?.id ?? null;

    const { data: msgData } = await supabase
      .from("messages")
      .insert({
        channel_id: activeChannel.id,
        sender_id: currentUser.id,
        content: content.trim() || null,
        file_url,
        file_name,
        file_type,
        mentioned_ids: mentionIds,
        reply_to_id: replyId,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (signal.aborted) {
      if (msgData?.id) {
        await supabase
          .from("messages")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", msgData.id);
      }
      setSending(false);
      sendAbortRef.current = null;
      return;
    }

    for (const uid of mentionIds) {
      if (uid !== currentUser.id) {
        await notifyUser(uid, `💬 ถูก mention ใน #${activeChannel.name}`, content.trim().slice(0, 80), "/chat");
      }
    }

    await logActivity("comment", "message", msgData?.id ?? null, `#${activeChannel.name}`);

    setContent("");
    setFile(null);
    setReplyTo(null);
    setSending(false);
    sendAbortRef.current = null;

    if (msgData) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msgData.id)) return prev;
        return [...prev, msgData];
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ยังไม่มี channels table
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in">
        <Hash className="text-accent mb-4" size={40} />
        <h2 className="text-xl font-bold mb-2">ยังไม่มีแชannel</h2>
        <p className="text-muted text-sm max-w-sm mb-6">
          รันไฟล์ <code className="text-accent">supabase/add-channels.sql</code>{" "}
          ใน Supabase SQL Editor ก่อน แล้ว refresh หน้านี้
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={18} /> สร้างแชannel แรก
        </Button>
        <CreateChannelModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          name={newChannelName}
          desc={newChannelDesc}
          error={createError}
          creating={creating}
          onNameChange={setNewChannelName}
          onDescChange={setNewChannelDesc}
          onSubmit={handleCreateChannel}
        />
      </div>
    );
  }

  let lastDate = "";

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 h-full max-h-full border border-brand rounded-2xl overflow-hidden bg-card animate-fade-in">
      {/* Channel sidebar — Discord style */}
      <aside
        className={`${
          showMobileChannels ? "flex" : "hidden"
        } lg:flex flex-col w-full lg:w-60 bg-sidebar border-r border-brand shrink-0 min-h-0`}
      >
        <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
          <h2 className="font-semibold text-sm tracking-wide">แชannels</h2>
          <button
            onClick={() => setCreateOpen(true)}
            className="p-1.5 rounded-lg hover:bg-card-hover text-muted hover:text-accent transition-colors"
            title="สร้างแชannel"
          >
            <Plus size={18} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch p-2 space-y-0.5">
          {channels.map((ch) => {
            const active = activeChannel?.id === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => selectChannel(ch)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                <Hash size={16} className="shrink-0 opacity-60" />
                <span className="truncate">{ch.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Team presence */}
        <div className="p-3 border-t border-brand">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
            <Users size={12} /> ทีม — {profiles.length}
            <span className="normal-case tracking-normal">
              · {profiles.filter((p) => isOnline(p.last_seen_at)).length} ออนไลน์
            </span>
          </p>
          <div className="space-y-2 max-h-36 overflow-y-auto overscroll-contain scroll-touch">
            {profiles.map((p) => {
              const online = isOnline(p.last_seen_at);
              return (
                <div key={p.id} className="flex items-start gap-2 text-xs min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                      online ? "bg-emerald-400" : "bg-zinc-500"
                    }`}
                    title={online ? "ออนไลน์" : "ออฟไลน์"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium">{p.display_name}</span>
                      <ProfileRoleBadges profile={p} size="xs" />
                    </div>
                    <p
                      className={`text-[10px] truncate ${
                        online ? "text-emerald-400" : "text-muted"
                      }`}
                    >
                      {formatPresenceStatus(p.last_seen_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main chat */}
      <div
        className={`${
          showMobileChannels ? "hidden" : "flex"
        } lg:flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden`}
      >
        {activeChannel ? (
          <>
            {/* Channel header */}
            <div className="px-4 py-3 border-b border-brand flex items-center gap-3 shrink-0 bg-sidebar/50">
              <button
                onClick={() => setShowMobileChannels(true)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-card-hover text-muted"
              >
                <ChevronLeft size={20} />
              </button>
              <Hash size={20} className="text-muted shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold truncate">{activeChannel.name}</h1>
                {activeChannel.description && (
                  <p className="text-xs text-muted truncate">
                    {activeChannel.description}
                  </p>
                )}
              </div>
              <div className="relative shrink-0">
                <button
                  onClick={() => setChannelMenuOpen(!channelMenuOpen)}
                  className="p-1.5 rounded-lg hover:bg-card-hover text-muted"
                >
                  <MoreVertical size={18} />
                </button>
                {channelMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg z-10 py-1 min-w-[140px]">
                    <button
                      onClick={openEditChannel}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-card-hover"
                    >
                      <Pencil size={14} /> แก้ไข
                    </button>
                    {activeChannel.name !== "general" && (
                      <button
                        onClick={handleDeleteChannel}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 size={14} /> ลบ
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Messages — Discord layout */}
            <div
              ref={messagesScrollRef}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch px-4 py-4 space-y-1"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                    <Hash className="text-accent" size={28} />
                  </div>
                  <h3 className="font-semibold text-lg">
                    ยินดีต้อนรับสู่ {formatChannelDisplay(activeChannel.name)}
                  </h3>
                  <p className="text-sm text-muted mt-1">
                    {activeChannel.description ?? "เริ่มคุยกันในแชannel นี้ได้เลย"}
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const msgDate = formatDateDivider(msg.created_at);
                  const showDivider = msgDate !== lastDate;
                  lastDate = msgDate;

                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="flex items-center gap-3 my-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted font-medium px-2">
                            {msgDate}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      <ChatMessageItem
                        msg={msg}
                        currentUserId={currentUser?.id}
                        currentUserRole={currentUser?.role}
                        profiles={profiles}
                        formatTime={formatMsgTime}
                        onReply={setReplyTo}
                        onDelete={handleDeleteMessage}
                      />
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply preview */}
            {replyTo && (
              <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/30 rounded-xl">
                <CornerDownRight size={14} className="text-accent shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <p className="text-accent font-medium">
                    ตอบ {replyTo.sender?.display_name}
                  </p>
                  <p className="truncate text-muted">
                    {replyTo.deleted_at
                      ? "ข้อความถูกลบ"
                      : replyTo.content || replyTo.file_name || "ไฟล์แนบ"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-muted hover:text-foreground p-1"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* File preview */}
            {file && (
              <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl">
                {isImageFile(file.type) ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={filePreviewUrl ?? ""}
                      alt=""
                      className="w-10 h-10 rounded object-cover shrink-0"
                    />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                  </>
                ) : (
                  <>
                    <FileText size={16} className="text-accent shrink-0" />
                    <span className="text-sm truncate flex-1">{file.name}</span>
                  </>
                )}
                <button
                  onClick={() => setFile(null)}
                  className="text-muted hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={handleSend}
              onPaste={handlePaste}
              className="p-4 border-t border-brand shrink-0"
            >
              <div className="flex items-end gap-2 bg-background border border-border rounded-xl px-2 py-2 focus-within:ring-2 focus-within:ring-accent/30">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.zip"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg hover:bg-card-hover text-muted hover:text-foreground shrink-0"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={`ส่งข้อความใน #${activeChannel.name} (@username เพื่อ mention)`}
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm placeholder:text-muted focus:outline-none"
                />
                <button
                  type={sending ? "button" : "submit"}
                  onClick={sending ? cancelSend : undefined}
                  disabled={!sending && !content.trim() && !file}
                  className={`p-2 rounded-lg transition-colors shrink-0 ${
                    sending
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-accent hover:bg-accent-dim text-white disabled:opacity-40"
                  }`}
                >
                  {sending ? <X size={18} /> : <Send size={18} />}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted text-sm">
            เลือกแชannel ทางซ้าย
          </div>
        )}
      </div>

      <CreateChannelModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateError("");
        }}
        name={newChannelName}
        desc={newChannelDesc}
        error={createError}
        creating={creating}
        onNameChange={setNewChannelName}
        onDescChange={setNewChannelDesc}
        onSubmit={handleCreateChannel}
      />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="แก้ไขแชannel">
        <form onSubmit={handleEditChannel} className="space-y-4">
          <Input
            label="ชื่อแชannel"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />
          <Textarea
            label="คำอธิบาย"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={2}
          />
          <Button type="submit" loading={editingChannel} className="w-full">
            บันทึก
          </Button>
        </form>
      </Modal>
    </div>
  );
}

function CreateChannelModal({
  open,
  onClose,
  name,
  desc,
  error,
  creating,
  onNameChange,
  onDescChange,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  desc: string;
  error: string;
  creating: boolean;
  onNameChange: (v: string) => void;
  onDescChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const preview = slugifyChannelName(name);

  return (
    <Modal open={open} onClose={onClose} title="สร้างแชannel ใหม่">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
        <Input
          label="ชื่อแชannel"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="เช่น project-abc, dev-talk"
          required
          autoFocus
        />
        {preview && (
          <p className="text-xs text-muted -mt-2">
            จะแสดงเป็น{" "}
            <span className="text-accent font-medium">#{preview}</span>
          </p>
        )}
        <Textarea
          label="คำอธิบาย (ไม่บังคับ)"
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          rows={2}
          placeholder="แชannel นี้ใช้คุยเรื่องอะไร"
        />
        <Button type="submit" loading={creating} className="w-full">
          <Plus size={18} /> สร้างแชannel
        </Button>
      </form>
    </Modal>
  );
}
