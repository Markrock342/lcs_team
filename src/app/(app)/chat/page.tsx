"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Pin,
  UserRound,
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, EmptyState, Input, Modal, PageLoader, Textarea, ProfileRoleBadges } from "@/components/ui";
import { useActionFeedback } from "@/components/workspace/ActionFeedback";
import { ChatMessageItem } from "@/components/ChatMessageItem";
import { ChatMentionInput } from "@/components/ChatMentionInput";
import { uploadFile, isImageFile } from "@/lib/upload";
import { slugifyChannelName, formatChannelDisplay, chatChannelHref, resolveChannelFromParam } from "@/lib/channels";
import { parseMentions, logActivity } from "@/lib/activity";
import {
  dispatchChatNotifications,
  markChatChannelNotificationsRead,
} from "@/lib/notifications";
import { isOnline, formatPresenceStatus } from "@/lib/presence";
import { useOnlinePresence, useTypingIndicator } from "@/hooks/usePresence";
import {
  fetchChannelMessages,
  fetchMessageById,
  fetchThreadCounts,
  insertChatMessage,
  markMessagesAsReadSafe,
} from "@/lib/chat-messages";
import {
  channelTitle,
  fetchUnreadCounts,
  isDmChannel,
  markChannelRead,
  openDirectMessage,
} from "@/lib/chat-workspace";
import { runSlashCommand } from "@/lib/chat-slash";
import type { Channel, Message, Profile, MessageReaction, Task } from "@/lib/types";
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

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <PageLoader label="กำลังเปิดแชท..." />
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const { confirm } = useActionFeedback();
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelParam = searchParams.get("channel");
  const msgParam = searchParams.get("msg");
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
  const [linkedTaskId, setLinkedTaskId] = useState("");
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [reactionsMap, setReactionsMap] = useState<Record<string, MessageReaction[]>>({});
  const [chatError, setChatError] = useState("");
  const [sendError, setSendError] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [slashNotice, setSlashNotice] = useState("");
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const [, setPresenceTick] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const pendingScrollBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const threadRootRef = useRef<Message | null>(null);
  threadRootRef.current = threadRoot;

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
    const { data, error } = await fetchChannelMessages(supabase, channelId);
    setMessages(data);
    if (error) setChatError(error);
    else setChatError("");

    if (data.length) {
      const ids = data.map((m) => m.id);
      const taskIds = data
        .map((m) => m.linked_task_id)
        .filter((id): id is string => !!id);

      const [reactionsRes, tasksRes] = await Promise.all([
        supabase
          .from("message_reactions")
          .select("*, user:profiles(id, display_name)")
          .in("message_id", ids),
        taskIds.length
          ? supabase.from("tasks").select("id, title, status").in("id", taskIds)
          : Promise.resolve({ data: [] as Task[] }),
      ]);

      const taskMap = new Map(
        ((tasksRes.data ?? []) as Task[]).map((t) => [t.id, t])
      );
      setMessages(
        data.map((m) => ({
          ...m,
          linked_task: m.linked_task_id
            ? taskMap.get(m.linked_task_id) ?? null
            : null,
        }))
      );

      const grouped: Record<string, MessageReaction[]> = {};
      for (const r of (reactionsRes.data ?? []) as MessageReaction[]) {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      }
      setReactionsMap(grouped);
      setThreadCounts(await fetchThreadCounts(supabase, ids));
    } else {
      setReactionsMap({});
      setThreadCounts({});
    }

    return data;
  }, []);

  const markMessagesAsRead = useCallback(
    async (msgs: Message[], userId: string) => {
      const ids = msgs
        .filter((m) => m.sender_id !== userId && !m.deleted_at)
        .map((m) => m.id);
      await markMessagesAsReadSafe(createClient(), ids, userId);
    },
    []
  );

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [channelsRes, profilesRes, tasksRes] = await Promise.all([
        supabase.from("channels").select("*").order("created_at", { ascending: true }),
        supabase.from("profiles").select("*"),
        supabase
          .from("tasks")
          .select("id, title, status")
          .neq("status", "done")
          .is("parent_id", null)
          .order("title")
          .limit(50),
      ]);

      const channelList = channelsRes.data ?? [];
      setChannels(channelList);
      setProfiles(profilesRes.data ?? []);
      setOpenTasks((tasksRes.data ?? []) as Task[]);

      if (user) {
        const profile = profilesRes.data?.find((p) => p.id === user.id);
        setCurrentUser(profile ?? null);
      }

      const dmParam = searchParams.get("dm");
      let opened: Channel | null = null;
      if (dmParam && user) {
        const dm = await openDirectMessage(supabase, user.id, dmParam);
        if (dm.channel) {
          opened = dm.channel;
          if (!channelList.some((c) => c.id === dm.channel!.id)) {
            channelList.push(dm.channel);
            setChannels([...channelList]);
          }
        } else if (dm.error) {
          setChatError(dm.error);
        }
      }

      const fromParam = resolveChannelFromParam(channelParam, channelList);
      const first =
        opened ??
        fromParam ??
        channelList.find((c) => c.name === "general") ??
        channelList[0] ??
        null;
      if (first) {
        setActiveChannel(first);
        pendingScrollBottomRef.current = true;
        if (channelParam !== first.id) {
          router.replace(chatChannelHref(first.id), { scroll: false });
        }
        const msgs = await loadMessages(first.id);
        if (user) {
          await markMessagesAsRead(msgs, user.id);
          await markChannelRead(createClient(), first.id, user.id);
          const counts = await fetchUnreadCounts(
            supabase,
            user.id,
            channelList.map((c) => c.id)
          );
          counts[first.id] = 0;
          setUnread(counts);
        }
        setShowMobileChannels(false);
      }

      setLoading(false);
    }

    void init();
    // Initial channel resolution intentionally uses the first URL snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMessages, markMessagesAsRead]);

  useEffect(() => {
    if (loading || !channels.length || !channelParam) return;
    const ch = resolveChannelFromParam(channelParam, channels);
    if (!ch || ch.id === activeChannel?.id) return;
    // The URL is the external source of truth for channel navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveChannel(ch);
    setShowMobileChannels(false);
    setReplyTo(null);
    setThreadRoot(null);
    setEditingMessage(null);
    pendingScrollBottomRef.current = true;
    isNearBottomRef.current = true;
  }, [channelParam, channels, loading, activeChannel?.id]);

  useEffect(() => {
    if (!activeChannel || !currentUser) return;

    pendingScrollBottomRef.current = true;
    let cancelled = false;

    async function sync() {
      const msgs = await loadMessages(activeChannel!.id);
      if (cancelled) return;
      await markMessagesAsRead(msgs, currentUser!.id);
      await markChannelRead(createClient(), activeChannel!.id, currentUser!.id);
      setUnread((prev) => ({ ...prev, [activeChannel!.id]: 0 }));

      if (msgParam) {
        pendingScrollBottomRef.current = false;
        isNearBottomRef.current = false;
        const inList = msgs.find((m) => m.id === msgParam);
        if (inList) {
          setHighlightMsgId(msgParam);
        } else {
          const full = await fetchMessageById(createClient(), msgParam);
          if (full) {
            setHighlightMsgId(msgParam);
            const rootId = full.thread_id ?? full.id;
            const root = msgs.find((m) => m.id === rootId) ?? full;
            setThreadRoot(root);
            const threaded = await fetchChannelMessages(
              createClient(),
              root.channel_id,
              { threadId: root.id }
            );
            setThreadMessages(threaded.data);
          }
        }
      } else {
        setHighlightMsgId(null);
      }
    }

    sync();
    markChatChannelNotificationsRead(activeChannel!.id);
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
          const full = await fetchMessageById(supabase, newMsg.id);

          if (!full) return;

          if (full.thread_id) {
            setThreadCounts((prev) => ({
              ...prev,
              [full.thread_id!]: (prev[full.thread_id!] ?? 0) + 1,
            }));
            const root = threadRootRef.current;
            if (root && (root.id === full.thread_id || root.id === full.id)) {
              setThreadMessages((prev) => {
                if (prev.some((m) => m.id === full.id)) return prev;
                return [...prev, full];
              });
            }
            return;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === full.id)) return prev;
            return [...prev, full];
          });

          if (full.sender_id !== currentUser?.id) {
            await markMessagesAsRead([full], currentUser!.id);
          }
          markChatChannelNotificationsRead(activeChannel!.id);
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
          const full = await fetchMessageById(supabase, updated.id);
          if (!full) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === full.id ? full : m))
          );
          setThreadMessages((prev) =>
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
  }, [activeChannel, loadMessages, markMessagesAsRead, currentUser, profiles, msgParam]);

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
    if (!currentUser) return;
    const supabase = createClient();
    const sub = supabase
      .channel("chat-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.sender_id === currentUser.id) return;
          if (msg.thread_id) return;
          if (msg.channel_id === activeChannel?.id) return;
          setUnread((prev) => ({
            ...prev,
            [msg.channel_id]: (prev[msg.channel_id] ?? 0) + 1,
          }));
          void supabase
            .from("channels")
            .select("*")
            .eq("id", msg.channel_id)
            .maybeSingle()
            .then(({ data }) => {
              if (!data) return;
              setChannels((prev) =>
                prev.some((c) => c.id === data.id) ? prev : [...prev, data as Channel]
              );
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [currentUser, activeChannel?.id]);

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

  const presenceUser = useMemo(
    () =>
      currentUser
        ? { id: currentUser.id, display_name: currentUser.display_name }
        : null,
    [currentUser]
  );
  const onlineIds = useOnlinePresence(presenceUser);
  const { typingUsers, notifyTyping, stopTyping } = useTypingIndicator(
    activeChannel?.id ?? null,
    presenceUser
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
  }, []);

  useLayoutEffect(() => {
    if (showMobileChannels || !messagesScrollRef.current) return;
    if (highlightMsgId) return;

    if (pendingScrollBottomRef.current) {
      scrollToBottom("auto");
      pendingScrollBottomRef.current = false;
      return;
    }

    if (isNearBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [messages, showMobileChannels, activeChannel?.id, scrollToBottom, highlightMsgId]);

  useLayoutEffect(() => {
    if (!highlightMsgId) return;
    const node = document.getElementById(`msg-${highlightMsgId}`);
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    pendingScrollBottomRef.current = false;
    isNearBottomRef.current = false;
  }, [highlightMsgId, messages, threadMessages]);

  function selectChannel(ch: Channel) {
    setActiveChannel(ch);
    setShowMobileChannels(false);
    setReplyTo(null);
    setThreadRoot(null);
    setEditingMessage(null);
    setSlashNotice("");
    isNearBottomRef.current = true;
    pendingScrollBottomRef.current = true;
    router.replace(chatChannelHref(ch.id), { scroll: false });
  }

  useEffect(() => {
    if (!activeChannel) return;
    try {
      setContent(sessionStorage.getItem(`lcs-chat-draft:${activeChannel.id}`) ?? "");
    } catch {
      setContent("");
    }
  }, [activeChannel?.id]);

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
      setCreateError("ชื่อช่องไม่ถูกต้อง");
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
      pendingScrollBottomRef.current = true;
      router.replace(chatChannelHref(data.id), { scroll: false });
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
    const ok = await confirm({
      title: "ลบช่องแชท",
      message: `ลบช่อง #${activeChannel.name} หรือไม่?`,
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;

    const supabase = createClient();
    await supabase.from("channels").delete().eq("id", activeChannel.id);
    setChannels((prev) => prev.filter((c) => c.id !== activeChannel.id));
    const next = channels.find((c) => c.id !== activeChannel.id) ?? null;
    setActiveChannel(next);
    if (next) {
      pendingScrollBottomRef.current = true;
      router.replace(chatChannelHref(next.id), { scroll: false });
      loadMessages(next.id);
    } else {
      setMessages([]);
    }
    setChannelMenuOpen(false);
    await logActivity("delete", "channel", activeChannel.id, activeChannel.name);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.kind !== "file") continue;
      const blob = item.getAsFile();
      if (!blob) continue;
      e.preventDefault();
      if (blob.name && blob.name.includes(".")) {
        setFile(blob);
      } else {
        const ext =
          blob.type.split("/")[1]?.replace("jpeg", "jpg") ||
          (blob.type.startsWith("image/") ? "png" : "bin");
        setFile(
          new File([blob], `pasted-${Date.now()}.${ext}`, {
            type: blob.type || "application/octet-stream",
          })
        );
      }
      return;
    }
  }

  async function startDirectMessage(userId: string) {
    if (!currentUser || userId === currentUser.id) return;
    const { channel, error } = await openDirectMessage(
      createClient(),
      currentUser.id,
      userId
    );
    if (error) {
      setChatError(error);
      return;
    }
    if (channel) {
      setChannels((prev) =>
        prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]
      );
      selectChannel(channel);
    }
  }

  async function openThread(msg: Message) {
    const root = msg.thread_id
      ? messages.find((m) => m.id === msg.thread_id) ?? msg
      : msg;
    setThreadRoot(root);
    const { data } = await fetchChannelMessages(createClient(), root.channel_id, {
      threadId: root.id,
    });
    setThreadMessages(data);
  }

  async function togglePin(msg: Message) {
    const supabase = createClient();
    const pinned = msg.pinned_at
      ? { pinned_at: null, pinned_by: null }
      : {
          pinned_at: new Date().toISOString(),
          pinned_by: currentUser?.id ?? null,
        };
    const { error } = await supabase.from("messages").update(pinned).eq("id", msg.id);
    if (error) {
      setSendError(
        error.message.toLowerCase().includes("column")
          ? "รัน supabase/add-chat-workspace.sql ใน Supabase ก่อน"
          : error.message
      );
      return;
    }
    const next = { ...msg, ...pinned };
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? next : m)));
    setThreadMessages((prev) => prev.map((m) => (m.id === msg.id ? next : m)));
  }

  function startEdit(msg: Message) {
    setEditingMessage(msg);
    setContent(msg.content ?? "");
    setReplyTo(null);
  }

  async function handleDeleteMessage(msg: Message) {
    const ok = await confirm({
      title: "ลบข้อความ",
      message: "ลบข้อความนี้หรือไม่?",
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
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
      setThreadMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, deleted_at } : m))
      );
    }
  }

  function cancelSend() {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    setSending(false);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const existing = reactionsMap[messageId]?.find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );

    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
      setReactionsMap((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }));
    } else {
      const { data } = await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: user.id, emoji })
        .select("*, user:profiles(id, display_name)")
        .single();
      if (data) {
        setReactionsMap((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), data as MessageReaction],
        }));
      }
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !file) return;
    if (!currentUser || !activeChannel) return;

    setSending(true);
    setSendError("");
    setSlashNotice("");
    sendAbortRef.current = new AbortController();
    const signal = sendAbortRef.current.signal;
    const supabase = createClient();

    if (editingMessage) {
      const edited_at = new Date().toISOString();
      const nextContent = content.trim();
      const { error } = await supabase
        .from("messages")
        .update({ content: nextContent, edited_at })
        .eq("id", editingMessage.id);
      setSending(false);
      sendAbortRef.current = null;
      if (error) {
        setSendError(error.message);
        return;
      }
      const next = { ...editingMessage, content: nextContent, edited_at };
      setMessages((prev) => prev.map((m) => (m.id === next.id ? next : m)));
      setThreadMessages((prev) => prev.map((m) => (m.id === next.id ? next : m)));
      setEditingMessage(null);
      try {
        setContent(
          sessionStorage.getItem(`lcs-chat-draft:${activeChannel.id}`) ?? ""
        );
      } catch {
        setContent("");
      }
      return;
    }

    let outgoing = content.trim() || null;
    let slashTaskId = linkedTaskId || null;
    if (outgoing?.startsWith("/")) {
      const slash = await runSlashCommand(supabase, outgoing, currentUser.id);
      if (slash?.kind === "help") {
        setSlashNotice(slash.text);
        setSending(false);
        sendAbortRef.current = null;
        return;
      }
      if (slash?.kind === "error") {
        setSendError(slash.text);
        setSending(false);
        sendAbortRef.current = null;
        return;
      }
      if (slash?.kind === "ok") {
        outgoing = slash.href ? `${slash.content}\n${slash.href}` : slash.content;
        slashTaskId = slash.linkedTaskId ?? slashTaskId;
      }
    }

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
      if (uploaded.ok) {
        file_url = uploaded.url;
        file_name = file.name;
        file_type = file.type;
      }
    }

    const mentionIds = parseMentions(outgoing ?? "", profiles);
    const replyId = replyTo?.deleted_at ? null : replyTo?.id ?? null;

    const { data: msgData, error: insertError } = await insertChatMessage(
      supabase,
      {
        channel_id: activeChannel.id,
        sender_id: currentUser.id,
        content: outgoing,
        file_url,
        file_name,
        file_type,
        mentioned_ids: mentionIds,
        reply_to_id: replyId,
        thread_id: threadRoot?.id ?? null,
        linked_task_id: slashTaskId,
      }
    );

    if (insertError) {
      setSendError(insertError);
      setSending(false);
      sendAbortRef.current = null;
      return;
    }

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

    if (msgData?.id) {
      void dispatchChatNotifications(msgData.id);
    }

    await logActivity("comment", "message", msgData?.id ?? null, `#${activeChannel.name}`);

    try {
      sessionStorage.removeItem(`lcs-chat-draft:${activeChannel.id}`);
    } catch {
      /* ignore */
    }
    setContent("");
    setFile(null);
    setLinkedTaskId("");
    setReplyTo(null);
    stopTyping();
    setSending(false);
    sendAbortRef.current = null;

    if (msgData) {
      if (threadRoot) {
        setThreadMessages((prev) => {
          if (prev.some((m) => m.id === msgData.id)) return prev;
          return [...prev, msgData];
        });
        setThreadCounts((prev) => ({
          ...prev,
          [threadRoot.id]: (prev[threadRoot.id] ?? 0) + 1,
        }));
      } else {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msgData.id)) return prev;
          return [...prev, msgData];
        });
      }
    }
  }

  if (loading) {
    return <PageLoader label="กำลังโหลดข้อความ..." />;
  }

  // ยังไม่มี channels table
  if (channels.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center animate-fade-in">
        <EmptyState
          icon={<Hash size={24} />}
          title="ยังไม่มีช่องสนทนา"
          description="สร้างช่องแรกเพื่อเริ่มพูดคุยและติดตามงานร่วมกัน"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={18} /> สร้างช่องแรก
            </Button>
          }
        />
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

  const roomChannels = channels.filter((c) => !isDmChannel(c));
  const dmChannels = channels.filter((c) => isDmChannel(c));
  const pinnedMessages = messages.filter((m) => m.pinned_at);
  const activeTitle = activeChannel
    ? channelTitle(activeChannel, profiles, currentUser?.id)
    : "";
  const activeIsDm = activeChannel ? isDmChannel(activeChannel) : false;

  let lastDate = "";

  return (
    <div className="ticket-card flex h-full max-h-full min-h-0 flex-1 flex-col overflow-hidden animate-fade-in lg:flex-row">
      {/* Channel sidebar — Discord style */}
      <aside
        className={`${
          showMobileChannels ? "flex" : "hidden"
        } min-h-0 w-full shrink-0 flex-col bg-surface-soft lg:flex lg:w-64 lg:border-r lg:border-border`}
      >
        <div className="flex min-h-16 items-center justify-between border-b border-border px-4">
          <div>
            <p className="ticket-kicker">ทีม · แชท</p>
            <h2 className="mt-0.5 font-semibold">ช่องสนทนา</h2>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-card-hover hover:text-accent"
            title="สร้างช่อง"
            aria-label="สร้างช่อง"
          >
            <Plus size={18} />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-touch p-2 space-y-3">
          <div className="space-y-0.5">
            <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              ช่อง
            </p>
            {roomChannels.map((ch) => {
              const active = activeChannel?.id === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => selectChannel(ch)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/15 text-accent"
                      : unread[ch.id]
                        ? "text-foreground"
                        : "text-muted hover:text-foreground hover:bg-card-hover"
                  }`}
                >
                  <Hash size={16} className="shrink-0 opacity-60" />
                  <span className="truncate">{ch.name}</span>
                  {!!unread[ch.id] && (
                    <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-[10px] font-semibold text-white">
                      {unread[ch.id] > 99 ? "99+" : unread[ch.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="space-y-0.5">
            <p className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
              ข้อความส่วนตัว
            </p>
            {dmChannels.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted">กดชื่อเพื่อนด้านล่างเพื่อเริ่มคุย</p>
            )}
            {dmChannels.map((ch) => {
              const active = activeChannel?.id === ch.id;
              return (
                <button
                  key={ch.id}
                  onClick={() => selectChannel(ch)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent/15 text-accent"
                      : unread[ch.id]
                        ? "text-foreground"
                        : "text-muted hover:text-foreground hover:bg-card-hover"
                  }`}
                >
                  <UserRound size={16} className="shrink-0 opacity-60" />
                  <span className="truncate">
                    {channelTitle(ch, profiles, currentUser?.id)}
                  </span>
                  {!!unread[ch.id] && (
                    <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-[10px] font-semibold text-white">
                      {unread[ch.id] > 99 ? "99+" : unread[ch.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Team presence */}
        <div className="border-t border-border p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Users size={12} /> ทีม — {profiles.length}
            <span className="normal-case tracking-normal">
              · {profiles.filter((p) => onlineIds.has(p.id) || isOnline(p.last_seen_at)).length} ออนไลน์
            </span>
          </p>
          <div className="max-h-40 space-y-3 overflow-y-auto overscroll-contain scroll-touch">
            {profiles.map((p) => {
              const online = onlineIds.has(p.id) || isOnline(p.last_seen_at);
              const isSelf = p.id === currentUser?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isSelf}
                  onClick={() => startDirectMessage(p.id)}
                  className="flex min-h-11 min-w-0 w-full items-start gap-2 rounded-xl px-1 text-left text-sm hover:bg-card-hover disabled:hover:bg-transparent"
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                      online ? "bg-(--status-green-fg)" : "bg-muted"
                    }`}
                    title={online ? "ออนไลน์" : "ออฟไลน์"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium">{p.display_name}</span>
                      <ProfileRoleBadges profile={p} size="xs" />
                    </div>
                    <p
                      className={`truncate text-xs ${
                        online ? "text-(--status-green-fg)" : "text-muted"
                      }`}
                    >
                      {onlineIds.has(p.id) ? "ออนไลน์" : formatPresenceStatus(p.last_seen_at)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main chat */}
      <div
        className={`${
          showMobileChannels ? "hidden" : "flex"
        } lg:flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden relative`}
      >
        {activeChannel ? (
          <>
            {/* Channel header */}
            <div className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-surface-soft px-3 sm:px-4">
              <button
                onClick={() => setShowMobileChannels(true)}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover lg:hidden"
                aria-label="กลับไปยังรายการช่อง"
              >
                <ChevronLeft size={20} />
              </button>
              {activeIsDm ? (
                <UserRound size={20} className="text-muted shrink-0" />
              ) : (
                <Hash size={20} className="text-muted shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold truncate">{activeTitle}</h1>
                {activeChannel.description && !activeIsDm && (
                  <p className="text-xs text-muted truncate">
                    {activeChannel.description}
                  </p>
                )}
                {activeIsDm && (
                  <p className="text-xs text-muted truncate">ข้อความส่วนตัว</p>
                )}
              </div>
              {!activeIsDm && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setChannelMenuOpen(!channelMenuOpen)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover"
                  aria-label="เมนูช่อง"
                  aria-expanded={channelMenuOpen}
                >
                  <MoreVertical size={18} />
                </button>
                {channelMenuOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 min-w-40 rounded-xl border border-border bg-card py-1 shadow-(--shadow-float)">
                    <button
                      onClick={openEditChannel}
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-sm hover:bg-card-hover"
                    >
                      <Pencil size={14} /> แก้ไข
                    </button>
                    {activeChannel.name !== "general" && (
                      <button
                        onClick={handleDeleteChannel}
                        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-sm text-(--status-red-fg) hover:bg-(--status-red-bg)"
                      >
                        <Trash2 size={14} /> ลบ
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>

            {pinnedMessages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const id = pinnedMessages[0].id;
                  setHighlightMsgId(id);
                }}
                className="flex min-h-11 w-full items-center gap-2 border-b border-border bg-surface-soft px-4 py-2 text-left text-sm hover:bg-card-hover"
              >
                <Pin size={14} className="text-accent shrink-0" />
                <p className="min-w-0 flex-1 truncate">
                  {pinnedMessages[0].content || pinnedMessages[0].file_name || "ข้อความที่ปักหมุด"}
                  {pinnedMessages.length > 1 ? ` · อีก ${pinnedMessages.length - 1} รายการ` : ""}
                </p>
              </button>
            )}

            {/* Messages — Discord layout */}
            {(chatError || sendError) && (
              <div className="mx-4 mt-3 rounded-xl bg-(--status-red-bg) px-4 py-3 text-sm text-(--status-red-fg)" role="alert">
                {sendError || chatError}
              </div>
            )}
            {slashNotice && (
              <div className="mx-4 mt-3 whitespace-pre-wrap rounded-xl bg-surface-soft px-4 py-3 text-sm text-muted">
                {slashNotice}
              </div>
            )}
            <div
              className={`relative flex-1 min-h-0 ${threadRoot ? "lg:flex" : ""}`}
            >
            <div
              ref={messagesScrollRef}
              className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-touch px-3 py-5 sm:px-5 space-y-1"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-soft text-muted">
                    <Hash size={24} />
                  </div>
                  <h3 className="font-semibold text-lg">
                    ยินดีต้อนรับสู่ {formatChannelDisplay(activeChannel.name)}
                  </h3>
                  <p className="text-sm text-muted mt-1">
                    {activeChannel.description ?? "เริ่มส่งข้อความในช่องนี้ได้เลย"}
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const msgDate = formatDateDivider(msg.created_at);
                  const showDivider = msgDate !== lastDate;
                  lastDate = msgDate;

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={
                        highlightMsgId === msg.id
                          ? "rounded-xl bg-accent/10"
                          : undefined
                      }
                    >
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
                        onThread={openThread}
                        onPin={togglePin}
                        onEdit={startEdit}
                        threadCount={threadCounts[msg.id] ?? 0}
                        reactions={reactionsMap[msg.id] ?? []}
                        onReaction={toggleReaction}
                      />
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            {threadRoot && (
              <div className="absolute inset-0 z-20 flex flex-col bg-card lg:static lg:w-80 lg:border-l lg:border-border">
                <div className="flex min-h-14 items-center gap-2 border-b border-border px-3">
                  <MessageSquare size={16} className="text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">เธรด</p>
                    <p className="truncate text-xs text-muted">
                      {threadRoot.content || threadRoot.file_name || "ข้อความ"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setThreadRoot(null);
                      setThreadMessages([]);
                    }}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover"
                    aria-label="ปิดเธรด"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 space-y-1">
                  {threadMessages.map((msg) => (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={
                        highlightMsgId === msg.id
                          ? "rounded-xl bg-accent/10"
                          : undefined
                      }
                    >
                    <ChatMessageItem
                      msg={msg}
                      currentUserId={currentUser?.id}
                      currentUserRole={currentUser?.role}
                      profiles={profiles}
                      formatTime={formatMsgTime}
                      onReply={setReplyTo}
                      onDelete={handleDeleteMessage}
                      onPin={togglePin}
                      onEdit={startEdit}
                      reactions={reactionsMap[msg.id] ?? []}
                      onReaction={toggleReaction}
                    />
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>

            {typingUsers.length > 0 && (
              <div className="mx-4 mb-1 flex items-center gap-2 text-xs text-muted">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" />
                </span>
                {typingUsers.length === 1
                  ? `${typingUsers[0].display_name} กำลังพิมพ์...`
                  : typingUsers.length === 2
                    ? `${typingUsers[0].display_name} และ ${typingUsers[1].display_name} กำลังพิมพ์...`
                    : `${typingUsers.length} คนกำลังพิมพ์...`}
              </div>
            )}

            {/* Reply preview */}
            {replyTo && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2">
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
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover hover:text-foreground"
                  aria-label="ยกเลิกการตอบกลับ"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {editingMessage && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2">
                <Pencil size={14} className="text-accent shrink-0" />
                <p className="flex-1 min-w-0 truncate text-xs">กำลังแก้ข้อความ</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessage(null);
                    try {
                      setContent(
                        sessionStorage.getItem(
                          `lcs-chat-draft:${activeChannel.id}`
                        ) ?? ""
                      );
                    } catch {
                      setContent("");
                    }
                  }}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover"
                  aria-label="ยกเลิกการแก้ไข"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* File preview */}
            {file && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-2">
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
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-card-hover hover:text-foreground"
                  aria-label="นำไฟล์แนบออก"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={handleSend}
              onPaste={handlePaste}
              className="shrink-0 border-t border-border bg-card p-3 sm:p-4"
            >
              {openTasks.length > 0 && (
                <select
                  value={linkedTaskId}
                  onChange={(e) => setLinkedTaskId(e.target.value)}
                  className="mb-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  aria-label="แนบลิงก์งาน"
                >
                  <option value="">แนบลิงก์งาน (ไม่บังคับ)</option>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-end gap-1 rounded-xl border border-border bg-background p-1.5 focus-within:border-accent sm:gap-2">
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
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-card-hover hover:text-foreground"
                  aria-label="แนบไฟล์"
                >
                  <Paperclip size={18} />
                </button>
                <ChatMentionInput
                  value={content}
                  onChange={(v) => {
                    setContent(v);
                    if (v.trim()) notifyTyping();
                    if (activeChannel && !editingMessage) {
                      try {
                        const key = `lcs-chat-draft:${activeChannel.id}`;
                        if (!v.trim()) sessionStorage.removeItem(key);
                        else sessionStorage.setItem(key, v);
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  profiles={profiles}
                  currentUserId={currentUser?.id}
                  onPaste={handlePaste}
                  disabled={sending}
                  placeholder={
                    editingMessage
                      ? "แก้ข้อความ"
                      : threadRoot
                        ? "ตอบในเธรด"
                        : activeIsDm
                          ? `ส่งถึง ${activeTitle}`
                          : `ส่งข้อความใน #${activeChannel.name} หรือพิมพ์ /`
                  }
                />
                <button
                  type={sending ? "button" : "submit"}
                  onClick={sending ? cancelSend : undefined}
                  disabled={!sending && !content.trim() && !file}
                  className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    sending
                      ? "bg-(--status-red-bg) text-(--status-red-fg)"
                      : "bg-accent hover:bg-accent-dim text-white disabled:opacity-40"
                  }`}
                  aria-label={sending ? "ยกเลิกการส่ง" : "ส่งข้อความ"}
                >
                  {sending ? <X size={18} /> : <Send size={18} />}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted text-sm">
            เลือกช่องสนทนาจากรายการ
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="แก้ไขช่อง">
        <form onSubmit={handleEditChannel} className="space-y-4">
          <Input
            label="ชื่อช่อง"
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
    <Modal open={open} onClose={onClose} title="สร้างช่องใหม่">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-(--status-red-bg) p-3 text-sm text-(--status-red-fg)" role="alert">
            {error}
          </div>
        )}
        <Input
          label="ชื่อช่อง"
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
          placeholder="ช่องนี้ใช้คุยเรื่องอะไร"
        />
        <Button type="submit" loading={creating} className="w-full">
          <Plus size={18} /> สร้างช่อง
        </Button>
      </form>
    </Modal>
  );
}
