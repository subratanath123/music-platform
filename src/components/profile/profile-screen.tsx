"use client";

import { FormEvent, PointerEvent, useRef, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Heart,
  Lock,
  MessageCircle,
  MoveVertical,
  Music,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trash2,
  Upload,
  Video,
  Wallet,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AudioPlayer } from "@/components/media/audio-player";
import { MediaAttachmentPreview } from "@/components/media/media-attachment-preview";
import { StarRating } from "@/components/media/star-rating";
import { YoutubePlayer } from "@/components/media/youtube-player";
import { DefaultCoverArt } from "@/components/profile/default-cover-art";
import { UserAvatar } from "@/components/profile/user-avatar";
import { Button } from "@/components/ui/button";
import { pick, type Role } from "@/data/catalog";
import { Link, useRouter } from "@/i18n/navigation";
import {
  mutateCommunity,
  openChatWindow,
  uploadAudioFile,
  useCommunityStore,
  useCurrentUser,
} from "@/lib/community-store";
import { formatCount, formatNumber, formatRating } from "@/lib/format";
import type { MediaAttachmentKind, PostCategory } from "@/lib/db-types";
import { youtubeIdFromUrl } from "@/lib/youtube";

export function ProfileScreen({ musicianId }: { musicianId: string }) {
  const t = useTranslations("Profile");
  const home = useTranslations("Home");
  const watch = useTranslations("Watch");
  const locale = useLocale();
  const router = useRouter();
  const { db, hydrated } = useCommunityStore();
  const currentUser = useCurrentUser();
  const activeUserId = currentUser?.id ?? null;

  const [addKind, setAddKind] = useState<"youtube" | "audio">("youtube");
  const [addTitle, setAddTitle] = useState("");
  const [addYoutube, setAddYoutube] = useState("");
  const [addAudioUrl, setAddAudioUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [repositioningCover, setRepositioningCover] = useState(false);
  const [draftCoverPosY, setDraftCoverPosY] = useState<number>(50);
  const [savingCoverPos, setSavingCoverPos] = useState(false);
  const dragStartRef = useRef<{ startY: number; startPos: number } | null>(null);
  const [addError, setAddError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const [orderTitle, setOrderTitle] = useState("");
  const [orderDesc, setOrderDesc] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderDays, setOrderDays] = useState("4");
  const [orderBkashTrxId, setOrderBkashTrxId] = useState("");
  const [orderAttachment, setOrderAttachment] = useState<{
    url: string;
    name: string;
    kind: MediaAttachmentKind;
  } | null>(null);
  const [uploadingOrderFile, setUploadingOrderFile] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [copiedBkash, setCopiedBkash] = useState(false);

  const [deliveringOrderId, setDeliveringOrderId] = useState<string | null>(null);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryAttachment, setDeliveryAttachment] = useState<{
    url: string;
    name: string;
    kind: MediaAttachmentKind;
  } | null>(null);
  const [uploadingDeliveryFile, setUploadingDeliveryFile] = useState(false);
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  const [editingContacts, setEditingContacts] = useState(false);
  const [draftPhone, setDraftPhone] = useState("");
  const [draftBkash, setDraftBkash] = useState("");
  const [savingContacts, setSavingContacts] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostCategory, setEditPostCategory] = useState<PostCategory>("offering");
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostText, setEditPostText] = useState("");
  const [editPostPrice, setEditPostPrice] = useState("");
  const [savingPostEdit, setSavingPostEdit] = useState(false);

  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const profile = db.users.find((u) => u.id === musicianId);

  if (!hydrated && !profile) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5">
        <div className="h-56 animate-pulse rounded-3xl border border-white/10 bg-[#161616]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-5">
        <h1 className="font-display text-3xl">{t("missingTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("missingBody")}</p>
        <Link href="/" className="mt-4 inline-flex text-sm underline decoration-primary underline-offset-4">
          {t("back")}
        </Link>
      </div>
    );
  }

  const name = pick(locale, profile.nameBn, profile.name);
  const role = home(`roles.${profile.roles[0] as Role}`);
  const collectionItems = db.collections.filter((c) => c.musicianId === profile.id);
  const musicianPosts = db.posts.filter((p) => p.musicianId === profile.id);
  const musicianReviews = (db.reviews ?? []).filter((r) => r.musicianId === profile.id);
  const myOrdersWithMusician = (db.orders ?? []).filter(
    (o) =>
      (o.buyerId === activeUserId && o.musicianId === profile.id) ||
      (o.musicianId === activeUserId && o.buyerId === profile.id) ||
      (profile.id === activeUserId && o.musicianId === profile.id),
  );
  const myFollows = activeUserId ? (db.follows[activeUserId] ?? []) : [];
  const following = myFollows.includes(profile.id);
  const yourRating = activeUserId ? (db.ratings[activeUserId]?.[profile.id] ?? 0) : 0;

  const isOwner = profile.id === activeUserId;
  const savedCoverPosY = profile.coverPositionY ?? 50;
  const effectiveCoverPosY = repositioningCover ? draftCoverPosY : savedCoverPosY;

  if (profile.isPrivate && !isOwner) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-5">
        <div className="rounded-3xl border border-white/10 bg-[#18191a] p-8 text-center shadow-xl">
          <div className="mx-auto inline-flex">
            <UserAvatar
              src={profile.avatarUrl}
              name={name}
              className="size-24"
              textClassName="text-2xl"
            />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">{name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {role} · {pick(locale, profile.cityBn, profile.city)}
          </p>
          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2 text-xs font-semibold text-muted-foreground">
            <Lock className="size-4 text-primary" />
            <span>
              {locale === "bn"
                ? "এই প্রোফাইলটি প্রাইভেট করা আছে"
                : "This musician's profile is set to Private"}
            </span>
          </div>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
            >
              {t("back")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function startRepositioningCover() {
    setDraftCoverPosY(savedCoverPosY);
    setRepositioningCover(true);
  }

  function handleCoverPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!repositioningCover) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      startY: event.clientY,
      startPos: draftCoverPosY,
    };
  }

  function handleCoverPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!repositioningCover || !dragStartRef.current) return;
    const deltaY = event.clientY - dragStartRef.current.startY;
    // Dragging down moves focal point up (smaller %), dragging up moves focal point down (larger %)
    const nextPos = Math.max(
      0,
      Math.min(100, Math.round(dragStartRef.current.startPos - deltaY * 0.45)),
    );
    setDraftCoverPosY(nextPos);
  }

  function handleCoverPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!repositioningCover) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStartRef.current = null;
  }

  async function saveCoverPosition() {
    if (!isOwner) return;
    setSavingCoverPos(true);
    try {
      await mutateCommunity({
        action: "updateProfilePhotos",
        userId: profile!.id,
        coverPositionY: draftCoverPosY,
      });
      setRepositioningCover(false);
    } finally {
      setSavingCoverPos(false);
    }
  }

  async function handleCoverUpload(file: File | undefined) {
    if (!file || !isOwner) return;
    setUploadingCover(true);
    try {
      const up = await uploadAudioFile(file);
      await mutateCommunity({
        action: "updateProfilePhotos",
        userId: profile!.id,
        coverUrl: up.url,
        coverPositionY: 50,
      });
      setDraftCoverPosY(50);
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleAvatarUpload(file: File | undefined) {
    if (!file || !isOwner) return;
    setUploadingAvatar(true);
    try {
      const up = await uploadAudioFile(file);
      await mutateCommunity({
        action: "updateProfilePhotos",
        userId: profile!.id,
        avatarUrl: up.url,
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAddShowcase(event: FormEvent) {
    event.preventDefault();
    if (!addTitle.trim()) {
      setAddError(t("titleNeeded"));
      return;
    }
    if (addKind === "youtube") {
      const ytId = youtubeIdFromUrl(addYoutube);
      if (!ytId) {
        setAddError(t("badYoutubeLink"));
        return;
      }
      setAddError("");
      await mutateCommunity({
        action: "addCollectionItem",
        musicianId: profile!.id,
        kind: "youtube",
        title: addTitle.trim(),
        youtubeId: ytId,
      });
    } else {
      if (!addAudioUrl.trim()) {
        setAddError(t("audioNeeded"));
        return;
      }
      setAddError("");
      await mutateCommunity({
        action: "addCollectionItem",
        musicianId: profile!.id,
        kind: "audio",
        title: addTitle.trim(),
        audioSrc: addAudioUrl.trim(),
      });
    }
    setAddTitle("");
    setAddYoutube("");
    setAddAudioUrl("");
    setShowAddForm(false);
  }

  return (
    <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px] sm:px-5">
      <div className="min-w-0">
        {/* Cover Photo Banner + Profile Photo Header */}
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#1d1917] to-[#161616] shadow-xl">
          <div
            onPointerDown={handleCoverPointerDown}
            onPointerMove={handleCoverPointerMove}
            onPointerUp={handleCoverPointerUp}
            className={
              repositioningCover
                ? "relative h-56 w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing sm:h-72"
                : "relative h-56 w-full overflow-hidden sm:h-72"
            }
          >
            {profile.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.coverUrl}
                alt={`${name} cover`}
                className="h-full w-full object-cover select-none"
                style={{ objectPosition: `center ${effectiveCoverPosY}%` }}
                draggable={false}
              />
            ) : (
              <DefaultCoverArt
                seed={profile.id + profile.name}
                role={profile.roles[0]}
                positionY={effectiveCoverPosY}
              />
            )}

            {repositioningCover ? (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/50 bg-black/80 px-4 py-2.5 text-xs text-foreground backdrop-blur-md"
              >
                <div className="flex flex-1 items-center gap-3">
                  <MoveVertical className="size-4 shrink-0 text-primary" />
                  <span className="font-medium">{t("dragOrSlideCover")}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={draftCoverPosY}
                    aria-label={t("adjustCoverPos")}
                    onChange={(e) => setDraftCoverPosY(Number(e.target.value))}
                    className="h-2 w-28 cursor-pointer accent-primary sm:w-40"
                  />
                  <span className="w-9 text-right text-[11px] text-muted-foreground">
                    {draftCoverPosY}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRepositioningCover(false)}
                    className="rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {home("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={savingCoverPos}
                    onClick={() => void saveCoverPosition()}
                    className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3.5 py-1.5 text-xs font-semibold text-[#1a0900] shadow-md"
                  >
                    <Check className="size-3.5" />
                    <span>{t("saveCoverPos")}</span>
                  </button>
                </div>
              </div>
            ) : null}

            {isOwner && !repositioningCover ? (
              <div className="absolute right-4 bottom-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={startRepositioningCover}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3.5 py-2 text-xs font-semibold text-foreground backdrop-blur-md transition-transform hover:scale-105 hover:border-primary"
                >
                  <MoveVertical className="size-3.5 text-primary" />
                  <span>{t("adjustCoverPos")}</span>
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-black/75 px-4 py-2 text-xs font-semibold text-foreground backdrop-blur-md transition-transform hover:scale-105 hover:border-primary">
                  <Camera className="size-4 text-primary" />
                  <span>{uploadingCover ? t("uploading") : t("updateCover")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void handleCoverUpload(e.target.files?.[0])}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="relative z-10 px-5 pt-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative z-10 inline-block shrink-0">
                  <UserAvatar
                    src={profile.avatarUrl}
                    name={name}
                    className="size-24 sm:size-28"
                    textClassName="text-3xl"
                  />

                  {isOwner ? (
                    <label
                      title={t("updateAvatar")}
                      className="absolute right-0 bottom-0 grid size-9 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/85 text-foreground shadow-md hover:border-primary"
                    >
                      <Camera className="size-4 text-primary" />
                      <span className="sr-only">
                        {uploadingAvatar ? t("uploading") : t("updateAvatar")}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => void handleAvatarUpload(e.target.files?.[0])}
                      />
                    </label>
                  ) : null}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    {role} · {pick(locale, profile.cityBn, profile.city)}
                  </p>
                  <h1 className="mt-0.5 font-display text-4xl">{name}</h1>
                </div>
              </div>

              {profile.id !== activeUserId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={following ? "secondary" : "default"}
                    className="rounded-full"
                    aria-pressed={following}
                    onClick={() => {
                      if (!activeUserId) {
                        router.push("/register");
                        return;
                      }
                      void mutateCommunity({
                        action: "toggleFollow",
                        followerId: activeUserId,
                        musicianId: profile.id,
                      });
                    }}
                  >
                    {following ? watch("following") : watch("follow")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      if (!activeUserId) {
                        router.push("/register");
                        return;
                      }
                      openChatWindow(profile.id);
                    }}
                  >
                    <MessageCircle className="size-4 text-primary" />
                    {t("openChatWindow")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Profile visibility"
                    className="inline-flex items-center rounded-full border border-white/15 bg-black/70 p-1 text-xs"
                  >
                    <button
                      type="button"
                      aria-pressed={!profile.isPrivate}
                      onClick={() =>
                        void mutateCommunity({
                          action: "updateProfileVisibility",
                          isPrivate: false,
                        })
                      }
                      className={
                        !profile.isPrivate
                          ? "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3.5 py-1.5 font-semibold text-[#1a0900]"
                          : "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
                      }
                    >
                      <Globe className="size-3.5" />
                      <span>{locale === "bn" ? "পাবলিক" : "Public"}</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={Boolean(profile.isPrivate)}
                      onClick={() =>
                        void mutateCommunity({
                          action: "updateProfileVisibility",
                          isPrivate: true,
                        })
                      }
                      className={
                        profile.isPrivate
                          ? "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3.5 py-1.5 font-semibold text-[#1a0900]"
                          : "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-muted-foreground hover:text-foreground"
                      }
                    >
                      <Lock className="size-3.5" />
                      <span>{locale === "bn" ? "প্রাইভেট" : "Private"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3">
              <p className="max-w-2xl text-sm leading-6">
                {pick(locale, profile.bioBn, profile.bio)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatRating(profile.rating, locale)} ·{" "}
                {formatNumber(profile.ratingCount, locale)} {watch("ratings")} ·{" "}
                {formatCount(profile.followers, locale)} {watch("followers")}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{watch("yourRating")}</p>
            <StarRating
              value={yourRating}
              onChange={(value) => {
                if (!activeUserId) {
                  router.push("/register");
                  return;
                }
                void mutateCommunity({
                  action: "rateMusician",
                  raterId: activeUserId,
                  musicianId: profile.id,
                  rating: value,
                });
              }}
              label={watch("yourRating")}
            />
          </div>
        </div>

        {/* Showcase Collection Grid (YouTube Videos + Audio Uploads) */}
        <section className="mt-6" aria-labelledby="collection-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="collection-heading" className="font-display text-2xl">
                {t("collectionTitle")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("collectionSub")}</p>
            </div>
            {isOwner ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => setShowAddForm((v) => !v)}
              >
                <Plus className="size-4" />
                {t("addToCollection")}
              </Button>
            ) : null}
          </div>

          {isOwner && showAddForm ? (
            <form
              onSubmit={(e) => void handleAddShowcase(e)}
              className="mt-4 rounded-3xl border border-primary/40 bg-gradient-to-b from-[#1e1714] to-[#161616] p-5"
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddKind("youtube")}
                  className={
                    addKind === "youtube"
                      ? "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 py-1.5 text-xs font-semibold text-[#1a0900]"
                      : "inline-flex items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-xs text-muted-foreground"
                  }
                >
                  <Video className="size-3.5" />
                  {t("youtubeTab")}
                </button>
                <button
                  type="button"
                  onClick={() => setAddKind("audio")}
                  className={
                    addKind === "audio"
                      ? "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 py-1.5 text-xs font-semibold text-[#1a0900]"
                      : "inline-flex items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-xs text-muted-foreground"
                  }
                >
                  <Music className="size-3.5" />
                  {t("audioTab")}
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-muted-foreground">
                  {t("itemTitleLabel")}
                  <input
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder="Live performance / Studio take"
                    className="mt-1 h-9 w-full border border-white/10 bg-black px-3 text-sm text-foreground"
                  />
                </label>

                {addKind === "youtube" ? (
                  <label className="block text-xs text-muted-foreground">
                    {t("youtubeUrlLabel")}
                    <input
                      value={addYoutube}
                      onChange={(e) => setAddYoutube(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v="
                      className="mt-1 h-9 w-full border border-white/10 bg-black px-3 text-sm text-foreground"
                    />
                  </label>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    <span className="block">{t("audioFileLabel")}</span>
                    <div className="mt-1 flex items-center gap-2">
                      <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 border border-white/10 bg-black px-2.5 text-xs text-foreground hover:border-primary">
                        <Upload className="size-3.5 text-primary" />
                        {uploading ? t("uploading") : t("uploadBtn")}
                        <input
                          type="file"
                          accept="audio/*"
                          className="sr-only"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploading(true);
                            try {
                              const up = await uploadAudioFile(file);
                              setAddAudioUrl(up.url);
                              if (!addTitle.trim()) setAddTitle(up.name);
                            } finally {
                              setUploading(false);
                            }
                          }}
                        />
                      </label>
                      <input
                        value={addAudioUrl}
                        onChange={(e) => setAddAudioUrl(e.target.value)}
                        placeholder="/media/farhan-guitar.wav"
                        className="h-9 min-w-0 flex-1 border border-white/10 bg-black px-2.5 text-xs text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {addError ? <p className="mt-2 text-xs text-destructive">{addError}</p> : null}
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAddForm(false)}
                >
                  {home("cancel")}
                </Button>
                <Button type="submit" size="sm">
                  {t("saveCollectionItem")}
                </Button>
              </div>
            </form>
          ) : null}

          {collectionItems.length === 0 ? (
            <p className="mt-4 border border-white/10 bg-card p-4 text-sm text-muted-foreground">
              {t("noVideo")}
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {collectionItems.map((item) => {
                const itemTitle = pick(locale, item.titleBn, item.title);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-3xl border border-white/10 bg-gradient-to-b from-[#1d1917] to-[#161616] p-4 shadow-md"
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          {item.kind === "youtube" ? (
                            <Video className="size-3.5" />
                          ) : (
                            <Music className="size-3.5" />
                          )}
                          {item.kind === "youtube" ? "YouTube" : "Audio"}
                        </span>
                        <span>{item.duration}</span>
                      </div>
                      <h3 className="mb-2 text-sm font-semibold">{itemTitle}</h3>
                      {item.kind === "youtube" && item.youtubeId ? (
                        <YoutubePlayer videoId={item.youtubeId} title={itemTitle} />
                      ) : null}
                      {item.kind === "audio" && item.audioSrc ? (
                        <AudioPlayer src={item.audioSrc} title={itemTitle} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Musician's Recent Posts & Offerings */}
        {musicianPosts.length > 0 ? (
          <section className="mt-6" aria-labelledby="musician-posts-heading">
            <h2 id="musician-posts-heading" className="font-display text-2xl">
              {t("recentPostsTitle")}
            </h2>
            <div className="mt-3 space-y-3">
              {musicianPosts.map((post) => {
                const loved = activeUserId ? post.lovedBy.includes(activeUserId) : false;
                const isEditingThis = isOwner && editingPostId === post.id;
                return (
                  <div
                    key={post.id}
                    className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#1d1917] to-[#161616] p-5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-primary">
                      <span>{home(`categories.${post.category}`)}</span>
                      <div className="flex items-center gap-2">
                        {post.priceBdt ? <span>৳{formatNumber(post.priceBdt, locale)}</span> : null}
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingPostId(null);
                              } else {
                                setEditPostCategory(post.category);
                                setEditPostTitle(post.title);
                                setEditPostText(post.text);
                                setEditPostPrice(post.priceBdt ? String(post.priceBdt) : "");
                                setEditingPostId(post.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary"
                          >
                            <Pencil className="size-3" />
                            <span>{locale === "bn" ? "সম্পাদনা" : "Edit"}</span>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isEditingThis ? (
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!editPostTitle.trim() || !editPostText.trim()) return;
                          const priceNum = Number(editPostPrice.replace(/[^\d]/g, ""));
                          setSavingPostEdit(true);
                          try {
                            await mutateCommunity({
                              action: "updatePost",
                              postId: post.id,
                              category: editPostCategory,
                              roleTag: post.roleTag,
                              title: editPostTitle.trim(),
                              text: editPostText.trim(),
                              priceBdt: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
                              youtubeId: post.youtubeId,
                              audioSrc: post.audioSrc,
                            });
                            setEditingPostId(null);
                          } finally {
                            setSavingPostEdit(false);
                          }
                        }}
                        className="mt-3 space-y-2.5 rounded-2xl border border-primary/40 bg-black/50 p-3.5"
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {(["offering", "collab", "work"] as PostCategory[]).map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setEditPostCategory(cat)}
                              className={
                                editPostCategory === cat
                                  ? "rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3 py-1 text-xs font-semibold text-[#1a0900]"
                                  : "rounded-full bg-[#18191a] px-3 py-1 text-xs text-muted-foreground"
                              }
                            >
                              {home(`categories.${cat}`)}
                            </button>
                          ))}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                          <input
                            required
                            value={editPostTitle}
                            onChange={(e) => setEditPostTitle(e.target.value)}
                            className="h-9 rounded-xl border border-white/10 bg-black px-3 text-sm outline-none"
                          />
                          <input
                            value={editPostPrice}
                            onChange={(e) => setEditPostPrice(e.target.value)}
                            inputMode="numeric"
                            placeholder="৳ BDT"
                            className="h-9 rounded-xl border border-white/10 bg-black px-3 text-sm outline-none"
                          />
                        </div>
                        <textarea
                          required
                          rows={3}
                          value={editPostText}
                          onChange={(e) => setEditPostText(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black p-3 text-sm outline-none"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void mutateCommunity({
                                action: "deletePost",
                                postId: post.id,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                            <span>{locale === "bn" ? "পোস্ট মুছো" : "Delete"}</span>
                          </button>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingPostId(null)}
                            >
                              {home("cancel")}
                            </Button>
                            <Button type="submit" size="sm" disabled={savingPostEdit}>
                              {savingPostEdit
                                ? "…"
                                : locale === "bn"
                                  ? "সেভ করো"
                                  : "Save Changes"}
                            </Button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h3 className="mt-1 font-semibold">
                          {pick(locale, post.titleBn, post.title)}
                        </h3>
                        <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                          {pick(locale, post.textBn, post.text)}
                        </p>
                      </>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeUserId) {
                            router.push("/register");
                            return;
                          }
                          void mutateCommunity({
                            action: "toggleLove",
                            postId: post.id,
                            userId: activeUserId,
                          });
                        }}
                        className={
                          loved
                            ? "inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3 py-1 text-xs font-semibold text-[#1a0900]"
                            : "inline-flex items-center gap-1 rounded-full border border-white/10 bg-black px-3 py-1 text-xs text-muted-foreground"
                        }
                      >
                        <Heart className="size-3.5" fill={loved ? "currentColor" : "none"} />
                        {formatNumber(post.loves, locale)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Fiverr-Style Verified Order Reviews Section */}
        <section className="mt-6" aria-labelledby="reviews-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              <h2 id="reviews-heading" className="font-display text-2xl">
                {locale === "bn"
                  ? `কাজের রিভিউ ও রেটিং (${musicianReviews.length})`
                  : `Verified Order Reviews (${musicianReviews.length})`}
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
              <Star className="size-3.5 fill-current" />
              {formatRating(profile.rating, locale)} ({formatNumber(profile.ratingCount, locale)})
            </span>
          </div>

          {musicianReviews.length === 0 ? (
            <p className="mt-3 rounded-3xl border border-white/10 bg-card p-5 text-sm text-muted-foreground">
              {locale === "bn"
                ? "এখনো কোনো সম্পন্ন অর্ডারের রিভিউ নেই। অর্ডার প্লেস করে কাজ সম্পন্ন হলে ক্রেতার দেওয়া রিভিউ এখানে ফাইভারের মতো দেখাবে।"
                : "No completed order reviews yet. When a client places an order and marks it completed, their verified review appears here."}
            </p>
          ) : (
            <ul className="mt-4 space-y-3.5">
              {musicianReviews.map((rev) => {
                const buyer = db.users.find((u) => u.id === rev.buyerId);
                const buyerName = buyer
                  ? pick(locale, buyer.nameBn, buyer.name)
                  : "Verified Client";
                return (
                  <li
                    key={rev.id}
                    className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#1d1917] to-[#161616] p-5 shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          src={buyer?.avatarUrl}
                          name={buyerName}
                          className="size-11"
                          textClassName="text-base"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{buyerName}</span>
                            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              {locale === "bn" ? "✓ যাচাইকৃত অর্ডার" : "✓ Verified Order"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {rev.orderTitle} · ৳{formatNumber(rev.priceBdt, locale)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-primary">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star
                            key={idx}
                            className="size-4"
                            fill={idx < rev.rating ? "currentColor" : "none"}
                          />
                        ))}
                        <span className="ml-1 text-xs font-bold text-foreground">
                          {rev.rating}.0
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-foreground">{rev.comment}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <details className="mt-5 rounded-3xl border border-white/10 bg-card px-5 py-4" open>
          <summary className="cursor-pointer text-sm font-semibold">{watch("details")}</summary>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{watch("city")}</dt>
              <dd>{pick(locale, profile.cityBn, profile.city)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{watch("instruments")}</dt>
              <dd>
                {pick(locale, profile.instrumentsBn.join(", "), profile.instruments.join(", ")) ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{watch("genres")}</dt>
              <dd>{pick(locale, profile.genresBn.join(", "), profile.genres.join(", ")) || "—"}</dd>
            </div>
            {profile.priceFromBdt ? (
              <div>
                <dt className="text-muted-foreground">{watch("priceLabel")}</dt>
                <dd>{watch("price", { price: formatNumber(profile.priceFromBdt, locale) })}</dd>
              </div>
            ) : null}
            {profile.turnaroundDays ? (
              <div>
                <dt className="text-muted-foreground">{watch("timeLabel")}</dt>
                <dd>{watch("days", { days: formatNumber(profile.turnaroundDays, locale) })}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">{watch("availability")}</dt>
              <dd>{profile.openToWork ? watch("open") : watch("closed")}</dd>
            </div>
          </dl>
        </details>
      </div>

      <aside className="space-y-4 rounded-3xl border border-white/10 bg-gradient-to-b from-[#1f1814] to-[#161616] p-5 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("hireCardTitle")}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            <ShieldCheck className="size-3.5" />
            {locale === "bn" ? "ট্রাস্ট পলিসি" : "Trust Policy"}
          </span>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{t("hire")}</p>

        {/* Owner's Optional Phone & bKash Payment Settings */}
        {isOwner ? (
          <div className="space-y-2.5 rounded-2xl border border-[#e2136e]/35 bg-[#e2136e]/10 p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#ff77b4]">
                <Wallet className="size-3.5" />
                {locale === "bn"
                  ? "বিকাশ ও ফোন নম্বর (ঐচ্ছিক)"
                  : "bKash & Phone (Optional)"}
              </span>
              {!editingContacts ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftPhone(profile.phone ?? "");
                    setDraftBkash(profile.bkashNumber ?? "");
                    setEditingContacts(true);
                  }}
                  className="font-semibold text-foreground underline"
                >
                  {locale === "bn" ? "সম্পাদনা" : "Edit"}
                </button>
              ) : null}
            </div>

            {editingContacts ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingContacts(true);
                  try {
                    await mutateCommunity({
                      action: "updatePaymentContacts",
                      phone: draftPhone.trim(),
                      bkashNumber: draftBkash.trim(),
                    });
                    setEditingContacts(false);
                  } finally {
                    setSavingContacts(false);
                  }
                }}
                className="space-y-2 pt-1"
              >
                <input
                  value={draftBkash}
                  onChange={(e) => setDraftBkash(e.target.value)}
                  inputMode="tel"
                  placeholder={locale === "bn" ? "বিকাশ নম্বর (017XXXXXXXX)" : "bKash Number (017XXXXXXXX)"}
                  className="h-9 w-full rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                />
                <input
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  inputMode="tel"
                  placeholder={locale === "bn" ? "ফোন নম্বর (ঐচ্ছিক)" : "Phone Number (optional)"}
                  className="h-9 w-full rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingContacts(false)}
                    className="rounded-full px-3 py-1 text-muted-foreground hover:text-foreground"
                  >
                    {locale === "bn" ? "বাতিল" : "Cancel"}
                  </button>
                  <button
                    type="submit"
                    disabled={savingContacts}
                    className="rounded-full bg-[#e2136e] px-3.5 py-1 font-semibold text-white"
                  >
                    {savingContacts ? "…" : locale === "bn" ? "সেভ করো" : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-1 text-muted-foreground">
                <p>
                  <strong className="text-foreground">bKash:</strong>{" "}
                  {profile.bkashNumber || (locale === "bn" ? "যোগ করা হয়নি" : "Not set")}
                </p>
                <p>
                  <strong className="text-foreground">Phone:</strong>{" "}
                  {profile.phone || (locale === "bn" ? "যোগ করা হয়নি" : "Not set")}
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Active Orders Tracker on Profile */}
        {myOrdersWithMusician.length > 0 ? (
          <div className="space-y-2.5 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold text-foreground">
              {locale === "bn" ? "চলমান ও সম্পন্ন অর্ডার:" : "Your Orders:"}
            </p>
            {myOrdersWithMusician.map((ord) => {
              const isBuyer = ord.buyerId === activeUserId;
              const isMusician = ord.musicianId === activeUserId;
              return (
                <div
                  key={ord.id}
                  className="rounded-2xl border border-primary/35 bg-black/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <strong className="truncate text-foreground">{ord.title}</strong>
                    <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {ord.status === "completed"
                        ? locale === "bn"
                          ? "✓ সম্পন্ন"
                          : "✓ Completed"
                        : ord.status === "delivered"
                          ? locale === "bn"
                            ? "📦 ডেলিভারি"
                            : "📦 Delivered"
                          : locale === "bn"
                            ? "⏳ চলমান"
                            : "⏳ Active"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ৳{formatNumber(ord.priceBdt, locale)} · {ord.deliveryDays}d
                    {ord.bkashTrxId ? ` · bKash TrxID: ${ord.bkashTrxId}` : ""}
                  </p>

                  {ord.attachmentUrl ? (
                    <MediaAttachmentPreview
                      url={ord.attachmentUrl}
                      kind={ord.attachmentKind}
                      name={ord.attachmentName ?? "Order reference file"}
                    />
                  ) : null}

                  {ord.deliveryAttachmentUrl ? (
                    <MediaAttachmentPreview
                      url={ord.deliveryAttachmentUrl}
                      kind={ord.deliveryAttachmentKind}
                      name={ord.deliveryAttachmentName ?? "Delivered session file"}
                    />
                  ) : null}

                  {isMusician && ord.status === "active" ? (
                    <div className="mt-2">
                      {deliveringOrderId === ord.id ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setSubmittingDelivery(true);
                            try {
                              await mutateCommunity({
                                action: "markOrderDelivered",
                                orderId: ord.id,
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
                          }}
                          className="space-y-2 border-t border-white/10 pt-2"
                        >
                          <label className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black px-3 text-xs font-medium text-foreground hover:border-primary">
                            <Upload className="size-3.5 text-primary" />
                            <span>
                              {uploadingDeliveryFile
                                ? "Uploading…"
                                : deliveryAttachment
                                  ? deliveryAttachment.name
                                  : locale === "bn"
                                    ? "ডেলিভারি অডিও / ভিডিও সংযুক্ত করো"
                                    : "Attach Audio / Video File"}
                            </span>
                            <input
                              type="file"
                              accept="audio/*,video/*"
                              className="sr-only"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploadingDeliveryFile(true);
                                try {
                                  const up = await uploadAudioFile(file);
                                  setDeliveryAttachment({
                                    url: up.url,
                                    name: up.name,
                                    kind:
                                      up.kind === "video" || file.type.startsWith("video/")
                                        ? "video"
                                        : "audio",
                                  });
                                } finally {
                                  setUploadingDeliveryFile(false);
                                }
                              }}
                            />
                          </label>
                          <input
                            value={deliveryNote}
                            onChange={(e) => setDeliveryNote(e.target.value)}
                            placeholder={locale === "bn" ? "ডেলিভারি নোট…" : "Delivery note…"}
                            className="h-8 w-full rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                          />
                          <button
                            type="submit"
                            disabled={submittingDelivery || uploadingDeliveryFile}
                            className="w-full rounded-full bg-emerald-500 py-1.5 text-xs font-bold text-black"
                          >
                            {submittingDelivery
                              ? "…"
                              : locale === "bn"
                                ? "ডেলিভারি পাঠাও"
                                : "Send Delivery"}
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeliveringOrderId(ord.id)}
                          className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300"
                        >
                          <PackageCheck className="size-3.5" />
                          {locale === "bn" ? "ফাইল ও ডেলিভারি দাও" : "Deliver File / Work"}
                        </button>
                      )}
                    </div>
                  ) : null}

                  {/* Strictly restricted to the Buyer who placed the order */}
                  {isBuyer && ord.status !== "completed" ? (
                    <div className="mt-2">
                      {reviewingOrderId === ord.id ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            setSubmittingReview(true);
                            try {
                              await mutateCommunity({
                                action: "completeOrderAndReview",
                                orderId: ord.id,
                                buyerId: activeUserId,
                                rating: reviewRating,
                                comment:
                                  reviewComment.trim() ||
                                  (locale === "bn"
                                    ? "চমৎকার কাজ এবং সময়মতো ডেলিভারি!"
                                    : "Great work and timely delivery!"),
                              });
                              setReviewingOrderId(null);
                              setReviewComment("");
                            } finally {
                              setSubmittingReview(false);
                            }
                          }}
                          className="space-y-2 border-t border-white/10 pt-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">Rating:</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setReviewRating(s)}
                                  className="text-primary"
                                >
                                  <Star
                                    className="size-3.5"
                                    fill={s <= reviewRating ? "currentColor" : "none"}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            required
                            rows={2}
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder={
                              locale === "bn" ? "কাজের রিভিউ লিখো…" : "Write your review…"
                            }
                            className="w-full rounded-xl border border-white/15 bg-black p-2 text-xs text-foreground outline-none"
                          />
                          <Button
                            type="submit"
                            size="sm"
                            disabled={submittingReview}
                            className="w-full rounded-full text-xs"
                          >
                            {submittingReview
                              ? "…"
                              : locale === "bn"
                                ? "সম্পন্ন ও রিভিউ পোস্ট করো"
                                : "Complete & Post Review"}
                          </Button>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setReviewingOrderId(ord.id)}
                          className="w-full rounded-full text-xs"
                        >
                          <CheckCircle2 className="size-3.5" />
                          {locale === "bn"
                            ? "অর্ডার সম্পন্ন ও রিভিউ দাও"
                            : "Mark Completed & Review"}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {profile.id !== activeUserId ? (
          <>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!activeUserId) {
                  router.push("/register");
                  return;
                }
                if (!orderTitle.trim()) return;
                setPlacingOrder(true);
                try {
                  await mutateCommunity({
                    action: "createOrder",
                    buyerId: activeUserId,
                    musicianId: profile.id,
                    title: orderTitle.trim(),
                    description: orderDesc.trim(),
                    priceBdt:
                      Number(orderPrice.replace(/[^\d]/g, "")) ||
                      profile.priceFromBdt ||
                      4000,
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
                  openChatWindow(profile.id);
                } finally {
                  setPlacingOrder(false);
                }
              }}
              className="space-y-2.5 rounded-2xl border border-white/10 bg-black/50 p-3.5"
            >
              <p className="text-xs font-semibold text-foreground">
                {locale === "bn"
                  ? "নতুন অর্ডার প্লেস করো (ফাইভার স্টাইল):"
                  : "Place an Order (Fiverr Trust Flow):"}
              </p>

              {/* Receiver's bKash & Phone Info for Order Payment */}
              <div className="space-y-1.5 rounded-xl border border-[#e2136e]/40 bg-[#e2136e]/10 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#ff77b4]">
                    <Wallet className="size-3.5" />
                    {profile.bkashNumber
                      ? `bKash: ${profile.bkashNumber}`
                      : locale === "bn"
                        ? "বিকাশ নম্বর দেওয়া হয়নি (চ্যাটে জেনে নাও)"
                        : "bKash number not set (ask in chat)"}
                  </span>
                  {profile.bkashNumber ? (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(profile.bkashNumber!);
                        setCopiedBkash(true);
                        setTimeout(() => setCopiedBkash(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-[#e2136e]/50 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-[#ff88bc]"
                    >
                      {copiedBkash ? <Check className="size-3" /> : <Copy className="size-3" />}
                      <span>{copiedBkash ? "Copied" : "Copy"}</span>
                    </button>
                  ) : null}
                </div>
                {profile.phone ? (
                  <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Phone className="size-3" />
                    <span>{profile.phone}</span>
                  </p>
                ) : null}
              </div>

              <input
                required
                value={orderTitle}
                onChange={(e) => setOrderTitle(e.target.value)}
                placeholder={
                  locale === "bn"
                    ? "কাজের শিরোনাম (যেমন: গিটার পার্ট রেকর্ড)"
                    : "Order title (e.g. Guitar stem for chorus)"
                }
                className="h-9 w-full rounded-full border border-white/15 bg-black px-3.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                  inputMode="numeric"
                  placeholder={`৳ ${profile.priceFromBdt ?? 4000}`}
                  className="h-9 rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                />
                <input
                  value={orderDays}
                  onChange={(e) => setOrderDays(e.target.value)}
                  inputMode="numeric"
                  placeholder="4 days"
                  className="h-9 rounded-full border border-white/15 bg-black px-3 text-xs text-foreground outline-none"
                />
              </div>
              <input
                value={orderBkashTrxId}
                onChange={(e) => setOrderBkashTrxId(e.target.value)}
                placeholder={
                  locale === "bn"
                    ? "বিকাশ TrxID / পেমেন্ট রেফারেন্স (ঐচ্ছিক)"
                    : "bKash TrxID / payment ref (optional)"
                }
                className="h-9 w-full rounded-full border border-[#e2136e]/40 bg-black px-3.5 text-xs text-foreground outline-none"
              />
              <textarea
                rows={2}
                value={orderDesc}
                onChange={(e) => setOrderDesc(e.target.value)}
                placeholder={
                  locale === "bn"
                    ? "কী (Key), টেম্পো এবং কাজের বিবরণ…"
                    : "Key, tempo, and session details…"
                }
                className="w-full rounded-2xl border border-white/15 bg-black p-3 text-xs text-foreground outline-none"
              />

              {/* Attach Reference Audio / Video File */}
              <div className="space-y-1.5">
                <label className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black px-3 text-xs font-medium text-foreground hover:border-primary">
                  <Upload className="size-3.5 text-primary" />
                  <span className="truncate">
                    {uploadingOrderFile
                      ? locale === "bn"
                        ? "আপলোড হচ্ছে…"
                        : "Uploading…"
                      : orderAttachment
                        ? `📎 ${orderAttachment.name}`
                        : locale === "bn"
                          ? "রেফারেন্স অডিও / ভিডিও সংযুক্ত করো (ঐচ্ছিক)"
                          : "Attach Audio / Video File (optional)"}
                  </span>
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingOrderFile(true);
                      try {
                        const up = await uploadAudioFile(file);
                        setOrderAttachment({
                          url: up.url,
                          name: up.name,
                          kind:
                            up.kind === "video" || file.type.startsWith("video/")
                              ? "video"
                              : "audio",
                        });
                      } finally {
                        setUploadingOrderFile(false);
                      }
                    }}
                  />
                </label>
                {orderAttachment ? (
                  <button
                    type="button"
                    onClick={() => setOrderAttachment(null)}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                    <span>{locale === "bn" ? "ফাইল সরাও" : "Remove file"}</span>
                  </button>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={placingOrder || uploadingOrderFile}
                className="w-full rounded-full"
              >
                <ShoppingBag className="size-4" />
                {placingOrder
                  ? "…"
                  : locale === "bn"
                    ? "অর্ডার নিশ্চিত করো"
                    : "Confirm Order"}
              </Button>
            </form>

            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => {
                if (!activeUserId) {
                  router.push("/register");
                  return;
                }
                openChatWindow(profile.id);
              }}
            >
              <MessageCircle className="size-4 text-primary" />
              {t("openChatWindow")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("chatDockHint")}</p>
          </>
        ) : null}
        <p className="pt-1 text-sm">
          <Link href="/find" className="text-foreground underline decoration-primary underline-offset-4">
            {t("needOther")}
          </Link>
        </p>
      </aside>
    </div>
  );
}
