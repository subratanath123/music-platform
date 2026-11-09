"use client";

import { useSyncExternalStore } from "react";
import { createSeedDatabase } from "@/lib/db-seed";
import type { ChatMessage, CommunityDatabase, DbUser } from "@/lib/db-types";

export type OpenChatWindow = {
  musicianId: string;
  minimized: boolean;
};

type ClientStoreState = {
  db: CommunityDatabase;
  currentUserId: string | null;
  ssoConfigured: boolean;
  googleClientId: string;
  chatWindows: OpenChatWindow[];
  hydrated: boolean;
};

const legacySessionKey = "sur_session_user_id";
const chatWindowsKey = "sur_open_chat_windows";
const storeEvent = "sur-community-store";
const POLL_INTERVAL_MS = 1500;

let state: ClientStoreState = {
  db: createSeedDatabase(),
  currentUserId: null,
  ssoConfigured: false,
  googleClientId: "",
  chatWindows: [],
  hydrated: false,
};

let lastDbJson = "";
let knownMessageIds = new Set<string>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollingInFlight = false;

const serverSnapshot: ClientStoreState = state;

function emit() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(storeEvent));
  }
}

function applyIncomingDatabase(nextDb: CommunityDatabase, isInitial = false) {
  if (!nextDb || !Array.isArray(nextDb.users)) return;

  const nextJson = JSON.stringify(nextDb);
  const changed = nextJson !== lastDbJson;
  lastDbJson = nextJson;

  // Detect brand-new incoming messages for the signed-in user and auto-open their chat window
  let updatedChatWindows = state.chatWindows;
  const myId = state.currentUserId;

  if (!isInitial && myId && Array.isArray(nextDb.messages)) {
    for (const msg of nextDb.messages) {
      if (
        !knownMessageIds.has(msg.id) &&
        msg.toId === myId &&
        msg.fromId !== myId
      ) {
        const alreadyOpen = updatedChatWindows.some((w) => w.musicianId === msg.fromId);
        updatedChatWindows = alreadyOpen
          ? updatedChatWindows.map((w) =>
              w.musicianId === msg.fromId ? { ...w, minimized: false } : w,
            )
          : [...updatedChatWindows.slice(-2), { musicianId: msg.fromId, minimized: false }];
      }
    }
  }

  if (Array.isArray(nextDb.messages)) {
    knownMessageIds = new Set(nextDb.messages.map((m) => m.id));
  }

  if (changed || updatedChatWindows !== state.chatWindows || !state.hydrated) {
    state = {
      ...state,
      db: nextDb,
      chatWindows: updatedChatWindows,
      hydrated: true,
    };
    if (typeof window !== "undefined" && updatedChatWindows !== state.chatWindows) {
      window.localStorage.setItem(chatWindowsKey, JSON.stringify(updatedChatWindows));
    }
    emit();
  }
}

async function pollCommunityDatabase() {
  if (typeof window === "undefined" || pollingInFlight) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

  pollingInFlight = true;
  try {
    const res = await fetch("/community-data", { cache: "no-store" });
    if (!res.ok) return;
    const db = (await res.json()) as CommunityDatabase;
    applyIncomingDatabase(db, false);
  } catch {
    // ignore transient poll errors
  } finally {
    pollingInFlight = false;
  }
}

function startPolling() {
  if (typeof window === "undefined" || pollTimer !== null) return;
  pollTimer = setInterval(() => {
    void pollCommunityDatabase();
  }, POLL_INTERVAL_MS);

  window.addEventListener("focus", () => {
    void pollCommunityDatabase();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void pollCommunityDatabase();
    }
  });
}

let fetchStarted = false;

function ensureHydrated() {
  if (typeof window === "undefined" || fetchStarted) return;
  fetchStarted = true;
  const savedChatsRaw = window.localStorage.getItem(chatWindowsKey);
  let savedChats: OpenChatWindow[] = [];
  if (savedChatsRaw) {
    try {
      const parsed = JSON.parse(savedChatsRaw) as OpenChatWindow[];
      if (Array.isArray(parsed)) savedChats = parsed;
    } catch {
      savedChats = [];
    }
  }
  state = {
    ...state,
    chatWindows: savedChats,
  };

  void Promise.all([
    fetch("/community-data", { cache: "no-store" }).then((res) => res.json()),
    fetch("/auth/session", { cache: "no-store" }).then((res) => res.json()),
  ])
    .then(
      ([db, session]: [
        CommunityDatabase,
        { user: DbUser | null; ssoConfigured: boolean; googleClientId?: string },
      ]) => {
        const resolvedUserId = session?.user?.id ?? null;

        state = {
          ...state,
          currentUserId: resolvedUserId,
          ssoConfigured: Boolean(session?.ssoConfigured),
          googleClientId: session?.googleClientId ?? "",
          hydrated: true,
        };
        window.localStorage.removeItem(legacySessionKey);
        applyIncomingDatabase(db, true);
        startPolling();
      },
    )
    .catch(() => {
      state = { ...state, hydrated: true };
      emit();
      startPolling();
    });
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(storeEvent, callback);
  if (!fetchStarted) {
    queueMicrotask(() => {
      ensureHydrated();
      emit();
    });
  }
  return () => window.removeEventListener(storeEvent, callback);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return serverSnapshot;
}

