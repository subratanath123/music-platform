"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  PackageCheck,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  ShoppingBag,
  Star,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  ChatboxDockedPlayer,
  extractMediaFromMessage,
  MediaAttachmentPreview,
} from "@/components/media/media-attachment-preview";
import { pick, type Role } from "@/data/catalog";
import { Link } from "@/i18n/navigation";
import {
  closeChatWindow,
  mutateCommunity,
  openChatWindow,
  toggleMinimizeChatWindow,
  uploadAudioFile,
  useCommunityStore,
  useCurrentUser,
} from "@/lib/community-store";
import type { MediaAttachmentKind } from "@/lib/db-types";
import { formatNumber } from "@/lib/format";

type UploadedAttachment = {
  url: string;
  name: string;
  kind: MediaAttachmentKind;
};

export function FacebookChatDock() {
  const t = useTranslations("Watch");
  const home = useTranslations("Home");
  const locale = useLocale();
  const { db, chatWindows } = useCommunityStore();
  const currentUser = useCurrentUser();
  const activeUserId = currentUser?.id ?? null;
  const [launcherOpen, setLauncherOpen] = useState(false);

  // Only list users with whom the current user actually has a conversation or an order
  const conversationPeers = useMemo(() => {
    if (!activeUserId) return [];
    const lastMessageByPeer = new Map<string, { text: string; createdAt: string }>();

    for (const msg of db.messages) {
      if (msg.fromId === msg.toId) continue;
      if (msg.fromId === activeUserId) {
        lastMessageByPeer.set(msg.toId, { text: msg.text, createdAt: msg.createdAt });
      } else if (msg.toId === activeUserId) {
        lastMessageByPeer.set(msg.fromId, { text: msg.text, createdAt: msg.createdAt });
      }
    }

    for (const ord of db.orders ?? []) {
      const peerId =
        ord.buyerId === activeUserId
          ? ord.musicianId
          : ord.musicianId === activeUserId
            ? ord.buyerId
            : null;
      if (peerId && !lastMessageByPeer.has(peerId)) {
        lastMessageByPeer.set(peerId, {
          text: `Order: ${ord.title}`,
          createdAt: ord.createdAt,
        });
      }
    }

    return db.users
      .filter((u) => u.id !== activeUserId && lastMessageByPeer.has(u.id))
      .map((user) => ({
        user,
        lastMessage: lastMessageByPeer.get(user.id)!,
      }))
      .sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt));
  }, [db.messages, db.orders, db.users, activeUserId]);

  if (!activeUserId) {
    return null;
  }

  const visibleChatWindows = chatWindows.filter((win) => win.musicianId !== activeUserId);

  return (
    <div
      className="fixed right-3 bottom-0 z-50 flex items-end gap-3 sm:right-6"
      aria-label={t("chatHeading")}
    >
      {visibleChatWindows.map((win) => {
        const peer = db.users.find((u) => u.id === win.musicianId);
        if (!peer || peer.id === activeUserId) return null;
        return (
          <ChatBox
            key={win.musicianId}
            peerId={peer.id}
            peerName={pick(locale, peer.nameBn, peer.name)}
            peerRole={home(`roles.${peer.roles[0] as Role}`)}
            peerCity={pick(locale, peer.cityBn, peer.city)}
            peerDefaultPrice={peer.priceFromBdt ?? 4000}
            peerPhone={peer.phone}
            peerBkashNumber={peer.bkashNumber}
            minimized={win.minimized}
            activeUserId={activeUserId}
          />
        );
      })}

      {/* Quick Messenger Bubble Launcher — shows only existing conversation peers */}
      <div className="relative mb-3">
        {launcherOpen ? (
          <div className="mb-3 w-80 rounded-3xl border border-white/15 bg-[#161616] p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-sm font-semibold">
                {t("chatHeading")} ({conversationPeers.length})
              </span>
              <button
                type="button"
                onClick={() => setLauncherOpen(false)}
                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            {conversationPeers.length === 0 ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {locale === "bn"
                  ? "এখনো কারো সাথে চ্যাট হয়নি। অন্য কোনো শিল্পীর পোস্ট বা প্রোফাইলে 'মেসেজ' বাটনে ক্লিক করে কথা শুরু করো।"
                  : "No conversations yet. Click 'Message' on another musician's post or profile to start chatting."}
              </p>
            ) : (
              <ul className="mt-2.5 max-h-72 space-y-1.5 overflow-y-auto">
                {conversationPeers.map(({ user: u, lastMessage }) => {
                  const uName = pick(locale, u.nameBn, u.name);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          openChatWindow(u.id);
                          setLauncherOpen(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-xs hover:bg-white/10"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-xs font-bold text-[#1a0900]">
                          {uName.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {uName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {lastMessage.text}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setLauncherOpen((v) => !v)}
          className="inline-flex h-12 items-center gap-2.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-5 text-sm font-semibold text-[#1a0900] shadow-xl shadow-[#ff5500]/25 transition-transform hover:scale-[1.02]"
        >
          <span className="grid size-6 place-items-center rounded-full bg-black/20 text-[#1a0900]">
            <MessageCircle className="size-4" />
          </span>
          <span>
            {t("chatHeading")}
            {conversationPeers.length > 0 ? ` (${conversationPeers.length})` : ""}
          </span>
        </button>
      </div>
    </div>
  );
}

function ChatBox({
  peerId,
  peerName,
  peerRole,
  peerCity,
  peerDefaultPrice,
  peerPhone,
  peerBkashNumber,
  minimized,
  activeUserId,
}: {
  peerId: string;
  peerName: string;
  peerRole: string;
  peerCity: string;
  peerDefaultPrice: number;
  peerPhone?: string;
  peerBkashNumber?: string;
  minimized: boolean;
  activeUserId: string;
}) {
  const t = useTranslations("Watch");
  const locale = useLocale();
  const { db } = useCommunityStore();
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Chat attachment state
  const [chatAttachment, setChatAttachment] = useState<UploadedAttachment | null>(null);
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  const [activePlayer, setActivePlayer] = useState<{
    url: string;
    kind: MediaAttachmentKind;
    name: string;
  } | null>(null);

  // Place Order modal state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderTitle, setOrderTitle] = useState("");
  const [orderDesc, setOrderDesc] = useState("");
  const [orderPrice, setOrderPrice] = useState(String(peerDefaultPrice));
  const [orderDays, setOrderDays] = useState("4");
  const [orderBkashTrxId, setOrderBkashTrxId] = useState("");
  const [orderAttachment, setOrderAttachment] = useState<UploadedAttachment | null>(null);
  const [uploadingOrderFile, setUploadingOrderFile] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [copiedBkash, setCopiedBkash] = useState(false);

  // Deliver Order state
  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryAttachment, setDeliveryAttachment] = useState<UploadedAttachment | null>(null);
  const [uploadingDeliveryFile, setUploadingDeliveryFile] = useState(false);
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  // Complete & Review state
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const threadContainerRef = useRef<HTMLDivElement>(null);

  const threadMessages = db.messages.filter(
    (m) =>
      m.fromId !== m.toId &&
      ((m.fromId === activeUserId && m.toId === peerId) ||
        (m.fromId === peerId && m.toId === activeUserId)),
  );

  // Orders between activeUserId and peerId
  const pairOrders = (db.orders ?? []).filter(
    (o) =>
      (o.buyerId === activeUserId && o.musicianId === peerId) ||
      (o.buyerId === peerId && o.musicianId === activeUserId),
  );

  // Mark incoming unread messages as seen when chat window is open and un-minimized
  useEffect(() => {
    if (minimized) return;
    const hasUnread = threadMessages.some((m) => m.toId === activeUserId && !m.readAt);
    if (hasUnread) {
      void mutateCommunity({
        action: "markMessagesSeen",
        viewerId: activeUserId,
        peerId,
      });
    }
  }, [threadMessages, minimized, activeUserId, peerId]);

  useEffect(() => {
    if (!minimized && threadContainerRef.current) {
      threadContainerRef.current.scrollTop = threadContainerRef.current.scrollHeight;
    }
  }, [threadMessages.length, pairOrders.length, minimized, expanded]);

  async function handleUploadAttachment(
    file: File | undefined,
    target: "chat" | "order" | "delivery",
  ) {
    if (!file) return;
    if (target === "chat") setUploadingChatFile(true);
    if (target === "order") setUploadingOrderFile(true);
    if (target === "delivery") setUploadingDeliveryFile(true);
    try {
      const up = await uploadAudioFile(file);
      const kind: MediaAttachmentKind =
        up.kind === "video" || file.type.startsWith("video/") ? "video" : "audio";
      const item: UploadedAttachment = { url: up.url, name: up.name, kind };
      if (target === "chat") setChatAttachment(item);
      if (target === "order") setOrderAttachment(item);
      if (target === "delivery") setDeliveryAttachment(item);
    } finally {
      if (target === "chat") setUploadingChatFile(false);
      if (target === "order") setUploadingOrderFile(false);
      if (target === "delivery") setUploadingDeliveryFile(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if ((!clean && !chatAttachment) || peerId === activeUserId) return;
    const att = chatAttachment;
    setText("");
    setChatAttachment(null);
    await mutateCommunity({
      action: "sendMessage",
      fromId: activeUserId,
      toId: peerId,
      text: clean,
      attachmentUrl: att?.url,
      attachmentKind: att?.kind,
      attachmentName: att?.name,
    });
  }

  async function handlePlaceOrder(event: FormEvent) {
    event.preventDefault();
    if (!orderTitle.trim() || peerId === activeUserId) return;
    setPlacingOrder(true);
    try {
      await mutateCommunity({
        action: "createOrder",
        buyerId: activeUserId,
        musicianId: peerId,
        title: orderTitle.trim(),
        description: orderDesc.trim(),
        priceBdt: Number(orderPrice.replace(/[^\d]/g, "")) || peerDefaultPrice,
        deliveryDays: Number(orderDays.replace(/[^\d]/g, "")) || 4,
        bkashTrxId: orderBkashTrxId.trim() || undefined,
        attachmentUrl: orderAttachment?.url,
        attachmentKind: orderAttachment?.kind,
        attachmentName: orderAttachment?.name,
      });
      setOrderTitle("");
      setOrderDesc("");
      setOrderBkashTrxId("");
      setOrderAttachment(null);
      setShowOrderModal(false);
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleDeliverOrder(event: FormEvent, orderId: string) {
    event.preventDefault();
    setSubmittingDelivery(true);
    try {
      await mutateCommunity({
        action: "markOrderDelivered",
        orderId,
        musicianId: activeUserId,
        deliveryNote: deliveryNote.trim() || undefined,
        deliveryAttachmentUrl: deliveryAttachment?.url,
        deliveryAttachmentKind: deliveryAttachment?.kind,
        deliveryAttachmentName: deliveryAttachment?.name,
      });
      setDeliveringOrderId(null);
      setDeliveryNote("");
      setDeliveryAttachment(null);
    } finally {
      setSubmittingDelivery(false);
    }
  }

  async function handleCompleteOrder(event: FormEvent, orderId: string) {
    event.preventDefault();
    setSubmittingReview(true);
    try {
      await mutateCommunity({
        action: "completeOrderAndReview",
        orderId,
        buyerId: activeUserId,
        rating: reviewRating,
        comment:
          reviewComment.trim() ||
          (locale === "bn"
            ? "চমৎকার কাজ এবং সময়মতো ডেলিভারি!"
            : "Great performance and timely delivery!"),
      });
      setReviewingOrderId(null);
      setReviewComment("");
      setReviewRating(5);
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <section
      className={
        expanded
          ? "w-[96vw] max-w-[920px] overflow-hidden rounded-t-3xl border border-primary/40 bg-[#151515] shadow-2xl sm:w-[820px] lg:w-[920px]"
          : "w-[95vw] max-w-[680px] overflow-hidden rounded-t-3xl border border-white/15 bg-[#151515] shadow-2xl sm:w-[620px] lg:w-[680px]"
      }
      aria-label={peerName}
    >
      {/* Top Facebook-style Gradient Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#2c1509] via-[#1f1a18] to-[#132623] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ff5500] via-[#ff7722] to-[#ffaa33] text-base font-bold text-[#1a0900] shadow-sm">
            {peerName.slice(0, 1)}
            <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-black bg-emerald-400" />
          </span>
          <div className="min-w-0">
            <Link
              href={`/u/${peerId}`}
              className="block truncate text-base font-semibold text-foreground hover:text-primary"
            >
              {peerName}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {peerRole} · {peerCity}
              {peerPhone ? ` · 📞 ${peerPhone}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowOrderModal((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3.5 py-1.5 text-xs font-bold text-[#1a0900] shadow-md hover:brightness-110"
          >
            <ShoppingBag className="size-3.5" />
            <span>{locale === "bn" ? "অর্ডার দাও" : "Place Order"}</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label={expanded ? "Restore size" : "Expand chat"}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => toggleMinimizeChatWindow(peerId)}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Minimize"
          >
            <Minus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => closeChatWindow(peerId)}
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
          {/* Fiverr-style Place Order Drawer with bKash Payment & Audio/Video Attachment */}
          {showOrderModal ? (
            <form
              onSubmit={(e) => void handlePlaceOrder(e)}
              className="space-y-2.5 border-b border-primary/40 bg-gradient-to-b from-[#231710] to-[#181818] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  <ShieldCheck className="size-4" />
                  {locale === "bn"
                    ? `${peerName}-কে কাজের অর্ডার দাও (বিকাশ পেমেন্ট ও ফাইল সংযুক্তি)`
                    : `Place a Trusted Order with ${peerName}`}
                </span>
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {locale === "bn" ? "বাতিল" : "Cancel"}
                </button>
              </div>

              {/* Receiver's bKash & Phone Payment Box */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#e2136e]/40 bg-[#e2136e]/10 px-3.5 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#ff66a8]">
                    <Wallet className="size-3.5" />
                    {peerBkashNumber
                      ? `bKash: ${peerBkashNumber}`
                      : locale === "bn"
                        ? "বিকাশ নম্বর দেওয়া হয়নি (চ্যাটে জেনে নাও)"
                        : "bKash number not set (ask in chat)"}
                  </span>
                  {peerPhone ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Phone className="size-3" />
                      {peerPhone}
                    </span>
                  ) : null}
                </div>
                {peerBkashNumber ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(peerBkashNumber);
                      setCopiedBkash(true);
                      setTimeout(() => setCopiedBkash(false), 1800);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[#e2136e]/50 bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-[#ff88bc] hover:bg-black"
                  >
                    {copiedBkash ? <Check className="size-3" /> : <Copy className="size-3" />}
                    <span>{copiedBkash ? "Copied" : "Copy bKash"}</span>
                  </button>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_110px_90px]">
                <input
                  required
                  value={orderTitle}
                  onChange={(e) => setOrderTitle(e.target.value)}
                  placeholder={
                    locale === "bn"
                      ? "কাজের শিরোনাম (যেমন: অ্যাকুস্টিক গিটার সোলো)"
                      : "Order title (e.g. Acoustic guitar chorus & solo)"
                  }
                  className="h-9 rounded-full border border-white/15 bg-black px-3.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <input
                  required
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                  inputMode="numeric"
                  placeholder="৳ BDT"
                  aria-label="Price in BDT"
                  className="h-9 rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                />
                <input
                  required
                  value={orderDays}
                  onChange={(e) => setOrderDays(e.target.value)}
                  inputMode="numeric"
                  placeholder="Days"
                  aria-label="Delivery days"
                  className="h-9 rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_210px]">
                <input
                  value={orderDesc}
                  onChange={(e) => setOrderDesc(e.target.value)}
                  placeholder={
                    locale === "bn"
                      ? "কী (Key), টেম্পো (BPM), এবং কাজের বিবরণ লিখো…"
                      : "Key, BPM, and requirements for this session…"
                  }
                  className="h-9 min-w-0 rounded-full border border-white/15 bg-black px-3.5 text-xs text-foreground outline-none"
                />
                <input
                  value={orderBkashTrxId}
                  onChange={(e) => setOrderBkashTrxId(e.target.value)}
                  placeholder={
                    locale === "bn"
                      ? "বিকাশ TrxID (ঐচ্ছিক)"
                      : "bKash TrxID (optional)"
                  }
                  className="h-9 rounded-full border border-[#e2136e]/40 bg-black px-3.5 text-xs text-foreground outline-none"
                />
              </div>

              {/* Order Reference Audio/Video Attachment + Confirm Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-black px-3.5 text-xs font-medium text-foreground hover:border-primary">
                    <Upload className="size-3.5 text-primary" />
                    <span>
                      {uploadingOrderFile
                        ? locale === "bn"
                          ? "আপলোড হচ্ছে…"
                          : "Uploading…"
                        : locale === "bn"
                          ? "অডিও / ভিডিও সংযুক্ত করো"
                          : "Attach Audio / Video"}
                    </span>
                    <input
                      type="file"
                      accept="audio/*,video/*"
                      className="sr-only"
                      onChange={(e) => void handleUploadAttachment(e.target.files?.[0], "order")}
                    />
                  </label>

                  {orderAttachment ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs text-foreground">
                      <span className="max-w-40 truncate">{orderAttachment.name}</span>
                      <button
                        type="button"
                        onClick={() => setOrderAttachment(null)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Remove attachment"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={placingOrder || uploadingOrderFile || !orderTitle.trim()}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 text-xs font-bold text-[#1a0900] shadow-md disabled:opacity-40"
                >
                  <ShoppingBag className="size-3.5" />
                  <span>
                    {placingOrder
                      ? "…"
                      : locale === "bn"
                        ? "অর্ডার নিশ্চিত করো"
                        : "Confirm Order"}
                  </span>
                </button>
              </div>
            </form>
          ) : null}

          {/* Active & Completed Fiverr-Style Orders Banner inside Chat */}
          {pairOrders.length > 0 ? (
            <div className="max-h-56 space-y-2 overflow-y-auto border-b border-white/10 bg-[#1a1614] px-4 py-3">
              {pairOrders.map((ord) => {
                const isBuyer = ord.buyerId === activeUserId;
                const isMusician = ord.musicianId === activeUserId;
                const existingReview = (db.reviews ?? []).find((r) => r.orderId === ord.id);

                return (
                  <div
                    key={ord.id}
                    className="rounded-2xl border border-primary/35 bg-black/70 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                          {ord.status === "completed"
                            ? locale === "bn"
                              ? "✓ সম্পন্ন"
                              : "✓ Completed"
                            : ord.status === "delivered"
                              ? locale === "bn"
                                ? "📦 ডেলিভারি দেওয়া হয়েছে"
                                : "📦 Delivered"
                              : locale === "bn"
                                ? "⏳ চলমান অর্ডার"
                                : "⏳ In Progress"}
                        </span>
                        <strong className="text-foreground">{ord.title}</strong>
                        <span className="text-muted-foreground">
                          · ৳{formatNumber(ord.priceBdt, locale)} · {ord.deliveryDays}d
                        </span>
                        {ord.bkashTrxId ? (
                          <span className="rounded-full border border-[#e2136e]/40 bg-[#e2136e]/15 px-2 py-0.5 text-[10px] font-semibold text-[#ff77b4]">
                            bKash TrxID: {ord.bkashTrxId}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {isMusician && ord.status === "active" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDeliveringOrderId(deliveringOrderId === ord.id ? null : ord.id)
                            }
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                          >
                            <PackageCheck className="size-3.5" />
                            <span>
                              {locale === "bn" ? "ফাইল ও ডেলিভারি দাও" : "Deliver File / Work"}
                            </span>
                          </button>
                        ) : null}

                        {/* ONLY the Buyer who placed the order can mark it Completed & Leave Review */}
                        {isBuyer && ord.status !== "completed" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setReviewingOrderId(reviewingOrderId === ord.id ? null : ord.id)
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3 py-1 text-[11px] font-bold text-[#1a0900] shadow-sm"
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span>
                              {locale === "bn"
                                ? "অর্ডার সম্পন্ন ও রিভিউ দাও"
                                : "Mark Completed & Review"}
                            </span>
                          </button>
                        ) : null}

                        {!isBuyer && ord.status !== "completed" ? (
                          <span className="text-[11px] text-muted-foreground">
                            {locale === "bn"
                              ? "ক্রেতা সন্তুষ্ট হলে অর্ডার সম্পন্ন করবে"
                              : "Buyer marks order completed when satisfied"}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {ord.attachmentUrl ? (
                      <MediaAttachmentPreview
                        url={ord.attachmentUrl}
                        kind={ord.attachmentKind}
                        name={ord.attachmentName ?? "Order reference file"}
                        onOpenInChatPlayer={(item) => setActivePlayer(item)}
                      />
                    ) : null}

                    {ord.deliveryAttachmentUrl ? (
                      <MediaAttachmentPreview
                        url={ord.deliveryAttachmentUrl}
                        kind={ord.deliveryAttachmentKind}
                        name={ord.deliveryAttachmentName ?? "Delivered session file"}
                        onOpenInChatPlayer={(item) => setActivePlayer(item)}
                      />
                    ) : null}

                    {/* Musician Deliver Form with Audio/Video Upload */}
                    {isMusician && deliveringOrderId === ord.id && ord.status === "active" ? (
                      <form
                        onSubmit={(e) => void handleDeliverOrder(e, ord.id)}
                        className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-black px-3 text-xs font-medium text-foreground hover:border-primary">
                            <Upload className="size-3.5 text-primary" />
                            <span>
                              {uploadingDeliveryFile
                                ? "Uploading…"
                                : locale === "bn"
                                  ? "ডেলিভারি অডিও / ভিডিও সংযুক্ত করো"
                                  : "Attach Delivered Audio / Video"}
                            </span>
                            <input
                              type="file"
                              accept="audio/*,video/*"
                              className="sr-only"
                              onChange={(e) =>
                                void handleUploadAttachment(e.target.files?.[0], "delivery")
                              }
                            />
                          </label>
                          {deliveryAttachment ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] text-emerald-300">
                              <span className="max-w-36 truncate">{deliveryAttachment.name}</span>
                              <button type="button" onClick={() => setDeliveryAttachment(null)}>
                                <X className="size-3" />
                              </button>
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            value={deliveryNote}
                            onChange={(e) => setDeliveryNote(e.target.value)}
                            placeholder={
                              locale === "bn"
                                ? "ডেলিভারি নোট লিখো…"
                                : "Delivery note for the buyer…"
                            }
                            className="h-8 min-w-0 flex-1 rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                          />
                          <button
                            type="submit"
                            disabled={submittingDelivery || uploadingDeliveryFile}
                            className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-black"
                          >
                            {submittingDelivery
                              ? "…"
                              : locale === "bn"
                                ? "ডেলিভারি পাঠাও"
                                : "Send Delivery"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {existingReview ? (
                      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2 text-[11px] text-amber-300">
                        <span>{"★".repeat(existingReview.rating)}</span>
                        <span className="text-foreground">&ldquo;{existingReview.comment}&rdquo;</span>
                      </div>
                    ) : null}

                    {isBuyer && reviewingOrderId === ord.id ? (
                      <form
                        onSubmit={(e) => void handleCompleteOrder(e, ord.id)}
                        className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {locale === "bn"
                              ? "কাজের রেটিং ও রিভিউ দাও:"
                              : "Rate & review this musician's work:"}
                          </span>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className="p-0.5 text-primary"
                                aria-label={`${star} stars`}
                              >
                                <Star
                                  className="size-4"
                                  fill={star <= reviewRating ? "currentColor" : "none"}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            required
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder={
                              locale === "bn"
                                ? "কাজটি কেমন লেগেছে লিখো (প্রোফাইলে দেখাবে)…"
                                : "Write your review (will appear on their profile)…"
                            }
                            className="h-8 min-w-0 flex-1 rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                          />
                          <button
                            type="submit"
                            disabled={submittingReview}
                            className="rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3.5 py-1.5 text-xs font-bold text-[#1a0900]"
                          >
                            {submittingReview
                              ? "…"
                              : locale === "bn"
                                ? "সম্পন্ন ও রিভিউ পোস্ট করো"
                                : "Complete & Post Review"}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Docked Inside-Chatbox Audio/Video Player when user clicks any mix/attachment */}
          {activePlayer ? (
            <ChatboxDockedPlayer
              item={activePlayer}
              onClose={() => setActivePlayer(null)}
            />
          ) : null}

          <div
            ref={threadContainerRef}
            className={
              expanded
                ? "h-[60vh] max-h-[700px] min-h-[420px] space-y-4 overflow-y-auto p-6"
                : "h-[46vh] max-h-[560px] min-h-[360px] space-y-3.5 overflow-y-auto p-5"
            }
          >
            {threadMessages.length === 0 ? (
              <p className="text-base leading-7 text-muted-foreground">{t("emptyChat")}</p>
            ) : (
              threadMessages.map((msg) => {
                const mine = msg.fromId === activeUserId;
                const media = extractMediaFromMessage(msg);
                return (
                  <div
                    key={msg.id}
                    className={
                      mine
                        ? "ml-12 rounded-2xl rounded-br-sm bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 py-3 text-base font-medium text-[#1a0900] shadow-sm"
                        : "mr-12 rounded-2xl rounded-bl-sm border border-white/10 bg-[#222222] px-4 py-3 text-base text-foreground"
                    }
                  >
                    <div>{media.cleanText}</div>
                    {media.url ? (
                      <MediaAttachmentPreview
                        url={media.url}
                        kind={media.kind}
                        name={media.name}
                        dark={!mine}
                        onOpenInChatPlayer={(item) => setActivePlayer(item)}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => void handleSend(e)}
            className="border-t border-white/10 bg-[#101010] p-3.5"
          >
            {chatAttachment ? (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs">
                <span className="truncate font-medium text-foreground">
                  📎 {chatAttachment.name} ({chatAttachment.kind})
                </span>
                <button
                  type="button"
                  onClick={() => setChatAttachment(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Remove attachment"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <label
                className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-[#1b1b1b] px-3.5 text-xs font-medium text-foreground hover:border-primary"
                title={
                  locale === "bn"
                    ? "অডিও বা ভিডিও ফাইল সংযুক্ত করো"
                    : "Attach audio or video file"
                }
              >
                <Paperclip className="size-4 text-primary" />
                <span className="hidden sm:inline">
                  {uploadingChatFile
                    ? "…"
                    : locale === "bn"
                      ? "অডিও/ভিডিও"
                      : "Audio/Video"}
                </span>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  className="sr-only"
                  onChange={(e) => void handleUploadAttachment(e.target.files?.[0], "chat")}
                />
              </label>

              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("chatPlaceholder")}
                aria-label={t("messageLabel")}
                className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-[#1b1b1b] px-4 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="submit"
                disabled={(!text.trim() && !chatAttachment) || uploadingChatFile}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 text-sm font-semibold text-[#1a0900] shadow-md disabled:opacity-40"
              >
                <Send className="size-4" />
                <span>{t("send")}</span>
              </button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
