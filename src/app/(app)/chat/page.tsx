"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Hash,
  Plus,
  ChevronLeft,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Input, Modal, Textarea } from "@/components/ui";
import { uploadFile, isImageFile } from "@/lib/upload";
import { slugifyChannelName, formatChannelDisplay } from "@/lib/channels";
import type { Channel, Message, Profile } from "@/lib/types";
import { format, isToday, isYesterday } from "date-fns";
import { th } from "date-fns/locale";
import Image from "next/image";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMessages = useCallback(async (channelId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*, sender:profiles(*)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages(data ?? []);
  }, []);

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
        await loadMessages(first.id);
        setShowMobileChannels(false);
      }

      setLoading(false);
    }

    init();
  }, [loadMessages]);

  useEffect(() => {
    if (!activeChannel) return;

    loadMessages(activeChannel.id);
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
          const { data: sender } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", newMsg.sender_id)
            .single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, sender }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
    };
  }, [activeChannel, loadMessages]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeChannel]);

  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setShowMobileChannels(false);
  }

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
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !file) return;
    if (!currentUser || !activeChannel) return;

    setSending(true);
    const supabase = createClient();

    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_type: string | null = null;

    if (file) {
      const uploaded = await uploadFile(file, "chat");
      if (uploaded) {
        file_url = uploaded.url;
        file_name = file.name;
        file_type = file.type;
      }
    }

    await supabase.from("messages").insert({
      channel_id: activeChannel.id,
      sender_id: currentUser.id,
      content: content.trim() || null,
      file_url,
      file_name,
      file_type,
    });

    setContent("");
    setFile(null);
    setSending(false);
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
    <div className="flex flex-col h-[calc(100dvh-8.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-3rem)] border border-brand rounded-2xl overflow-hidden bg-card animate-fade-in">
      {/* Channel sidebar — Discord style */}
      <aside
        className={`${
          showMobileChannels ? "flex" : "hidden"
        } lg:flex flex-col w-full lg:w-60 bg-sidebar border-r border-brand shrink-0`}
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

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
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

        {/* Online members */}
        <div className="p-3 border-t border-brand">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-2 flex items-center gap-1">
            <Users size={12} /> ทีม — {profiles.length}
          </p>
          <div className="space-y-1.5 max-h-28 overflow-y-auto">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">{p.display_name}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main chat */}
      <div
        className={`${
          showMobileChannels ? "hidden" : "flex"
        } lg:flex flex-col flex-1 min-w-0`}
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
              <div className="min-w-0">
                <h1 className="font-semibold truncate">{activeChannel.name}</h1>
                {activeChannel.description && (
                  <p className="text-xs text-muted truncate">
                    {activeChannel.description}
                  </p>
                )}
              </div>
            </div>

            {/* Messages — Discord layout */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
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
                      <div className="flex gap-3 py-1 px-2 -mx-2 rounded-lg hover:bg-card-hover/50 group">
                        {msg.sender && (
                          <Avatar name={msg.sender.display_name} size="sm" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-0.5">
                            <span className="font-semibold text-sm">
                              {msg.sender?.display_name ?? "Unknown"}
                            </span>
                            <span className="text-[10px] text-muted">
                              {formatMsgTime(msg.created_at)}
                            </span>
                          </div>
                          {msg.content && (
                            <p className="text-sm whitespace-pre-wrap break-words text-zinc-200">
                              {msg.content}
                            </p>
                          )}
                          {msg.file_url && isImageFile(msg.file_type) && (
                            <div className="mt-2 relative rounded-lg overflow-hidden max-w-sm border border-border">
                              <Image
                                src={msg.file_url}
                                alt={msg.file_name ?? "image"}
                                width={400}
                                height={260}
                                className="object-cover"
                              />
                            </div>
                          )}
                          {msg.file_url && !isImageFile(msg.file_type) && (
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 mt-1 text-sm text-accent hover:underline"
                            >
                              <FileText size={14} />
                              {msg.file_name ?? "ไฟล์แนบ"}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File preview */}
            {file && (
              <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-xl">
                {isImageFile(file.type) ? (
                  <ImageIcon size={16} className="text-accent" />
                ) : (
                  <FileText size={16} className="text-accent" />
                )}
                <span className="text-sm truncate flex-1">{file.name}</span>
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
              className="p-4 border-t border-brand shrink-0"
            >
              <div className="flex items-end gap-2 bg-background border border-border rounded-xl px-2 py-2 focus-within:ring-2 focus-within:ring-accent/30">
                <input
                  ref={fileInputRef}
                  type="file"
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
                  placeholder={`ส่งข้อความใน #${activeChannel.name}`}
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm placeholder:text-muted focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || (!content.trim() && !file)}
                  className="p-2 rounded-lg bg-accent hover:bg-accent-dim text-white transition-colors disabled:opacity-40 shrink-0"
                >
                  {sending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
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