export function useCommunityStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCurrentUser(): DbUser | null {
  const { db, currentUserId } = useCommunityStore();
  if (!currentUserId) return null;
  return db.users.find((u) => u.id === currentUserId) ?? null;
}

function saveChatWindows(next: OpenChatWindow[]) {
  state = { ...state, chatWindows: next };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(chatWindowsKey, JSON.stringify(next));
  }
  emit();
}

export function openChatWindow(musicianId: string) {
  if (state.currentUserId && musicianId === state.currentUserId) {
    return;
  }
  const exists = state.chatWindows.some((w) => w.musicianId === musicianId);
  const next = exists
    ? state.chatWindows.map((w) =>
        w.musicianId === musicianId ? { ...w, minimized: false } : w,
      )
    : [...state.chatWindows.slice(-2), { musicianId, minimized: false }];
  saveChatWindows(next);
}

export function toggleMinimizeChatWindow(musicianId: string) {
  const next = state.chatWindows.map((w) =>
    w.musicianId === musicianId ? { ...w, minimized: !w.minimized } : w,
  );
  saveChatWindows(next);
}

export function closeChatWindow(musicianId: string) {
  const next = state.chatWindows.filter((w) => w.musicianId !== musicianId);
  saveChatWindows(next);
}

/** Signing in only happens server-side through Google; this is used to sign out. */
export async function setSessionUser(userId: null) {
  state = { ...state, currentUserId: userId, chatWindows: [] };
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(chatWindowsKey);
    await fetch("/auth/session", { method: "DELETE" });
    const res = await fetch("/community-data", { cache: "no-store" });
    if (res.ok) applyIncomingDatabase((await res.json()) as CommunityDatabase, true);
  }
  emit();
}

export function applyAuthenticatedUser(db: CommunityDatabase, user: DbUser) {
  state = {
    ...state,
    currentUserId: user.id,
    hydrated: true,
  };
  applyIncomingDatabase(db, true);
}

export async function mutateCommunity<T = { db: CommunityDatabase; user?: DbUser }>(
  payload: Record<string, unknown>,
): Promise<T> {
  // Optimistic instant update when sending a chat message
  if (
    payload.action === "sendMessage" &&
    typeof payload.fromId === "string" &&
    typeof payload.toId === "string" &&
    (typeof payload.text === "string" || typeof payload.attachmentUrl === "string")
  ) {
    const attachmentUrl =
      typeof payload.attachmentUrl === "string" ? payload.attachmentUrl : undefined;
    const attachmentKind =
      payload.attachmentKind === "video" || payload.attachmentKind === "audio"
        ? payload.attachmentKind
        : undefined;
    const attachmentName =
      typeof payload.attachmentName === "string" ? payload.attachmentName : undefined;
    const rawText = typeof payload.text === "string" ? payload.text.trim() : "";
    const optimisticMsg: ChatMessage = {
      id: `opt-${Date.now().toString(36)}`,
      fromId: payload.fromId,
      toId: payload.toId,
      text:
        rawText ||
        (attachmentUrl
          ? `📎 ${attachmentKind === "video" ? "Video" : "Audio"}: ${attachmentName ?? "attachment"}`
          : ""),
      attachmentUrl,
      attachmentKind,
      attachmentName,
      createdAt: new Date().toISOString(),
    };
    knownMessageIds.add(optimisticMsg.id);
    state = {
      ...state,
      db: {
        ...state.db,
        messages: [...state.db.messages, optimisticMsg],
      },
    };
    emit();
  }

  const res = await fetch("/community-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as T & { db?: CommunityDatabase; user?: DbUser };
  if (data.db) {
    applyIncomingDatabase(data.db, false);
  }
  return data;
}

export async function uploadAudioFile(
  file: File,
): Promise<{ url: string; name: string; kind?: "image" | "audio" | "video" }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/community-upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error("Upload failed");
  }
  return (await res.json()) as { url: string; name: string; kind?: "image" | "audio" | "video" };
}
