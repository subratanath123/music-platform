"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Globe,
  Heart,
  MessageCircle,
  Music2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AudioPlayer } from "@/components/media/audio-player";
import { StarRating } from "@/components/media/star-rating";
import { YoutubePlayer } from "@/components/media/youtube-player";
import { DefaultCoverArt } from "@/components/profile/default-cover-art";
import { UserAvatar } from "@/components/profile/user-avatar";
import { SearchResultsList } from "@/components/search/search-results-list";
import { Button } from "@/components/ui/button";
import { pick, type Musician, type Role } from "@/data/catalog";
import { Link, useRouter } from "@/i18n/navigation";
import {
  mutateCommunity,
  openChatWindow,
  uploadAudioFile,
  useCommunityStore,
  useCurrentUser,
} from "@/lib/community-store";
import type { CommunityPost, DbUser, PostCategory } from "@/lib/db-types";
import { formatCount, formatNumber, formatRating } from "@/lib/format";
import type { SemanticMusicianHit } from "@/lib/vector-search";
import { youtubeIdFromUrl } from "@/lib/youtube";

const filters = ["all", "following", "musicians", "vocal", "guitar", "percussion", "folk"] as const;
type Filter = (typeof filters)[number];

const roles: Role[] = ["vocalist", "guitarist", "percussion", "flute", "producer", "lyricist"];
const categories: PostCategory[] = ["offering", "collab", "work"];

function formatPostTime(iso: string, locale: string, hydrated: boolean) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (hydrated) {
    const diffMin = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
    if (diffMin < 1) return locale === "bn" ? "এইমাত্র" : "Just now";
    if (diffMin < 60) {
      return locale === "bn" ? `${formatNumber(diffMin, locale)} মিনিট আগে` : `${diffMin}m ago`;
    }
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      return locale === "bn" ? `${formatNumber(diffHr, locale)} ঘণ্টা আগে` : `${diffHr}h ago`;
    }
  }
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(date);
}

