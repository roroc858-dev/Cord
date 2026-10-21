"use client";

import {
  AudioLines,
  Bell,
  ChevronDown,
  CircleUserRound,
  Hash,
  Home,
  LogOut,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { CommunityCall } from "@/components/community-call";

type WorkspaceUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string;
  presence: string;
};

type Channel = {
  id: string;
  name: string;
  type: "TEXT" | "VOICE";
};

type Member = {
  role: string;
  user: Pick<WorkspaceUser, "id" | "username" | "displayName" | "presence">;
};

type Server = {
  id: string;
  name: string;
  description: string;
  channels: Channel[];
  members: Member[];
  _count: { members: number };
};

type Message = {
  id: string;
  content: string;
  createdAt: string;
  author: Pick<WorkspaceUser, "id" | "username" | "displayName">;
  attachments?: { id: string; fileName: string; mimeType: string; size: number; url: string }[];
};

type ApiError = { error?: string };
type Friend = { id: string; user: Pick<WorkspaceUser, "id" | "username" | "displayName" | "presence"> };
type Conversation = {
  id: string;
  members: (Pick<WorkspaceUser, "id" | "username" | "displayName" | "presence"> & { lastReadAt: string })[];
  latestMessage: { content: string; createdAt: string } | null;
};
type NotificationItem = { id: string; type: string; payload: Record<string, unknown>; readAt: string | null; createdAt: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  let data: T & ApiError;
  try {
    data = (await response.json()) as T & ApiError;
  } catch {
    throw new Error(response.ok ? "The server returned an invalid response." : `Request failed (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function displayName(user: Pick<WorkspaceUser, "username" | "displayName">) {
  return user.displayName || user.username;
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort(
    (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
  );
}

function playNotificationSound() {
  try {
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.19);
    oscillator.onended = () => void context.close();
  } catch (error) {
    console.error("notification sound playback error", error);
  }
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, icon: "/cord-logo.png" });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

export function Workspace({ user }: { user: WorkspaceUser }) {
  const router = useRouter();
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [activeView, setActiveView] = useState<"home" | "members" | "settings" | "friends" | "messages" | "notifications">("home");
  const [dialog, setDialog] = useState<"server" | "channel" | null>(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<{ id: string; user: Friend["user"] }[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<{ id: string; user: Friend["user"] }[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [directMessages, setDirectMessages] = useState<Message[]>([]);
  const [friendUsername, setFriendUsername] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<{ id: string; fileName: string }[]>([]);
  const [channelReaders, setChannelReaders] = useState<Record<string, string>>({});
  const [accountSettings, setAccountSettings] = useState({
    allowFriendRequests: true,
    allowDirectMessages: true,
    browserNotifications: false,
  });
  const composerRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingOffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const channelIdRef = useRef(selectedChannelId);
  const conversationIdRef = useRef(selectedConversationId);
  const soundEnabledRef = useRef(soundEnabled);
  const browserNotificationsRef = useRef(accountSettings.browserNotifications);
  useEffect(() => {
    channelIdRef.current = selectedChannelId;
    conversationIdRef.current = selectedConversationId;
    soundEnabledRef.current = soundEnabled;
    browserNotificationsRef.current = accountSettings.browserNotifications;
  }, [selectedChannelId, selectedConversationId, soundEnabled, accountSettings.browserNotifications]);

  useEffect(() => () => {
    if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
  }, []);

  const selectedServer = servers.find((server) => server.id === selectedServerId) ?? null;
  const selectedChannel =
    selectedServer?.channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const selectedConversation = conversations.find(({ id }) => id === selectedConversationId) ?? null;
  const conversationFriend = selectedConversation?.members[0] ?? null;

  const refreshServers = useCallback(async (preferredServerId?: string) => {
    const data = await requestJson<{ servers: Server[] }>("/api/servers", { cache: "no-store" });
    setServers(data.servers);
    const nextServer =
      data.servers.find((server) => server.id === preferredServerId) ?? data.servers[0];
    setSelectedServerId(nextServer?.id ?? "");
    setSelectedChannelId(nextServer?.channels[0]?.id ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => refreshServers())
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your servers.");
      })
      .finally(() => {
        if (active) setLoadingServers(false);
      });
    return () => {
      active = false;
    };
  }, [refreshServers]);

  const refreshSocial = useCallback(async () => {
    const [friendsResult, conversationsResult, notificationsResult] = await Promise.allSettled([
      requestJson<{
        friends: Friend[];
        incoming: { id: string; user: Friend["user"] }[];
        outgoing: { id: string; user: Friend["user"] }[];
      }>("/api/friends"),
      requestJson<{ conversations: Conversation[] }>("/api/conversations"),
      requestJson<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications"),
    ]);
    if (friendsResult.status === "fulfilled") {
      setFriends(friendsResult.value.friends);
      setIncomingRequests(friendsResult.value.incoming);
      setOutgoingRequests(friendsResult.value.outgoing);
    }
    if (conversationsResult.status === "fulfilled") setConversations(conversationsResult.value.conversations);
    if (notificationsResult.status === "fulfilled") {
      setNotifications(notificationsResult.value.notifications);
      setUnreadNotifications(notificationsResult.value.unreadCount);
    }
    const failed = [friendsResult, conversationsResult, notificationsResult].find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failed) console.error("workspace social data load error", failed.reason);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refreshSocial);
    void Promise.resolve().then(() => {
      try {
        setSoundEnabled(window.localStorage.getItem("cord-sound-notifications") !== "off");
      } catch (storageError) {
        console.error("notification preference load error", storageError);
      }
    });
  }, [refreshSocial]);

  useEffect(() => {
    let active = true;
    let liveSocket: Socket | null = null;
    void fetch("/api/realtime-token")
      .then(async (response) => {
        if (!response.ok) throw new Error("Realtime authentication failed.");
        return (await response.json()) as { enabled: boolean; url: string | null; token: string | null };
      })
      .then((data) => {
        if (!active || !data.enabled || !data.url) {
          if (active) setRealtimeStatus("offline");
          return;
        }
        liveSocket = io(data.url, {
          autoConnect: false,
          auth: (callback) => {
            void fetch("/api/realtime-token")
              .then(async (response) => {
                if (!response.ok) throw new Error("Realtime authentication failed.");
                return (await response.json()) as { enabled: boolean; token: string | null };
              })
              .then((auth) => {
                if (!auth.enabled || !auth.token) throw new Error("Realtime service is not configured.");
                callback({ token: auth.token });
              })
              .catch((authError: unknown) => {
                console.error("realtime token refresh error", authError);
                callback({ token: "" });
              });
          },
          reconnection: true,
          reconnectionDelayMax: 5000,
        });
        liveSocket.on("connect", () => {
          if (active) setRealtimeStatus("online");
          const channelId = channelIdRef.current;
          if (channelId) {
            void requestJson<{ messages: Message[] }>(
              `/api/messages?channelId=${encodeURIComponent(channelId)}`,
              { cache: "no-store" },
            ).then((result) => setMessages((current) => mergeMessages(current, result.messages)))
              .catch((syncError: unknown) => console.error("channel resync error", syncError));
          }
          const conversationId = conversationIdRef.current;
          if (conversationId) {
            void requestJson<{ messages: Message[] }>(
              `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
              { cache: "no-store" },
            ).then((result) => setDirectMessages((current) => mergeMessages(current, result.messages)))
              .catch((syncError: unknown) => console.error("direct message resync error", syncError));
          }
        });
        liveSocket.on("disconnect", () => {
          if (active) setRealtimeStatus("offline");
        });
        liveSocket.on("connect_error", (connectError: Error) => {
          console.error("realtime connection error", connectError);
          if (active) setRealtimeStatus("offline");
        });
        liveSocket.on("message:new", ({ channelId, message }: { channelId: string; message: Message }) => {
          if (channelId !== channelIdRef.current) return;
          setMessages((current) => mergeMessages(current, [message]));
        });
        liveSocket.on("channel:read", (payload: { channelId: string; userId: string; lastReadAt: string }) => {
          if (payload.channelId === channelIdRef.current) {
            setChannelReaders((current) => ({ ...current, [payload.userId]: payload.lastReadAt }));
          }
        });
        liveSocket.on("channel:typing", (payload: { channelId: string; userId: string; username: string; typing: boolean }) => {
          if (payload.channelId !== channelIdRef.current || payload.userId === user.id) return;
          setTypingUsers((current) => payload.typing
            ? current.includes(payload.username) ? current : [...current, payload.username]
            : current.filter((username) => username !== payload.username));
        });
        liveSocket.on("conversation:message", ({ conversationId, message }: { conversationId: string; message: Message }) => {
          if (conversationId === conversationIdRef.current) {
            setDirectMessages((current) => mergeMessages(current, [message]));
          }
          void refreshSocial();
        });
        liveSocket.on("conversation:typing", (payload: { conversationId: string; userId: string; username: string; typing: boolean }) => {
          if (payload.conversationId !== conversationIdRef.current || payload.userId === user.id) return;
          setTypingUsers((current) => payload.typing
            ? current.includes(payload.username) ? current : [...current, payload.username]
            : current.filter((username) => username !== payload.username));
        });
        liveSocket.on("conversation:read", (payload: { conversationId: string; userId: string; lastReadAt: string }) => {
          setConversations((current) => current.map((conversation) =>
            conversation.id === payload.conversationId
              ? {
                  ...conversation,
                  members: conversation.members.map((member) =>
                    member.id === payload.userId ? { ...member, lastReadAt: payload.lastReadAt } : member,
                  ),
                }
              : conversation,
          ));
        });
        liveSocket.on("notification:new", (payload: { username?: string; type?: string }) => {
          setUnreadNotifications((count) => count + 1);
          if (soundEnabledRef.current) playNotificationSound();
          if (browserNotificationsRef.current) {
            const title = payload.username
              ? `${payload.username} sent you a friend request`
              : payload.type === "DIRECT_MESSAGE" ? "New direct message" : "New community message";
            showBrowserNotification("Cord", title);
          }
          void refreshSocial();
        });
        liveSocket.on("friend:accepted", () => void refreshSocial());
        liveSocket.on("presence:changed", ({ userId, presence }: { userId: string; presence: string }) => {
          setFriends((current) => current.map((friend) =>
            friend.user.id === userId ? { ...friend, user: { ...friend.user, presence } } : friend,
          ));
        });
        liveSocket.connect();
        setSocket(liveSocket);
      })
      .catch((socketError: unknown) => {
        console.error("realtime setup error", socketError);
        if (active) setRealtimeStatus("offline");
      });

    return () => {
      active = false;
      liveSocket?.disconnect();
    };
  }, [refreshSocial, user.id]);

  useEffect(() => {
    if (!socket || !selectedChannelId) return;
    if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
    typingActiveRef.current = false;
    if (socket.connected) socket.emit("channel:join", selectedChannelId);
    const onConnect = () => socket.emit("channel:join", selectedChannelId);
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
      socket.emit("channel:leave", selectedChannelId);
      setTypingUsers([]);
    };
  }, [socket, selectedChannelId]);

  useEffect(() => {
    if (!socket || !selectedConversationId) return;
    if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
    typingActiveRef.current = false;
    if (socket.connected) socket.emit("conversation:join", selectedConversationId);
    const onConnect = () => socket.emit("conversation:join", selectedConversationId);
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
      socket.emit("conversation:leave", selectedConversationId);
      setTypingUsers([]);
    };
  }, [socket, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const controller = new AbortController();
    void requestJson<{ messages: Message[] }>(
      `/api/conversations/${encodeURIComponent(selectedConversationId)}/messages`,
      { cache: "no-store", signal: controller.signal },
    )
      .then((data) => setDirectMessages((current) => mergeMessages(current, data.messages)))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load direct messages.");
        }
      });
    return () => controller.abort();
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedChannelId) return;

    const controller = new AbortController();
    void Promise.resolve()
      .then(() =>
        requestJson<{ messages: Message[] }>(
          `/api/messages?channelId=${encodeURIComponent(selectedChannelId)}`,
          { cache: "no-store", signal: controller.signal },
        ),
      )
      .then((data) => {
        setMessages((current) => mergeMessages(current, data.messages));
        setLoadingMessages(false);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
          setLoadingMessages(false);
        }
      })
    return () => controller.abort();
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const channelId = selectedChannelId;
    void Promise.all([
      requestJson<{ readStates: { user: { id: string }; lastReadAt: string }[] }>(
        `/api/read-state?channelId=${encodeURIComponent(channelId)}`,
        { cache: "no-store" },
      ),
      requestJson<{ lastReadAt: string }>("/api/read-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      }),
    ])
      .then(([data, ownState]) => {
        setChannelReaders(Object.fromEntries(data.readStates.map(({ user, lastReadAt }) => [user.id, lastReadAt])));
        setChannelReaders((current) => ({ ...current, [user.id]: ownState.lastReadAt }));
      })
      .catch((readError: unknown) => console.error("channel read receipt update error", readError));
  }, [selectedChannelId, user.id]);

  useEffect(() => {
    void requestJson<{ settings: typeof accountSettings }>("/api/settings")
      .then(({ settings }) => setAccountSettings({
        allowFriendRequests: settings.allowFriendRequests,
        allowDirectMessages: settings.allowDirectMessages,
        browserNotifications: settings.browserNotifications,
      }))
      .catch((settingsError: unknown) => console.error("account settings load error", settingsError));
  }, []);

  const visibleMessages = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter(
      (message) =>
        message.content.toLowerCase().includes(query) ||
        displayName(message.author).toLowerCase().includes(query),
    );
  }, [messages, searchTerm]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!selectedChannel || (!content && !pendingUploads.length) || sending || uploading) return;
    setSending(true);
    setError("");
    try {
      const data = await requestJson<{ message: Message }>("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannel.id,
          content,
          attachmentTicketIds: pendingUploads.map(({ id }) => id),
        }),
      });
      setMessages((current) => mergeMessages(current, [data.message]));
      setDraft("");
      setPendingUploads([]);
      setEmojiOpen(false);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Your message could not be sent.");
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  }

  async function sendDirectMessage(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const content = draft.trim();
      if (!selectedConversationId || (!content && !pendingUploads.length) || sending || uploading) return;
      setSending(true);
      setError("");
      try {
        const data = await requestJson<{ message: Message }>(
          `/api/conversations/${encodeURIComponent(selectedConversationId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content,
              attachmentTicketIds: pendingUploads.map(({ id }) => id),
            }),
          },
        );
        setDirectMessages((current) => mergeMessages(current, [data.message]));
        setDraft("");
        setPendingUploads([]);
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : "Your direct message could not be sent.");
      } finally {
        setSending(false);
        composerRef.current?.focus();
      }
    }

  async function addFriend(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!friendUsername.trim()) return;
      setError("");
      try {
        await requestJson("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: friendUsername }),
        });
        setFriendUsername("");
        await refreshSocial();
      } catch (friendError) {
        setError(friendError instanceof Error ? friendError.message : "Could not send friend request.");
      }
    }

  async function respondToFriendRequest(friendshipId: string, action: "accept" | "reject") {
      setError("");
      try {
        await requestJson(`/api/friends/${encodeURIComponent(friendshipId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        await refreshSocial();
      } catch (friendError) {
        setError(friendError instanceof Error ? friendError.message : "Could not update friend request.");
      }
    }

    async function removeFriend(friendshipId: string) {
      setError("");
      try {
        await requestJson(`/api/friends/${encodeURIComponent(friendshipId)}`, { method: "DELETE" });
        await refreshSocial();
      } catch (friendError) {
        setError(friendError instanceof Error ? friendError.message : "Could not remove friend.");
      }
    }

  async function startConversation(friendId: string) {
      setError("");
      try {
        const data = await requestJson<{ conversation: { id: string } }>("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendId }),
        });
        await refreshSocial();
        setSelectedConversationId(data.conversation.id);
        setDirectMessages([]);
        setActiveView("messages");
      } catch (conversationError) {
        setError(conversationError instanceof Error ? conversationError.message : "Could not start direct message.");
      }
    }

  async function uploadFiles(files: FileList | null) {
      if (!files?.length) return;
      if (pendingUploads.length + files.length > 5) {
        setError("You can attach up to five files per message.");
        return;
      }
      setUploading(true);
      setError("");
      try {
        for (const file of Array.from(files)) {
          const ticket = await requestJson<{ ticketId: string; uploadUrl: string }>("/api/uploads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }),
          });
          const response = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!response.ok) throw new Error(`Could not upload ${file.name}.`);
          setPendingUploads((current) => [...current, { id: ticket.ticketId, fileName: file.name }]);
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Could not upload the selected file.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }

  async function updateSetting(key: keyof typeof accountSettings, value: boolean) {
      if (key === "browserNotifications" && value) {
        if (!("Notification" in window)) {
          setError("Browser notifications are not supported in this browser.");
          return;
        }
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setError("Allow Cord notifications in your browser to enable them.");
            return;
          }
        } catch (permissionError) {
          setError(permissionError instanceof Error ? permissionError.message : "Could not request browser notification permission.");
          return;
        }
      }
      const previous = accountSettings[key];
      setAccountSettings((current) => ({ ...current, [key]: value }));
      try {
        await requestJson("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });
      } catch (settingsError) {
        setAccountSettings((current) => ({ ...current, [key]: previous }));
        setError(settingsError instanceof Error ? settingsError.message : "Could not save this setting.");
      }
    }

  async function markNotificationsRead(notificationId?: string) {
      try {
        await requestJson("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notificationId ? { notificationId } : {}),
        });
        const now = new Date().toISOString();
        setNotifications((current) => current.map((notification) =>
          !notificationId || notification.id === notificationId
            ? { ...notification, readAt: now }
            : notification,
        ));
        setUnreadNotifications((count) => notificationId ? Math.max(0, count - 1) : 0);
      } catch (notificationError) {
        setError(notificationError instanceof Error ? notificationError.message : "Could not mark notifications read.");
    }
  }

  async function createServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ server: { id: string } }>("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          description: String(form.get("description") ?? ""),
          isPublic: form.get("isPublic") === "on",
        }),
      });
      await refreshServers(data.server.id);
      setDialog(null);
      setActiveView("home");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create your server.");
    } finally {
      setSaving(false);
    }
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServer) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ channel: Channel }>("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: selectedServer.id,
          name: String(form.get("name") ?? ""),
          type: form.get("type") === "VOICE" ? "VOICE" : "TEXT",
        }),
      });
      setServers((current) =>
        current.map((server) =>
          server.id === selectedServer.id
            ? { ...server, channels: [...server.channels, data.channel] }
            : server,
        ),
      );
      setSelectedChannelId(data.channel.id);
      setMessages([]);
      setLoadingMessages(true);
      setActiveView("home");
      setDialog(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the channel.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    setError("");
    try {
      await requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Could not log out.");
      setLoggingOut(false);
    }
  }

  function selectServer(server: Server) {
    setSelectedServerId(server.id);
    setSelectedChannelId(server.channels[0]?.id ?? "");
    setMessages([]);
    setLoadingMessages(true);
    setActiveView("home");
    setSearchTerm("");
  }

  function appendEmoji(emoji: string) {
    setDraft((current) => `${current}${emoji}`);
    setEmojiOpen(false);
    composerRef.current?.focus();
  }

  function updateDraft(value: string, conversation = false) {
    setDraft(value);
    if (!socket || (!selectedChannelId && !conversation) || (!selectedConversationId && conversation)) return;
    const event = conversation ? "conversation:typing" : "channel:typing";
    const identity = conversation
      ? { conversationId: selectedConversationId }
      : { channelId: selectedChannelId };
    if (value.length && !typingActiveRef.current) {
      socket.emit(event, { ...identity, typing: true });
      typingActiveRef.current = true;
    } else if (!value.length && typingActiveRef.current) {
      socket.emit(event, { ...identity, typing: false });
      typingActiveRef.current = false;
    }
    if (typingOffTimer.current) clearTimeout(typingOffTimer.current);
    if (!value.length) return;
    typingOffTimer.current = setTimeout(() => {
      socket.emit(event, { ...identity, typing: false });
      typingActiveRef.current = false;
    }, 1500);
  }

  function setSoundPreference(enabled: boolean) {
    setSoundEnabled(enabled);
    try {
      window.localStorage.setItem("cord-sound-notifications", enabled ? "on" : "off");
      if (enabled) playNotificationSound();
    } catch (storageError) {
      console.error("notification preference save error", storageError);
    }
  }

  return (
    <main className={`app-shell view-${activeView}${activeView !== "home" || !selectedServer ? " app-shell-wide" : ""}`}>
      <aside className="server-sidebar" aria-label="Your servers">
        <Link href="/app" className="brand-badge" aria-label="Cord home">C</Link>
        <div className="server-list">
          {servers.map((server) => (
            <button
              key={server.id}
              type="button"
              className={`server-pill ${server.id === selectedServerId ? "active" : ""}`}
              onClick={() => selectServer(server)}
              title={server.name}
              aria-label={`Open ${server.name}`}
            >
              {initials(server.name)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="server-add"
          aria-label="Create a server"
          title="Create a server"
          onClick={() => {
            setError("");
            setDialog("server");
          }}
        >
          <Plus size={18} />
        </button>
      </aside>

      <aside className="channel-sidebar">
        <button type="button" className="server-header" onClick={() => setActiveView("home")}>
          <span>{selectedServer?.name ?? "Your Cord"}</span>
          <ChevronDown size={14} />
        </button>

        <nav className="nav-list" aria-label="Workspace navigation">
          <button
            type="button"
            className={activeView === "home" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("home")}
          >
            <Home size={14} /> <span>Home</span>
          </button>
          <button
            type="button"
            className={activeView === "members" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("members")}
          >
            <Users size={14} /> <span>Members</span>
            {selectedServer ? <span className="nav-count">{selectedServer._count.members}</span> : null}
          </button>
          <button
            type="button"
            className={activeView === "friends" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("friends")}
          >
            <Users size={14} /> <span>Friends</span>
            {incomingRequests.length ? <span className="nav-count">{incomingRequests.length}</span> : null}
          </button>
          <button
            type="button"
            className={activeView === "messages" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("messages")}
          >
            <MessageSquareText size={14} /> <span>Messages</span>
          </button>
          <button
            type="button"
            className={activeView === "notifications" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setActiveView("notifications");
              void markNotificationsRead();
            }}
          >
            <Bell size={14} /> <span>Notifications</span>
            {unreadNotifications ? <span className="nav-count">{unreadNotifications}</span> : null}
          </button>
          <button
            type="button"
            className={activeView === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("settings")}
          >
            <Settings size={14} /> <span>Settings</span>
          </button>
        </nav>

        <div className="section-title">
          <span>Channels</span>
          <button
            type="button"
            aria-label="Create a channel"
            title={selectedServer ? "Create a channel" : "Create a server first"}
            disabled={!selectedServer}
            onClick={() => {
              setError("");
              setDialog("channel");
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="channel-list">
          {loadingServers ? <p className="sidebar-hint">Loading your spaces…</p> : null}
          {!loadingServers && !servers.length ? (
            <p className="sidebar-hint">Create a server to start a conversation.</p>
          ) : null}
          {selectedServer?.channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={channel.id === selectedChannelId ? "channel-row active" : "channel-row"}
              onClick={() => {
                setSelectedChannelId(channel.id);
                setMessages([]);
                setLoadingMessages(true);
                setActiveView("home");
                setSearchTerm("");
              }}
            >
              {channel.type === "VOICE" ? <AudioLines size={13} /> : <Hash size={13} />}
              <span>{channel.name}</span>
            </button>
          ))}
        </div>
        <div className="section-title dm-section-title">
          <span>Direct messages</span>
          <button type="button" aria-label="Find friends" title="Find friends" onClick={() => setActiveView("friends")}>
            <Plus size={14} />
          </button>
        </div>
        <div className="dm-list">
          {conversations.map((conversation) => {
            const friend = conversation.members[0];
            if (!friend) return null;
            return (
              <button
                type="button"
                key={conversation.id}
                className={selectedConversationId === conversation.id && activeView === "messages" ? "dm-row active" : "dm-row"}
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setDirectMessages([]);
                  setActiveView("messages");
                  setTypingUsers([]);
                }}
              >
                <span className="friend-avatar">{initials(displayName(friend))}</span>
                <span>{displayName(friend)}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="profile-card" onClick={() => setActiveView("settings")}>
          <span className="profile-avatar">{initials(displayName(user))}</span>
          <span className="profile-summary">
            <strong>{displayName(user)}</strong>
            <span>{user.presence.toLowerCase()}</span>
          </span>
          <Settings size={14} className="profile-settings" />
        </button>
      </aside>

      {activeView === "home" ? (
        <section className="chat-panel" aria-label="Channel conversation">
          <header className="chat-header">
            <div>
              <div className="channel-badge">
                {selectedChannel?.type === "VOICE" ? <AudioLines size={14} /> : <Hash size={14} />}
                {selectedChannel?.name ?? "Welcome"}
              </div>
              <span className="header-muted">
                <span className={`realtime-dot ${realtimeStatus}`} />
                {realtimeStatus === "online" ? "Live" : realtimeStatus === "connecting" ? "Connecting…" : "Offline"}
                {selectedServer ? ` · ${selectedServer.name}` : ""}
              </span>
            </div>
            <div className="header-tools">
              {searchOpen ? (
                <input
                  className="message-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search messages"
                  aria-label="Search messages"
                  autoFocus
                />
              ) : null}
              <button
                type="button"
                aria-label={searchOpen ? "Close message search" : "Search messages"}
                title="Search messages"
                onClick={() => {
                  setSearchOpen((open) => !open);
                  setSearchTerm("");
                }}
              >
                {searchOpen ? <X size={16} /> : <Search size={16} />}
              </button>
            </div>
          </header>

          {error ? <div className="workspace-alert" role="alert">{error}</div> : null}
          {!selectedServer ? (
            <div className="workspace-empty">
              <div className="empty-icon"><MessageSquareText size={23} /></div>
              <h1>{loadingServers ? "Getting your space ready…" : "Your people start here."}</h1>
              <p>
                {loadingServers
                  ? "Loading your servers."
                  : "Create a server and invite your community when you’re ready."}
              </p>
              {!loadingServers ? (
                <button type="button" className="button button-light" onClick={() => setDialog("server")}>
                  Create a server <Plus size={15} />
                </button>
              ) : null}
            </div>
          ) : !selectedChannel ? (
            <div className="workspace-empty">
              <div className="empty-icon"><Hash size={23} /></div>
              <h1>No channels yet</h1>
              <p>Create a channel to start a conversation in {selectedServer.name}.</p>
              <button type="button" className="button button-light" onClick={() => setDialog("channel")}>
                Create a channel <Plus size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="messages-container" aria-live="polite">
                {loadingMessages ? <p className="conversation-note">Loading messages…</p> : null}
                {!loadingMessages && !visibleMessages.length ? (
                  <div className="conversation-empty">
                    <div className="empty-icon"><Hash size={21} /></div>
                    <h1>{searchTerm ? "No matching messages" : `Welcome to #${selectedChannel.name}`}</h1>
                    <p>{searchTerm ? "Try another search." : "This is the beginning of this channel. Send the first message."}</p>
                  </div>
                ) : null}
                {visibleMessages.map((message) => {
                  const authorName = displayName(message.author);
                  const ownMessage = message.author.id === user.id;
                  return (
                    <article className={`message-row ${ownMessage ? "self" : ""}`} key={message.id}>
                      {!ownMessage ? (
                        <div className="avatar">{initials(authorName)}</div>
                      ) : null}
                      <div className={`bubble ${ownMessage ? "dark" : ""}`}>
                        <div className="bubble-header">
                          <strong>{authorName}</strong>
                          <time dateTime={message.createdAt}>
                            {new Intl.DateTimeFormat(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(message.createdAt))}
                          </time>
                        </div>
                        <p>{message.content}</p>
                        {message.attachments?.map((attachment) => (
                          <a
                            className="message-attachment"
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            key={attachment.id}
                          >
                            {attachment.fileName}
                          </a>
                        ))}
                        {ownMessage && selectedServer.members.some(({ user: member }) =>
                          member.id !== user.id &&
                          channelReaders[member.id] &&
                          new Date(channelReaders[member.id]).getTime() >= new Date(message.createdAt).getTime(),
                        ) ? <span className="message-receipt">Seen</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {selectedChannel.type === "TEXT" ? (
                <>
                {typingUsers.length ? <div className="typing-indicator">{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…</div> : null}
                {pendingUploads.length ? (
                  <div className="pending-uploads">{pendingUploads.map((file) => (
                    <span key={file.id}>{file.fileName}<button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => setPendingUploads((current) => current.filter(({ id }) => id !== file.id))}><X size={12} /></button></span>
                  ))}</div>
                ) : null}
                <form className="composer" onSubmit={sendMessage}>
                  <input ref={fileInputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
                  <button type="button" aria-label="Attach files" title="Attach images, PDFs, or text files (up to 10 MB)" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending}>
                    <Plus size={17} />
                  </button>
                  <input
                    ref={composerRef}
                    value={draft}
                    onChange={(event) => updateDraft(event.target.value)}
                    placeholder={`Message #${selectedChannel.name}`}
                    aria-label={`Message #${selectedChannel.name}`}
                    maxLength={4000}
                    disabled={sending}
                  />
                  <div className="emoji-control">
                    {emojiOpen ? (
                      <div className="emoji-picker" aria-label="Choose an emoji">
                        {["🙂", "✨", "❤️", "🎉", "👋"].map((emoji) => (
                          <button key={emoji} type="button" onClick={() => appendEmoji(emoji)} aria-label={`Insert ${emoji}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Choose an emoji"
                      title="Choose an emoji"
                      onClick={() => setEmojiOpen((open) => !open)}
                    >
                      <Smile size={16} />
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="send-button"
                    aria-label="Send message"
                    disabled={(!draft.trim() && !pendingUploads.length) || sending || uploading}
                  >
                    {uploading ? <span className="upload-spinner">…</span> : <Send size={15} />}
                  </button>
                </form>
                </>
              ) : (
                <CommunityCall channelId={selectedChannel.id} channelName={selectedChannel.name} />
              )}
            </>
          )}
        </section>
      ) : activeView === "members" ? (
        <section className="workspace-content">
          <header className="chat-header">
            <div><div className="channel-badge">Members</div><span className="header-muted">{selectedServer?.name ?? "Select a server"}</span></div>
          </header>
          {selectedServer ? (
            <div className="workspace-list">
              <h1>{selectedServer._count.members} {selectedServer._count.members === 1 ? "member" : "members"}</h1>
              {selectedServer.members.map(({ user: member, role }) => (
                <div className="member-row" key={member.id}>
                  <span className="friend-avatar">{initials(displayName(member))}</span>
                  <span className="member-name"><strong>{displayName(member)}</strong><span>{member.presence.toLowerCase()}</span></span>
                  <span className="member-role">{role.toLowerCase()}</span>
                </div>
              ))}
            </div>
          ) : <div className="workspace-empty"><h1>No server selected</h1><p>Create a server to see its members.</p></div>}
        </section>
      ) : activeView === "friends" ? (
        <section className="workspace-content">
          <header className="chat-header">
            <div><div className="channel-badge"><Users size={15} /> Friends</div><span className="header-muted">Add friends and start a conversation</span></div>
          </header>
          <div className="workspace-list">
            <form className="friend-search-form" onSubmit={addFriend}>
              <input value={friendUsername} onChange={(event) => setFriendUsername(event.target.value)} placeholder="Add a friend by username" aria-label="Friend username" minLength={3} maxLength={24} required />
              <button className="button button-light" type="submit">Send request</button>
            </form>
            {incomingRequests.length ? (
              <section className="social-list-section">
                <h2>Friend requests <span>{incomingRequests.length}</span></h2>
                {incomingRequests.map((request) => (
                  <div className="member-row" key={request.id}>
                    <span className="friend-avatar">{initials(displayName(request.user))}</span>
                    <span className="member-name"><strong>{displayName(request.user)}</strong><span>@{request.user.username}</span></span>
                    <button className="social-action" type="button" onClick={() => void respondToFriendRequest(request.id, "accept")}>Accept</button>
                    <button className="social-quiet-action" type="button" onClick={() => void respondToFriendRequest(request.id, "reject")}>Ignore</button>
                  </div>
                ))}
              </section>
            ) : null}
            {outgoingRequests.length ? (
              <section className="social-list-section">
                <h2>Sent requests <span>{outgoingRequests.length}</span></h2>
                {outgoingRequests.map((request) => (
                  <div className="member-row" key={request.id}>
                    <span className="friend-avatar">{initials(displayName(request.user))}</span>
                    <span className="member-name"><strong>{displayName(request.user)}</strong><span>Awaiting response</span></span>
                    <button className="social-quiet-action" type="button" onClick={() => void removeFriend(request.id)}>Cancel</button>
                  </div>
                ))}
              </section>
            ) : null}
            <section className="social-list-section">
              <h2>Friends <span>{friends.length}</span></h2>
              {friends.map((friend) => (
                <div className="member-row" key={friend.id}>
                  <span className={`friend-dot ${friend.user.presence === "OFFLINE" ? "offline" : ""}`} />
                  <span className="friend-avatar">{initials(displayName(friend.user))}</span>
                  <span className="member-name"><strong>{displayName(friend.user)}</strong><span>@{friend.user.username} · {friend.user.presence.toLowerCase()}</span></span>
                  <button className="social-action" type="button" onClick={() => void startConversation(friend.user.id)}>Message</button>
                  <button className="social-quiet-action" type="button" onClick={() => void removeFriend(friend.id)}>Remove</button>
                </div>
              ))}
              {!friends.length ? <p className="sidebar-hint">No friends yet. Search for someone by username above.</p> : null}
            </section>
          </div>
        </section>
      ) : activeView === "messages" ? (
        <section className="chat-panel" aria-label="Direct messages">
          <header className="chat-header">
            <div>
              <div className="channel-badge"><CircleUserRound size={15} /> {conversationFriend ? displayName(conversationFriend) : "Direct messages"}</div>
              <span className="header-muted">{conversationFriend ? `@${conversationFriend.username}` : "Choose a friend to start chatting"}</span>
            </div>
            <div className="header-tools">
              {searchOpen ? <input className="message-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search messages" aria-label="Search direct messages" autoFocus /> : null}
              <button type="button" aria-label={searchOpen ? "Close search" : "Search direct messages"} onClick={() => { setSearchOpen((open) => !open); setSearchTerm(""); }}>
                {searchOpen ? <X size={16} /> : <Search size={16} />}
              </button>
            </div>
          </header>
          {error ? <div className="workspace-alert" role="alert">{error}</div> : null}
          {!selectedConversation ? (
            <div className="workspace-empty">
              <div className="empty-icon"><MessageSquareText size={22} /></div>
              <h1>Your private conversations</h1>
              <p>Choose a friend from the sidebar or add someone to start a direct message.</p>
              <button type="button" className="button button-light" onClick={() => setActiveView("friends")}>Find friends <Users size={15} /></button>
            </div>
          ) : (
            <>
              <div className="messages-container" aria-live="polite">
                {!directMessages.length ? (
                  <div className="conversation-empty"><div className="empty-icon"><MessageSquareText size={21} /></div><h1>Say hello to                   {conversationFriend ? displayName(conversationFriend) : "your friend"}</h1><p>This is the beginning of your conversation.</p></div>
                ) : directMessages.filter((message) => !searchTerm || message.content.toLowerCase().includes(searchTerm.toLowerCase())).map((message) => {
                  const ownMessage = message.author.id === user.id;
                  return (
                    <article className={`message-row ${ownMessage ? "self" : ""}`} key={message.id}>
                      {!ownMessage ? <div className="avatar">{initials(displayName(message.author))}</div> : null}
                      <div className={`bubble ${ownMessage ? "dark" : ""}`}>
                        <div className="bubble-header"><strong>{displayName(message.author)}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
                        <p>{message.content}</p>
                        {message.attachments?.map((attachment) => <a className="message-attachment" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.fileName}</a>)}
                        {ownMessage && conversationFriend && new Date(conversationFriend.lastReadAt).getTime() >= new Date(message.createdAt).getTime()
                          ? <span className="message-receipt">Seen</span>
                          : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {typingUsers.length ? <div className="typing-indicator">{typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…</div> : null}
              {pendingUploads.length ? <div className="pending-uploads">{pendingUploads.map((file) => <span key={file.id}>{file.fileName}<button type="button" aria-label={`Remove ${file.fileName}`} onClick={() => setPendingUploads((current) => current.filter(({ id }) => id !== file.id))}><X size={12} /></button></span>)}</div> : null}
              <form className="composer" onSubmit={sendDirectMessage}>
                <input ref={fileInputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain" onChange={(event) => void uploadFiles(event.currentTarget.files)} />
                <button type="button" aria-label="Attach files" title="Attach files" onClick={() => fileInputRef.current?.click()} disabled={uploading || sending}><Plus size={17} /></button>
                <input ref={composerRef} value={draft} onChange={(event) => updateDraft(event.target.value, true)} placeholder={`Message ${conversationFriend ? displayName(conversationFriend) : "your friend"}`} aria-label="Direct message" maxLength={4000} disabled={sending} />
                <button type="submit" className="send-button" aria-label="Send direct message" disabled={(!draft.trim() && !pendingUploads.length) || sending || uploading}>{uploading ? "…" : <Send size={15} />}</button>
              </form>
            </>
          )}
        </section>
      ) : activeView === "notifications" ? (
        <section className="workspace-content">
          <header className="chat-header">
            <div><div className="channel-badge"><Bell size={15} /> Notifications</div><span className="header-muted">{unreadNotifications ? `${unreadNotifications} unread` : "You’re all caught up"}</span></div>
            {unreadNotifications ? <button type="button" className="social-quiet-action" onClick={() => void markNotificationsRead()}>Mark all read</button> : null}
          </header>
          <div className="workspace-list">
            {notifications.map((notification) => {
              const payload = notification.payload;
              const username = typeof payload.username === "string" ? payload.username : "Someone";
              const title = notification.type === "FRIEND_REQUEST"
                ? `${username} sent you a friend request`
                : notification.type === "FRIEND_ACCEPTED"
                  ? `${username} accepted your friend request`
                  : notification.type === "DIRECT_MESSAGE"
                    ? "You have a new direct message"
                    : "There’s a new message in your community";
              const friendshipId = typeof payload.friendshipId === "string" ? payload.friendshipId : "";
              return (
                <div className={`notification-row ${notification.readAt ? "" : "unread"}`} key={notification.id}>
                  <span className="notification-icon">{notification.type.startsWith("FRIEND") ? <Users size={16} /> : <MessageSquareText size={16} />}</span>
                  <span className="notification-copy"><strong>{title}</strong><time>{new Date(notification.createdAt).toLocaleString()}</time></span>
                  {notification.type === "FRIEND_REQUEST" && friendshipId ? <button type="button" className="social-action" onClick={() => void respondToFriendRequest(friendshipId, "accept")}>Accept</button> : null}
                  {!notification.readAt ? <button type="button" className="social-quiet-action" onClick={() => void markNotificationsRead(notification.id)}>Read</button> : null}
                </div>
              );
            })}
            {!notifications.length ? <div className="workspace-empty"><h1>No notifications yet</h1><p>Friend requests and new messages will show up here.</p></div> : null}
          </div>
        </section>
      ) : (
        <section className="workspace-content">
          <header className="chat-header">
            <div><div className="channel-badge">Your account</div><span className="header-muted">Manage your Cord session</span></div>
          </header>
          <div className="settings-card">
            <div className="profile-avatar settings-avatar">{initials(displayName(user))}</div>
            <h1>{displayName(user)}</h1>
            <p>@{user.username}</p>
            <dl>
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Presence</dt><dd>{user.presence.toLowerCase()}</dd></div>
            </dl>
            <label className="setting-toggle">
              <span><strong>Sound notifications</strong><small>Play a sound when a new message arrives</small></span>
              <input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundPreference(event.target.checked)} />
            </label>
            <label className="setting-toggle">
              <span><strong>Friend requests</strong><small>Allow people to send you friend requests</small></span>
              <input type="checkbox" checked={accountSettings.allowFriendRequests} onChange={(event) => void updateSetting("allowFriendRequests", event.target.checked)} />
            </label>
            <label className="setting-toggle">
              <span><strong>Direct messages</strong><small>Allow your friends to message you</small></span>
              <input type="checkbox" checked={accountSettings.allowDirectMessages} onChange={(event) => void updateSetting("allowDirectMessages", event.target.checked)} />
            </label>
            <label className="setting-toggle">
              <span><strong>Desktop notifications</strong><small>Show alerts while Cord is open (browser permission required)</small></span>
              <input type="checkbox" checked={accountSettings.browserNotifications} onChange={(event) => void updateSetting("browserNotifications", event.target.checked)} />
            </label>
            <button type="button" className="logout-button" onClick={logout} disabled={loggingOut}>
              <LogOut size={15} /> {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </section>
      )}

      {activeView === "home" && selectedServer ? (
        <aside className="member-panel">
          <div className="member-title">Members <span>{selectedServer._count.members}</span></div>
          {selectedServer.members.map(({ user: member }) => (
            <div className="friend-row" key={member.id}>
              <span className={`friend-dot ${member.presence === "OFFLINE" ? "offline" : ""}`} />
              <span className="friend-avatar">{initials(displayName(member))}</span>
              <span className="member-name">
                <strong>{displayName(member)}</strong>
                <span>{member.presence.toLowerCase()}</span>
              </span>
            </div>
          ))}
          {!selectedServer.members.length ? <p className="sidebar-hint">No members to show.</p> : null}
        </aside>
      ) : null}

      {error && activeView !== "home" ? <div className="workspace-alert" role="alert">{error}</div> : null}

      {dialog ? (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setDialog(null);
        }}>
          <section className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button
              type="button"
              className="dialog-close"
              aria-label="Close dialog"
              disabled={saving}
              onClick={() => setDialog(null)}
            >
              <X size={17} />
            </button>
            <h1 id="dialog-title">{dialog === "server" ? "Create a server" : "Create a channel"}</h1>
            <p>
              {dialog === "server"
                ? "Give your community a name and a place to start."
                : `Add a text or voice room to ${selectedServer?.name ?? "your server"}.`}
            </p>
            <form className="workspace-form" onSubmit={dialog === "server" ? createServer : createChannel}>
              <label>
                Name
                <input
                  name="name"
                  required
                  minLength={dialog === "server" ? 2 : 2}
                  maxLength={dialog === "server" ? 80 : 50}
                  pattern={dialog === "channel" ? "[a-z0-9][a-z0-9-]*" : undefined}
                  placeholder={dialog === "server" ? "Studio House" : "announcements"}
                  autoFocus
                />
                {dialog === "channel" ? (
                  <select name="type" defaultValue="TEXT" aria-label="Channel type">
                    <option value="TEXT">Text channel</option>
                    <option value="VOICE">Voice & video room</option>
                  </select>
                ) : null}
                {dialog === "channel" ? <small>Use lowercase letters, numbers, and hyphens.</small> : null}
              </label>
              {dialog === "server" ? (
                <>
                  <label>
                    Description <span className="optional-label">Optional</span>
                    <textarea name="description" maxLength={500} placeholder="What is this community about?" rows={3} />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" name="isPublic" defaultChecked />
                    <span>Make this server public</span>
                  </label>
                </>
              ) : null}
              {error ? <div className="auth-error" role="alert">{error}</div> : null}
              <button type="submit" className="button button-light" disabled={saving}>
                {saving ? "Creating…" : dialog === "server" ? "Create server" : "Create channel"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
