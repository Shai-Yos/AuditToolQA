"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  linkAdmin: string | null;
  linkUser: string | null;
  read: boolean;
  createdAt: string;
}

function ToastItem({
  notification,
  onClose,
  onClick,
}: {
  notification: Notification;
  onClose: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onClose(notification.id), 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification.id, onClose]);

  return (
    <div
      className={`notif-toast pointer-events-auto flex w-full max-w-sm lg:max-w-lg items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:p-6 shadow-lg transition-all duration-300 dark:border-slate-700 dark:bg-slate-800 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0 rounded-full bg-blue-100 p-1.5 lg:p-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 lg:h-5 lg:w-5 text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      </div>
      {/* Content */}
      <button
        onClick={() => onClick(notification)}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <p className="text-sm lg:text-base font-semibold text-slate-900 dark:text-slate-100">
          {notification.title}
        </p>
        <p className="mt-0.5 text-xs lg:text-sm text-slate-500 dark:text-slate-400">
          {notification.message}
        </p>
      </button>
      {/* Close */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setVisible(false);
          setTimeout(() => onClose(notification.id), 300);
        }}
        className="shrink-0 rounded p-0.5 lg:p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        aria-label="Dismiss"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 lg:h-5 lg:w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Module-level dedup set — prevents multiple mounted instances (mobile + desktop bell)
// from playing the chime more than once for the same batch of notifications.
const _chimeFiredIds = new Set<string>();

// BroadcastChannel for cross-tab dedup — ensures only one browser tab plays the chime
// even when the same user has the app open in multiple tabs simultaneously.
let _bc: BroadcastChannel | null = null;
function getChimeBC(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!_bc) {
    try {
      _bc = new BroadcastChannel("notif_chime_v1");
      _bc.onmessage = (e: MessageEvent<string[]>) => {
        // Another tab already played for these IDs — mark them as fired here too
        if (Array.isArray(e.data)) {
          e.data.forEach((id) => _chimeFiredIds.add(id));
        }
      };
    } catch {
      // BroadcastChannel not supported (e.g. some older environments)
    }
  }
  return _bc;
}

function playChimeOnce(notificationIds: string[], isMention = false) {
  const fresh = notificationIds.filter((id) => !_chimeFiredIds.has(id));
  if (fresh.length === 0) return;
  fresh.forEach((id) => _chimeFiredIds.add(id));
  // Prune old IDs to avoid unbounded growth
  if (_chimeFiredIds.size > 200) {
    const iter = _chimeFiredIds.values();
    for (let i = 0; i < 100; i++) _chimeFiredIds.delete(iter.next().value as string);
  }
  // Notify other tabs so they skip these IDs
  getChimeBC()?.postMessage(fresh);
  playChime(isMention);
}

function playChime(isMention = false) {
  try {
    const ctx = new AudioContext();

    const playNote = (freq: number, startTime: number, volume: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      // Quick attack, smooth exponential decay — classic notification feel
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    if (isMention) {
      // Three ascending tones: C5 → E5 → G5 (major chord arpeggio — universally familiar)
      playNote(523, ctx.currentTime,        0.18, 0.6);
      playNote(659, ctx.currentTime + 0.13, 0.18, 0.6);
      playNote(784, ctx.currentTime + 0.26, 0.20, 0.7);
    } else {
      // Two ascending tones: G4 → C5 — classic "ding-dong" notification
      playNote(392, ctx.currentTime,        0.15, 0.55);
      playNote(523, ctx.currentTime + 0.14, 0.18, 0.65);
    }
  } catch {
    // AudioContext not available (SSR or blocked)
  }
}

type NotifPrefs = {
  assignments: boolean;
  mentions: boolean;
  chat: boolean;
  requestActivity: boolean;
};

const DEFAULT_PREFS: NotifPrefs = { assignments: true, mentions: true, chat: true, requestActivity: true };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("notif-sound") !== "off" : true,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const ref = useRef<HTMLDivElement>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("notif-sound", next ? "on" : "off");
      return next;
    });
  };

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/me/notif-preferences");
      if (res.ok) {
        const data = (await res.json()) as NotifPrefs;
        setPrefs(data);
      }
    } catch {
      // silently ignore
    }
  }, []);

  const togglePref = async (key: keyof NotifPrefs) => {
    const next: NotifPrefs = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      await fetch("/api/me/notif-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch {
      setPrefs(prefs); // revert on error
    }
  };

  // Fetch full notification list (used on mount + when opening dropdown)
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unreadCount: number;
      };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silently ignore
    }
  }, []);

  // SSE for real-time push
  useEffect(() => {
    // Load initial list and preferences
    void fetchNotifications();
    void fetchPrefs();

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource("/api/notifications/stream");

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            notifications?: Notification[];
            unreadCount?: number;
          };
          if (data.type === "new" && data.notifications?.length) {
            // Play notification sound (deduped across multiple mounted instances)
            if (localStorage.getItem("notif-sound") !== "off") {
              const hasMention = data.notifications!.some((n) => n.type === "CHAT_MENTION" || n.type === "CHAT_REPLY" || n.type === "COMMENT_MENTION");
              playChimeOnce(data.notifications!.map((n) => n.id), hasMention);
            }
            // Show toasts for new notifications
            setToasts((prev) =>
              [...data.notifications!, ...prev].slice(0, 5),
            );
            // Update unread count
            if (data.unreadCount !== undefined) {
              setUnreadCount(data.unreadCount);
            }
            // Prepend to the list
            setNotifications((prev) => {
              const existingIds = new Set(prev.map((n) => n.id));
              const fresh = data.notifications!.filter(
                (n) => !existingIds.has(n.id),
              );
              return [...fresh, ...prev].slice(0, 50);
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es?.close();
        // Reconnect after 5s
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, [fetchNotifications, fetchPrefs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Pick the correct link based on current dashboard
  const getLink = (n: Notification) => {
    const isAdmin = window.location.pathname.startsWith("/adminDashboard");
    return isAdmin ? n.linkAdmin : n.linkUser;
  };

  const handleClick = (n: Notification) => {
    // Mark single as read
    if (!n.read) {
      void fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      });
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // Dismiss toast if it exists
    dismissToast(n.id);
    const link = getLink(n);
    if (link) {
      window.location.href = link;
    }
    setOpen(false);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <>
      {/* Toast container — fixed at top center */}
      {toasts.length > 0 && (
        <div className="fixed right-6 top-4 z-[100] flex w-full max-w-sm lg:max-w-lg flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <ToastItem
              key={t.id}
              notification={t}
              onClose={dismissToast}
              onClick={handleClick}
            />
          ))}
        </div>
      )}

      {/* Bell icon + dropdown */}
      <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => {
            if (!o) void fetchNotifications(); // refresh list when opening
            return !o;
          });
        }}
        className="relative rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:!text-white dark:text-slate-200 dark:hover:bg-slate-700"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white shadow-sm ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel absolute right-0 top-full z-50 mt-2 w-80 lg:w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 lg:px-6 lg:py-4 dark:border-slate-700">
            {showSettings ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title="Back to notifications"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-sm lg:text-base font-semibold text-slate-900 dark:text-slate-100">
                  Notification preferences
                </h3>
              </div>
            ) : (
              <h3 className="text-sm lg:text-base font-semibold text-slate-900 dark:text-slate-100">
                Notifications
              </h3>
            )}
            <div className="flex items-center gap-2">
              {!showSettings && (
                <>
                  <button
                    onClick={toggleSound}
                    title={soundEnabled ? "Mute notification sounds" : "Unmute notification sounds"}
                    className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    {soundEnabled ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9H5a1 1 0 00-1 1v4a1 1 0 001 1h4l4 4V5L9 9z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    )}
                  </button>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => void markAllRead()}
                      disabled={loading}
                      className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
                    >
                      Mark all read
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => setShowSettings((s) => !s)}
                title="Notification preferences"
                className={`rounded p-1 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200 ${
                  showSettings
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-400"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Settings panel */}
          {showSettings ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              <p className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
                Choose which notifications you receive.
              </p>

              {/* Assignments — toggleable */}
              <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
                <div>
                  <p className="text-sm lg:text-base font-medium text-slate-700 dark:text-slate-300">
                    Assignments
                  </p>
                  <p className="text-xs lg:text-sm text-slate-400 dark:text-slate-500">
                    When you are assigned or removed from audits / requests
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs.assignments}
                  onClick={() => void togglePref("assignments")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    prefs.assignments ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      prefs.assignments ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Mentions — toggleable */}
              <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
                <div>
                  <p className="text-sm lg:text-base font-medium text-slate-700 dark:text-slate-300">
                    Mentions
                  </p>
                  <p className="text-xs lg:text-sm text-slate-400 dark:text-slate-500">
                    When someone mentions or replies to you in a chat or comment
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs.mentions}
                  onClick={() => void togglePref("mentions")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    prefs.mentions ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      prefs.mentions ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Chat messages — toggleable */}
              <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
                <div>
                  <p className="text-sm lg:text-base font-medium text-slate-700 dark:text-slate-300">
                    Chat messages
                  </p>
                  <p className="text-xs lg:text-sm text-slate-400 dark:text-slate-500">
                    New messages in audit chats
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs.chat}
                  onClick={() => void togglePref("chat")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    prefs.chat ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      prefs.chat ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Request activity — toggleable */}
              <div className="flex items-center justify-between px-4 py-3 lg:px-6 lg:py-4">
                <div>
                  <p className="text-sm lg:text-base font-medium text-slate-700 dark:text-slate-300">
                    Request activity
                  </p>
                  <p className="text-xs lg:text-sm text-slate-400 dark:text-slate-500">
                    Requests created, updated, moved, or feedback
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs.requestActivity}
                  onClick={() => void togglePref("requestActivity")}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                    prefs.requestActivity ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      prefs.requestActivity ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          ) : (
            /* List — only today's notifications */
            <div className="max-h-80 lg:max-h-[500px] overflow-y-auto">
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayNotifications = notifications.filter((n) => {
                  const created = new Date(n.createdAt);
                  created.setHours(0, 0, 0, 0);
                  return created.getTime() === today.getTime();
                });
                if (todayNotifications.length === 0) {
                  return (
                    <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                      No notifications today
                    </div>
                  );
                }
                return todayNotifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 lg:px-5 lg:py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/60 ${
                      !n.read ? "bg-blue-50/50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="mt-1.5 lg:mt-2 shrink-0">
                      {!n.read ? (
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                      ) : (
                        <div className="h-2 w-2" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm lg:text-base font-medium text-slate-900 dark:text-slate-100">
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                        {n.message}
                      </p>
                      <p className="mt-1 text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </button>
                ));
              })()}
            </div>
          )}
        </div>
      )}
      </div>
    </>
  );
}