export function HomeFeed() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const { db, hydrated } = useCommunityStore();
  const currentUser = useCurrentUser();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [searchingVector, setSearchingVector] = useState(false);
  const [vectorQuery, setVectorQuery] = useState("");
  const [vectorHits, setVectorHits] = useState<SemanticMusicianHit[] | null>(null);
  const searchSeq = useRef(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postCategory, setPostCategory] = useState<PostCategory>("offering");
  const [postRole, setPostRole] = useState<Role>(currentUser?.roles[0] ?? "guitarist");
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");
  const [postPrice, setPostPrice] = useState("");
  const [postYoutube, setPostYoutube] = useState("");
  const [postAudio, setPostAudio] = useState("");
  const [uploading, setUploading] = useState(false);
  const [composerError, setComposerError] = useState("");

  const activeUserId = currentUser?.id ?? null;
  const myFollows = useMemo(
    () => (activeUserId ? (db.follows[activeUserId] ?? []) : []),
    [db.follows, activeUserId],
  );

  const userMap = useMemo(() => {
    const map = new Map<string, DbUser>();
    for (const u of db.users) {
      map.set(u.id, u);
    }
    return map;
  }, [db.users]);

  const filteredPosts = useMemo(() => {
    return db.posts.filter((post) => {
      const author = userMap.get(post.musicianId);
      if (filter === "following" && !myFollows.includes(post.musicianId)) return false;
      if (filter === "vocal" && post.roleTag !== "vocalist" && !author?.roles.includes("vocalist"))
        return false;
      if (filter === "guitar" && post.roleTag !== "guitarist" && !author?.roles.includes("guitarist"))
        return false;
      if (
        filter === "percussion" &&
        post.roleTag !== "percussion" &&
        !author?.roles.includes("percussion")
      )
        return false;
      if (
        filter === "folk" &&
        !author?.genreTerms.some((term) => term === "folk" || term === "লোক")
      ) {
        return false;
      }
      return true;
    });
  }, [db.posts, filter, myFollows, userMap]);

  const visibleMusicians = useMemo(() => {
    return db.users.filter((person) => {
      if (!person.profileCompleted) return false;
      if (person.isPrivate) return false;
      if (activeUserId && person.id === activeUserId) return false;
      if (filter === "following" && !myFollows.includes(person.id)) return false;
      if (filter === "vocal" && !person.roles.includes("vocalist")) return false;
      if (filter === "guitar" && !person.roles.includes("guitarist")) return false;
      if (filter === "percussion" && !person.roles.includes("percussion")) return false;
      if (filter === "folk" && !person.genreTerms.some((term) => term === "folk" || term === "লোক")) {
        return false;
      }
      return true;
    });
  }, [db.users, filter, myFollows, activeUserId]);

  const searchActive = searchingVector || vectorHits !== null;

  function clearSearch() {
    searchSeq.current += 1;
    setQuery("");
    setVectorHits(null);
    setVectorQuery("");
    setSearchingVector(false);
  }

  function openComposerWithCategory(cat: PostCategory) {
    setPostCategory(cat);
    setComposerOpen(true);
  }

  async function handleSemanticSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) {
      clearSearch();
      return;
    }
    const seq = ++searchSeq.current;
    setSearchingVector(true);
    setVectorQuery(q);
    try {
      const res = await fetch(`/community-search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { hits?: SemanticMusicianHit[] };
      if (seq !== searchSeq.current) return;
      setVectorHits(Array.isArray(data.hits) ? data.hits : []);
    } catch {
      if (seq === searchSeq.current) setVectorHits([]);
    } finally {
      if (seq === searchSeq.current) setSearchingVector(false);
    }
  }

  async function handleCreatePost(event: FormEvent) {
    event.preventDefault();
    const authorId = currentUser?.id;
    if (!authorId) {
      router.push("/register");
      return;
    }
    if (!postTitle.trim() || !postText.trim()) {
      setComposerError(t("postRequired"));
      return;
    }
    const ytId = youtubeIdFromUrl(postYoutube);
    if (postYoutube.trim() && !ytId) {
      setComposerError(t("badYoutube"));
      return;
    }
    const priceNum = Number(postPrice.replace(/[^\d]/g, ""));
    setComposerError("");
    await mutateCommunity({
      action: "createPost",
      musicianId: authorId,
      category: postCategory,
      title: postTitle.trim(),
      text: postText.trim(),
      roleTag: postRole,
      priceBdt: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
      youtubeId: ytId || undefined,
      audioSrc: postAudio.trim() || undefined,
    });
    setPostTitle("");
    setPostText("");
    setPostPrice("");
    setPostYoutube("");
    setPostAudio("");
    setComposerOpen(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("lead")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            className="rounded-full"
            onClick={() => setComposerOpen((v) => !v)}
          >
            <Plus className="size-4" />
            {t("createPostBtn")}
          </Button>
          <Button asChild className="rounded-full">
            <Link href="/register">{currentUser ? t("editProfile") : t("register")}</Link>
          </Button>
        </div>
      </div>

      {/* Semantic Search Bar */}
      <form
        className="mt-5 flex items-center gap-2.5 rounded-full border border-white/10 bg-[#18191a] p-1.5 shadow-sm"
        onSubmit={(e) => void handleSemanticSearch(e)}
      >
        <label className="sr-only" htmlFor="home-search">
          {t("search")}
        </label>
        <Sparkles className="ml-3 size-4 shrink-0 text-primary" aria-hidden />
        <input
          id="home-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) clearSearch();
          }}
          placeholder={t("search")}
          className="h-10 min-w-0 flex-1 rounded-full bg-transparent px-2 text-sm outline-none"
        />
        {query.trim() ? (
          <button
            type="button"
            onClick={clearSearch}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <Button type="submit" size="sm" disabled={searchingVector} className="rounded-full px-5">
          {searchingVector ? "…" : t("ask")}
        </Button>
      </form>

      {searchActive ? (
        <SearchResultsList
          hits={vectorHits ?? []}
          query={vectorQuery}
          loading={searchingVector}
          onClear={clearSearch}
        />
      ) : (
        <>
          {/* Filter Pills */}
          <div
            className="mt-4 flex gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-[#18191a] p-1.5"
            role="group"
            aria-label={t("filters")}
          >
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                className={
                  filter === item
                    ? "shrink-0 rounded-xl bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-4 py-2 text-xs font-semibold text-[#1a0900] shadow-sm"
                    : "shrink-0 rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }
              >
                {t(item)}
                {item === "following" ? ` (${myFollows.length})` : ""}
              </button>
            ))}
          </div>

          {filter === "musicians" ? (
            /* Full-width Musicians Directory Grid */
            <section className="mt-6" aria-labelledby="directory-heading">
              <div className="flex items-center justify-between gap-2">
                <h2 id="directory-heading" className="font-display text-xl font-bold">
                  {t("directoryTitle")}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {formatNumber(visibleMusicians.length, locale)} {t("musiciansCount")}
                </span>
              </div>

              {visibleMusicians.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-[#18191a] p-6 text-sm text-muted-foreground">
                  {t("empty")}
                </p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleMusicians.map((person) => (
                    <li key={person.id}>
                      <PersonCard
                        person={person}
                        locale={locale}
                        following={myFollows.includes(person.id)}
                        activeUserId={activeUserId}
                        onRequireSignIn={() => router.push("/register")}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            /* Facebook-style Two-Column Layout: Main Feed Column + Right Musicians Sidebar */
            <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,680px)_1fr]">
              {/* Main News Feed Column */}
              <section aria-labelledby="feed-heading" className="min-w-0 space-y-4">
                <div className="sr-only">
                  <h2 id="feed-heading">
                    {filter === "following" ? t("followingFeedTitle") : t("feedTitle")}
                  </h2>
                </div>

                {/* Facebook-style "Create Post" Trigger Card */}
                <div className="rounded-2xl border border-white/10 bg-[#18191a] p-4 shadow-md">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      src={currentUser?.avatarUrl}
                      name={currentUser?.name ?? "S"}
                      className="size-10 shrink-0"
                      textClassName="text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setComposerOpen(true)}
                      className="flex h-10 flex-1 items-center rounded-full border border-white/10 bg-[#242526] px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-[#303133] hover:text-foreground"
                    >
                      {t("postBodyPlaceholder")}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1 border-t border-white/10 pt-2.5">
                    <button
                      type="button"
                      onClick={() => openComposerWithCategory("offering")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <Briefcase className="size-4 text-primary" />
                      <span>{t("categories.offering")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openComposerWithCategory("collab")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <Users className="size-4 text-emerald-400" />
                      <span>{t("categories.collab")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openComposerWithCategory("work")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <Music2 className="size-4 text-amber-400" />
                      <span>{t("categories.work")}</span>
                    </button>
                  </div>

                  {/* Expanded Composer Form */}
                  {composerOpen ? (
                    <form
                      onSubmit={(e) => void handleCreatePost(e)}
                      className="mt-3 border-t border-white/10 pt-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {t("composerTitle")}
                        </span>
                        {!currentUser ? (
                          <Link href="/register" className="text-xs font-medium text-primary underline">
                            {t("register")}
                          </Link>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setPostCategory(cat)}
                            className={
                              postCategory === cat
                                ? "rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3 py-1 text-xs font-semibold text-[#1a0900]"
                                : "rounded-full bg-[#242526] px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                            }
                          >
                            {t(`categories.${cat}`)}
                          </button>
                        ))}
                        <span className="mx-1 self-center text-xs text-muted-foreground">·</span>
                        {roles.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setPostRole(r)}
                            className={
                              postRole === r
                                ? "rounded-full border border-primary bg-[#242526] px-3 py-1 text-xs font-semibold text-primary"
                                : "rounded-full bg-[#242526] px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                            }
                          >
                            {t(`roles.${r}`)}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_160px]">
                        <input
                          value={postTitle}
                          onChange={(e) => setPostTitle(e.target.value)}
                          placeholder={t("postTitlePlaceholder")}
                          className="h-10 rounded-xl border border-white/10 bg-[#242526] px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                        <input
                          value={postPrice}
                          onChange={(e) => setPostPrice(e.target.value)}
                          placeholder={t("postPricePlaceholder")}
                          inputMode="numeric"
                          className="h-10 rounded-xl border border-white/10 bg-[#242526] px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                      </div>

                      <textarea
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        rows={3}
                        placeholder={t("postBodyPlaceholder")}
                        className="mt-2.5 w-full rounded-xl border border-white/10 bg-[#242526] px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />

                      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                        <input
                          value={postYoutube}
                          onChange={(e) => setPostYoutube(e.target.value)}
                          placeholder={t("postYoutubePlaceholder")}
                          className="h-10 rounded-xl border border-white/10 bg-[#242526] px-3.5 text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <label className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-[#242526] px-3.5 text-xs font-medium hover:border-primary">
                            <Upload className="size-3.5 text-primary" />
                            {uploading ? t("uploading") : t("uploadAudio")}
                            <input
                              type="file"
                              accept="audio/*"
                              className="sr-only"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setUploading(true);
                                try {
                                  const res = await uploadAudioFile(file);
                                  setPostAudio(res.url);
                                } finally {
                                  setUploading(false);
                                }
                              }}
                            />
                          </label>
                          <input
                            value={postAudio}
                            onChange={(e) => setPostAudio(e.target.value)}
                            placeholder="/media/farhan-guitar.wav"
                            className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#242526] px-3 text-xs"
                          />
                        </div>
                      </div>

                      {composerError ? (
                        <p className="mt-2 text-xs text-destructive">{composerError}</p>
                      ) : null}
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setComposerOpen(false)}
                        >
                          {t("cancel")}
                        </Button>
                        <Button type="submit" size="sm">
                          {t("publishPost")}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>

                {/* Feed Posts List */}
                {filteredPosts.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-[#18191a] p-6 text-center text-sm text-muted-foreground">
                    {filter === "following" ? t("emptyFollowing") : t("empty")}
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {filteredPosts.map((post) => {
                      const author = userMap.get(post.musicianId);
                      if (!author) return null;
                      const loved = activeUserId ? post.lovedBy.includes(activeUserId) : false;
                      const following = myFollows.includes(author.id);
                      return (
                        <li key={post.id}>
                          <PostCard
                            post={post}
                            author={author}
                            locale={locale}
                            hydrated={hydrated}
                            loved={loved}
                            following={following}
                            activeUserId={activeUserId}
                            onRequireSignIn={() => router.push("/register")}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Right Sidebar: Suggested Musicians Directory */}
              <aside
                aria-labelledby="directory-heading"
                className="rounded-2xl border border-white/10 bg-[#18191a] p-4 shadow-md lg:sticky lg:top-20"
              >
                <div className="flex items-center justify-between gap-2 pb-3">
                  <h2 id="directory-heading" className="font-display text-base font-bold">
                    {t("directoryTitle")}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setFilter("musicians")}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {formatNumber(visibleMusicians.length, locale)} {t("musiciansCount")}
                  </button>
                </div>

                {visibleMusicians.length === 0 ? (
                  <p className="py-4 text-xs text-muted-foreground">{t("empty")}</p>
                ) : (
                  <ul className="divide-y divide-white/10">
                    {visibleMusicians.slice(0, 6).map((person) => (
                      <li key={person.id} className="py-3 first:pt-1 last:pb-1">
                        <SidebarMusicianRow
                          person={person}
                          locale={locale}
                          following={myFollows.includes(person.id)}
                          activeUserId={activeUserId}
                          onRequireSignIn={() => router.push("/register")}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PostCard({
  post,
  author,
  locale,
  hydrated,
  loved,
  following,
  activeUserId,
  onRequireSignIn,
}: {
  post: CommunityPost;
  author: DbUser;
  locale: string;
  hydrated: boolean;
  loved: boolean;
  following: boolean;
  activeUserId: string | null;
  onRequireSignIn: () => void;
}) {
  const t = useTranslations("Home");
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState<PostCategory>(post.category);
  const [editRole, setEditRole] = useState<Role>(post.roleTag);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editText, setEditText] = useState(post.text);
  const [editPrice, setEditPrice] = useState(post.priceBdt ? String(post.priceBdt) : "");
  const [editYoutube, setEditYoutube] = useState(
    post.youtubeId ? `https://www.youtube.com/watch?v=${post.youtubeId}` : "",
  );
  const [editAudio, setEditAudio] = useState(post.audioSrc ?? "");
  const [uploadingEditAudio, setUploadingEditAudio] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const authorName = pick(locale, author.nameBn, author.name);
  const roleLabel = t(`roles.${post.roleTag}`);
  const fullText = pick(locale, post.textBn, post.text);
  const isLong = fullText.length > 260;
  const visibleText = !expanded && isLong ? `${fullText.slice(0, 260).trimEnd()}…` : fullText;
  const timeLabel = formatPostTime(post.createdAt, locale, hydrated);
  const isOwnPost = author.id === activeUserId;

  function openEditor() {
    setEditCategory(post.category);
    setEditRole(post.roleTag);
    setEditTitle(post.title);
    setEditText(post.text);
    setEditPrice(post.priceBdt ? String(post.priceBdt) : "");
    setEditYoutube(post.youtubeId ? `https://www.youtube.com/watch?v=${post.youtubeId}` : "");
    setEditAudio(post.audioSrc ?? "");
    setEditError("");
    setEditing(true);
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editTitle.trim() || !editText.trim()) {
      setEditError(t("postRequired"));
      return;
    }
    const ytId = youtubeIdFromUrl(editYoutube);
    if (editYoutube.trim() && !ytId) {
      setEditError(t("badYoutube"));
      return;
    }
    const priceNum = Number(editPrice.replace(/[^\d]/g, ""));
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await mutateCommunity<{ error?: string }>({
        action: "updatePost",
        postId: post.id,
        category: editCategory,
        roleTag: editRole,
        title: editTitle.trim(),
        text: editText.trim(),
        priceBdt: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
        youtubeId: ytId || undefined,
        audioSrc: editAudio.trim() || undefined,
      });
      if (res.error) {
        setEditError(res.error);
        return;
      }
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#18191a] shadow-md">
      {/* Facebook-style Post Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/u/${author.id}`} className="shrink-0">
            <UserAvatar
              src={author.avatarUrl}
              name={authorName}
              className="size-11 ring-1 ring-white/10"
              textClassName="text-sm"
            />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={`/u/${author.id}`}
                className="truncate text-[15px] font-semibold text-foreground hover:underline"
              >
                {authorName}
              </Link>
              {author.id !== activeUserId ? (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    type="button"
                    aria-pressed={following}
                    onClick={() => {
                      if (!activeUserId) {
                        onRequireSignIn();
                        return;
                      }
                      void mutateCommunity({
                        action: "toggleFollow",
                        followerId: activeUserId,
                        musicianId: author.id,
                      });
                    }}
                    className={
                      following
                        ? "text-xs font-semibold text-muted-foreground hover:text-foreground"
                        : "text-xs font-semibold text-primary hover:underline"
                    }
                  >
                    {following ? t("followingBtn") : t("followBtn")}
                  </button>
                </>
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t(`roles.${author.roles[0] as Role}`)}</span>
              <span>·</span>
              <span>{pick(locale, author.cityBn, author.city)}</span>
              {timeLabel ? (
                <>
                  <span>·</span>
                  <span>{timeLabel}</span>
                </>
              ) : null}
              <span>·</span>
              <Globe className="size-3" aria-hidden />
            </div>
          </div>
        </div>

        {/* Category & Role Badge + Owner Edit Trigger */}
        <div className="flex shrink-0 items-center gap-2">
          {post.priceBdt ? (
            <span className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
              ৳{formatNumber(post.priceBdt, locale)}
            </span>
          ) : null}
          <span className="rounded-lg border border-white/10 bg-[#242526] px-2.5 py-1 text-xs font-medium text-foreground">
            {t(`categories.${post.category}`)} · {roleLabel}
          </span>
          {isOwnPost ? (
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : openEditor())}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#242526] px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
              title={locale === "bn" ? "পোস্ট সম্পাদনা করো" : "Edit post"}
            >
              <Pencil className="size-3.5" />
              <span>{locale === "bn" ? "সম্পাদনা" : "Edit"}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Inline Post Editor (for Post Author) */}
      {isOwnPost && editing ? (
        <form
          onSubmit={(e) => void handleSaveEdit(e)}
          className="mx-4 mt-3 mb-3 space-y-2.5 rounded-2xl border border-primary/40 bg-[#202122] p-4"
        >
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setEditCategory(cat)}
                className={
                  editCategory === cat
                    ? "rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3 py-1 text-xs font-semibold text-[#1a0900]"
                    : "rounded-full bg-[#18191a] px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {t(`categories.${cat}`)}
              </button>
            ))}
            <span className="mx-1 self-center text-xs text-muted-foreground">·</span>
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setEditRole(r)}
                className={
                  editRole === r
                    ? "rounded-full border border-primary bg-[#18191a] px-3 py-1 text-xs font-semibold text-primary"
                    : "rounded-full bg-[#18191a] px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-[1fr_150px]">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder={t("postTitlePlaceholder")}
              className="h-9 rounded-xl border border-white/10 bg-[#18191a] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <input
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              placeholder={t("postPricePlaceholder")}
              inputMode="numeric"
              className="h-9 rounded-xl border border-white/10 bg-[#18191a] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            placeholder={t("postBodyPlaceholder")}
            className="w-full rounded-xl border border-white/10 bg-[#18191a] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />

          <div className="grid gap-2.5 sm:grid-cols-2">
            <input
              value={editYoutube}
              onChange={(e) => setEditYoutube(e.target.value)}
              placeholder={t("postYoutubePlaceholder")}
              className="h-9 rounded-xl border border-white/10 bg-[#18191a] px-3 text-xs"
            />
            <div className="flex items-center gap-2">
              <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-[#18191a] px-3 text-xs font-medium hover:border-primary">
                <Upload className="size-3.5 text-primary" />
                {uploadingEditAudio ? t("uploading") : t("uploadAudio")}
                <input
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingEditAudio(true);
                    try {
                      const res = await uploadAudioFile(file);
                      setEditAudio(res.url);
                    } finally {
                      setUploadingEditAudio(false);
                    }
                  }}
                />
              </label>
              <input
                value={editAudio}
                onChange={(e) => setEditAudio(e.target.value)}
                placeholder="/media/farhan-guitar.wav"
                className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#18191a] px-2.5 text-xs"
              />
            </div>
          </div>

          {editError ? <p className="text-xs text-destructive">{editError}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                void mutateCommunity({
                  action: "deletePost",
                  postId: post.id,
                })
              }
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" />
              <span>{locale === "bn" ? "পোস্ট মুছো" : "Delete Post"}</span>
            </button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={savingEdit || uploadingEditAudio}>
                {savingEdit ? "…" : locale === "bn" ? "পরিবর্তন সেভ করো" : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        /* Post Title & Body */
        <div className="px-4 pt-3 pb-3">
          <h3 className="text-[16px] font-semibold leading-snug text-foreground">
            {pick(locale, post.titleBn, post.title)}
          </h3>
          <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed text-[#d8dadf]">
            {visibleText}
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="ml-1.5 font-semibold text-foreground hover:underline"
              >
                {expanded
                  ? locale === "bn"
                    ? "কম দেখুন"
                    : "See less"
                  : locale === "bn"
                    ? "আরও পড়ুন"
                    : "See more"}
              </button>
            ) : null}
          </p>
        </div>
      )}

      {/* Media Attachment */}
      {post.youtubeId ? (
        <div className="border-t border-white/10 bg-black">
          <YoutubePlayer
            videoId={post.youtubeId}
            title={pick(locale, post.titleBn, post.title)}
          />
        </div>
      ) : null}

      {post.audioSrc ? (
        <div className="px-4 pb-3">
          <AudioPlayer
            src={post.audioSrc}
            title={pick(locale, post.titleBn, post.title)}
          />
        </div>
      ) : null}

      {/* Facebook Reaction Count Row */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-[#1a0900]">
            <Heart className="size-2.5" fill="currentColor" />
          </span>
          <span>
            {formatNumber(post.loves, locale)} {t("loveBtn")}
          </span>
        </div>
        <span>
          {t(`categories.${post.category}`)} · {roleLabel}
        </span>
      </div>

      {/* Facebook Action Footer */}
      <div className="mx-3 grid grid-cols-3 gap-1 border-t border-white/10 py-1.5 text-xs font-semibold">
        <button
          type="button"
          aria-pressed={loved}
          onClick={() => {
            if (!activeUserId) {
              onRequireSignIn();
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
              ? "inline-flex items-center justify-center gap-2 rounded-lg py-2 text-primary transition-colors hover:bg-white/5"
              : "inline-flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          }
        >
          <Heart className="size-4" fill={loved ? "currentColor" : "none"} />
          <span>{t("loveBtn")}</span>
        </button>

        {!isOwnPost ? (
          <button
            type="button"
            onClick={() => {
              if (!activeUserId) {
                onRequireSignIn();
                return;
              }
              openChatWindow(author.id);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <MessageCircle className="size-4" />
            <span>{t("messageBtn")}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : openEditor())}
            className="inline-flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Pencil className="size-4" />
            <span>{locale === "bn" ? "পোস্ট সম্পাদনা" : "Edit Post"}</span>
          </button>
        )}

        <Link
          href={`/u/${author.id}`}
          className="inline-flex items-center justify-center gap-2 rounded-lg py-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <UserRound className="size-4" />
          <span>{t("openProfile")}</span>
        </Link>
      </div>
    </article>
  );
}

function SidebarMusicianRow({
  person,
  locale,
  following,
  activeUserId,
  onRequireSignIn,
}: {
  person: Musician;
  locale: string;
  following: boolean;
  activeUserId: string | null;
  onRequireSignIn: () => void;
}) {
  const t = useTranslations("Home");
  const name = pick(locale, person.nameBn, person.name);
  const role = t(`roles.${person.roles[0] as Role}`);

  return (
    <div className="flex items-start justify-between gap-3">
      <Link href={`/u/${person.id}`} className="group flex min-w-0 items-center gap-3">
        <UserAvatar
          src={person.avatarUrl}
          name={name}
          className="size-10 shrink-0"
          textClassName="text-sm"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">
            {name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {role} · {pick(locale, person.cityBn, person.city)} · ★ {formatRating(person.rating, locale)}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        {person.id !== activeUserId ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (!activeUserId) {
                  onRequireSignIn();
                  return;
                }
                openChatWindow(person.id);
              }}
              className="grid size-8 place-items-center rounded-full border border-white/10 bg-[#242526] text-foreground hover:border-primary"
              aria-label={t("messageBtn")}
              title={t("messageBtn")}
            >
              <MessageCircle className="size-3.5 text-primary" />
            </button>
            <button
              type="button"
              aria-pressed={following}
              onClick={() => {
                if (!activeUserId) {
                  onRequireSignIn();
                  return;
                }
                void mutateCommunity({
                  action: "toggleFollow",
                  followerId: activeUserId,
                  musicianId: person.id,
                });
              }}
              className={
                following
                  ? "inline-flex items-center gap-1 rounded-full border border-white/15 bg-[#242526] px-2.5 py-1 text-xs font-medium text-foreground"
                  : "inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/25"
              }
            >
              {following ? <UserCheck className="size-3" /> : <UserPlus className="size-3" />}
              <span>{following ? t("followingBtn") : t("followBtn")}</span>
            </button>
          </>
        ) : (
          <Link
            href={`/u/${person.id}`}
            className="rounded-full border border-white/10 bg-[#242526] px-2.5 py-1 text-xs font-medium text-foreground"
          >
            {t("openProfile")}
          </Link>
        )}
      </div>
    </div>
  );
}

function PersonCard({
  person,
  locale,
  following,
  activeUserId,
  onRequireSignIn,
}: {
  person: Musician;
  locale: string;
  following: boolean;
  activeUserId: string | null;
  onRequireSignIn: () => void;
}) {
  const t = useTranslations("Home");
  const name = pick(locale, person.nameBn, person.name);
  const role = t(`roles.${person.roles[0] as Role}`);

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#18191a] transition-colors hover:border-primary/70">
      <div>
        <div className="relative h-28 w-full overflow-hidden">
          {person.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.coverUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `center ${person.coverPositionY ?? 50}%` }}
            />
          ) : (
            <DefaultCoverArt
              seed={person.id + person.name}
              role={person.roles[0]}
              positionY={person.coverPositionY ?? 50}
              compact
            />
          )}
        </div>
        <div className="p-5 pt-4">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/u/${person.id}`} className="group flex min-w-0 items-center gap-3">
              <UserAvatar
                src={person.avatarUrl}
                name={name}
                className="size-12"
                textClassName="text-base"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground group-hover:text-primary">
                  {name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {role} · {pick(locale, person.cityBn, person.city)}
                </span>
              </span>
            </Link>

            {person.id !== activeUserId ? (
              <button
                type="button"
                aria-pressed={following}
                onClick={() => {
                  if (!activeUserId) {
                    onRequireSignIn();
                    return;
                  }
                  void mutateCommunity({
                    action: "toggleFollow",
                    followerId: activeUserId,
                    musicianId: person.id,
                  });
                }}
                className={
                  following
                    ? "shrink-0 rounded-full border border-white/15 bg-black/70 px-3 py-1 text-xs text-foreground"
                    : "shrink-0 rounded-full bg-gradient-to-r from-[#ff5500] via-[#ff7722] to-[#ffaa33] px-3 py-1 text-xs font-semibold text-[#1a0900]"
                }
              >
                {following ? t("followingBtn") : t("followBtn")}
              </button>
            ) : null}
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {pick(locale, person.bioBn, person.bio)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <StarRating value={person.rating} label={t("rating")} />
          <span>{formatRating(person.rating, locale)}</span>
          <span>
            · {formatCount(person.followers, locale)} {t("followers")}
          </span>
        </span>
        <div className="flex items-center gap-2">
          {person.id !== activeUserId ? (
            <button
              type="button"
              onClick={() => {
                if (!activeUserId) {
                  onRequireSignIn();
                  return;
                }
                openChatWindow(person.id);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-foreground hover:border-primary"
            >
              <MessageCircle className="size-3 text-primary" />
              {t("messageBtn")}
            </button>
          ) : null}
          <Link
            href={`/u/${person.id}`}
            className="font-medium text-foreground underline decoration-primary underline-offset-4"
          >
            {t("openProfile")}
          </Link>
        </div>
      </div>
    </div>
  );
}
