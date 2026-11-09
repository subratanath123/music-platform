import { Pool } from "pg";
import type { Role } from "@/data/catalog";
import type {
  ChatMessage,
  CommunityDatabase,
  CommunityPost,
  DbUser,
  MediaAttachmentKind,
  OrderReview,
  OrderStatus,
  PostCategory,
  ServiceOrder,
  ShowcaseItem,
} from "@/lib/db-types";
import {
  notifyOrderCompletedEmail,
  notifyOrderPlacedEmail,
  notifyUnseenMessageEmail,
} from "@/lib/mailer";
import {
  buildEmbeddingVector,
  buildUserSearchDocument,
  extractReasonsForMatch,
  toPgVectorLiteral,
  type SemanticMusicianHit,
} from "@/lib/vector-search";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://surshongi:surshongi_pass@localhost:5432/surshongi_db";

declare global {
  var __surshongiPgPool: Pool | undefined;
  var __surshongiPgSchemaVersion: number | undefined;
}

const SCHEMA_VERSION = 6;

function getPool(): Pool {
  if (!globalThis.__surshongiPgPool) {
    globalThis.__surshongiPgPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return globalThis.__surshongiPgPool;
}

const INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_sub TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  cover_position_y INTEGER NOT NULL DEFAULT 50,
  profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  name TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  city TEXT NOT NULL,
  city_bn TEXT NOT NULL,
  city_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  roles JSONB NOT NULL DEFAULT '["vocalist"]'::jsonb,
  instruments JSONB NOT NULL DEFAULT '[]'::jsonb,
  instruments_bn JSONB NOT NULL DEFAULT '[]'::jsonb,
  genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  genres_bn JSONB NOT NULL DEFAULT '[]'::jsonb,
  genre_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  languages JSONB NOT NULL DEFAULT '["Bangla","English"]'::jsonb,
  languages_bn JSONB NOT NULL DEFAULT '["বাংলা","ইংরেজি"]'::jsonb,
  language_terms JSONB NOT NULL DEFAULT '["bangla","বাংলা","english","ইংরেজি"]'::jsonb,
  bio TEXT NOT NULL DEFAULT '',
  bio_bn TEXT NOT NULL DEFAULT '',
  price_from_bdt INTEGER,
  turnaround_days INTEGER,
  years INTEGER,
  open_to_work BOOLEAN NOT NULL DEFAULT TRUE,
  vocal_range TEXT,
  vocal_range_bn TEXT,
  range_terms JSONB,
  daw TEXT,
  daw_terms JSONB,
  mood JSONB NOT NULL DEFAULT '[]'::jsonb,
  mood_bn JSONB NOT NULL DEFAULT '[]'::jsonb,
  mood_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  followers INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS showcase_items (
  id TEXT PRIMARY KEY,
  musician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('youtube', 'audio')),
  title TEXT NOT NULL,
  title_bn TEXT NOT NULL,
  youtube_id TEXT,
  audio_src TEXT,
  duration TEXT NOT NULL DEFAULT 'Audio',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  musician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('work', 'offering', 'collab')),
  title TEXT NOT NULL,
  title_bn TEXT NOT NULL,
  text TEXT NOT NULL,
  text_bn TEXT NOT NULL,
  role_tag TEXT NOT NULL,
  price_bdt INTEGER,
  youtube_id TEXT,
  audio_src TEXT,
  loves INTEGER NOT NULL DEFAULT 0,
  loved_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  musician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, musician_id)
);

CREATE TABLE IF NOT EXISTS user_ratings (
  rater_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  musician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rater_id, musician_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  email_notified_at TIMESTAMPTZ
);

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS email_notified_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_kind TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_position_y INTEGER NOT NULL DEFAULT 50;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bkash_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS service_orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  musician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_bdt INTEGER NOT NULL DEFAULT 0,
  delivery_days INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'delivered', 'completed')),
  bkash_trx_id TEXT,
  attachment_url TEXT,
  attachment_kind TEXT,
  attachment_name TEXT,
  delivery_note TEXT,
  delivery_attachment_url TEXT,
  delivery_attachment_kind TEXT,
  delivery_attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS bkash_trx_id TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS attachment_kind TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS delivery_attachment_url TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS delivery_attachment_kind TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS delivery_attachment_name TEXT;

CREATE TABLE IF NOT EXISTS order_reviews (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  musician_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  order_title TEXT NOT NULL DEFAULT '',
  price_bdt INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_vector_index (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  document_text TEXT NOT NULL,
  embedding vector(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_vector_hnsw
  ON user_vector_index USING hnsw (embedding vector_cosine_ops);
`;

async function ensureSchema(): Promise<Pool> {
  const pool = getPool();
  if (globalThis.__surshongiPgSchemaVersion !== SCHEMA_VERSION) {
    await pool.query(INIT_SQL);
    globalThis.__surshongiPgSchemaVersion = SCHEMA_VERSION;
  }
  return pool;
}

export async function readDatabase(): Promise<CommunityDatabase> {
  const pool = await ensureSchema();
  void checkAndNotifyUnseenMessagesInPg(pool);

  const [usersRes, colRes, postsRes, followsRes, ratingsRes, messagesRes, ordersRes, reviewsRes] =
    await Promise.all([
      pool.query("SELECT * FROM users ORDER BY created_at DESC"),
      pool.query("SELECT * FROM showcase_items ORDER BY created_at DESC"),
      pool.query("SELECT * FROM community_posts ORDER BY created_at DESC"),
      pool.query("SELECT follower_id, musician_id FROM user_follows"),
      pool.query("SELECT rater_id, musician_id, rating FROM user_ratings"),
      pool.query("SELECT * FROM chat_messages ORDER BY created_at ASC"),
      pool.query("SELECT * FROM service_orders ORDER BY created_at DESC"),
      pool.query("SELECT * FROM order_reviews ORDER BY created_at DESC"),
    ]);

  const users: DbUser[] = usersRes.rows.map((r) => ({
    id: String(r.id),
    email: r.email ?? undefined,
    googleSub: r.google_sub ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    coverUrl: r.cover_url ?? undefined,
    coverPositionY: r.cover_position_y !== null && r.cover_position_y !== undefined ? Number(r.cover_position_y) : 50,
    phone: r.phone ?? undefined,
    bkashNumber: r.bkash_number ?? undefined,
    isPrivate: Boolean(r.is_private),
    profileCompleted: Boolean(r.profile_completed),
    name: String(r.name),
    nameBn: String(r.name_bn),
    city: String(r.city),
    cityBn: String(r.city_bn),
    cityTerms: Array.isArray(r.city_terms) ? r.city_terms : [],
    roles: (Array.isArray(r.roles) ? r.roles : ["vocalist"]) as Role[],
    instruments: Array.isArray(r.instruments) ? r.instruments : [],
    instrumentsBn: Array.isArray(r.instruments_bn) ? r.instruments_bn : [],
    genres: Array.isArray(r.genres) ? r.genres : [],
    genresBn: Array.isArray(r.genres_bn) ? r.genres_bn : [],
    genreTerms: Array.isArray(r.genre_terms) ? r.genre_terms : [],
    languages: Array.isArray(r.languages) ? r.languages : ["Bangla", "English"],
    languagesBn: Array.isArray(r.languages_bn) ? r.languages_bn : ["বাংলা", "ইংরেজি"],
    languageTerms: Array.isArray(r.language_terms)
      ? r.language_terms
      : ["bangla", "বাংলা", "english", "ইংরেজি"],
    bio: String(r.bio ?? ""),
    bioBn: String(r.bio_bn ?? ""),
    priceFromBdt: r.price_from_bdt !== null ? Number(r.price_from_bdt) : undefined,
    turnaroundDays: r.turnaround_days !== null ? Number(r.turnaround_days) : undefined,
    years: r.years !== null ? Number(r.years) : undefined,
    openToWork: Boolean(r.open_to_work),
    vocalRange: r.vocal_range ?? undefined,
    vocalRangeBn: r.vocal_range_bn ?? undefined,
    rangeTerms: Array.isArray(r.range_terms) ? r.range_terms : undefined,
    daw: r.daw ?? undefined,
    dawTerms: Array.isArray(r.daw_terms) ? r.daw_terms : undefined,
    mood: Array.isArray(r.mood) ? r.mood : [],
    moodBn: Array.isArray(r.mood_bn) ? r.mood_bn : [],
    moodTerms: Array.isArray(r.mood_terms) ? r.mood_terms : [],
    followers: Number(r.followers ?? 0),
    rating: Number(r.rating ?? 5.0),
    ratingCount: Number(r.rating_count ?? 0),
  }));

  const collections: ShowcaseItem[] = colRes.rows.map((r) => ({
    id: String(r.id),
    musicianId: String(r.musician_id),
    kind: r.kind as "youtube" | "audio",
    title: String(r.title),
    titleBn: String(r.title_bn),
    youtubeId: r.youtube_id ?? undefined,
    audioSrc: r.audio_src ?? undefined,
    duration: String(r.duration ?? "Audio"),
    createdAt: new Date(r.created_at).toISOString(),
  }));

  const posts: CommunityPost[] = postsRes.rows.map((r) => ({
    id: String(r.id),
    musicianId: String(r.musician_id),
    category: r.category as PostCategory,
    title: String(r.title),
    titleBn: String(r.title_bn),
    text: String(r.text),
    textBn: String(r.text_bn),
    roleTag: r.role_tag as Role,
    priceBdt: r.price_bdt !== null ? Number(r.price_bdt) : undefined,
    youtubeId: r.youtube_id ?? undefined,
    audioSrc: r.audio_src ?? undefined,
    loves: Number(r.loves ?? 0),
    lovedBy: Array.isArray(r.loved_by) ? r.loved_by : [],
    createdAt: new Date(r.created_at).toISOString(),
  }));

  const follows: Record<string, string[]> = {};
  for (const r of followsRes.rows) {
    const fId = String(r.follower_id);
    const mId = String(r.musician_id);
    if (!follows[fId]) follows[fId] = [];
    follows[fId].push(mId);
  }

  const ratings: Record<string, Record<string, number>> = {};
  for (const r of ratingsRes.rows) {
    const raterId = String(r.rater_id);
    const musicianId = String(r.musician_id);
    if (!ratings[raterId]) ratings[raterId] = {};
    ratings[raterId][musicianId] = Number(r.rating);
  }

  const messages: ChatMessage[] = messagesRes.rows.map((r) => ({
    id: String(r.id),
    fromId: String(r.from_id),
    toId: String(r.to_id),
    text: String(r.text),
    attachmentUrl: r.attachment_url ?? undefined,
    attachmentKind: (r.attachment_kind as MediaAttachmentKind) ?? undefined,
    attachmentName: r.attachment_name ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    readAt: r.read_at ? new Date(r.read_at).toISOString() : undefined,
    emailNotifiedAt: r.email_notified_at ? new Date(r.email_notified_at).toISOString() : undefined,
  }));

  const orders: ServiceOrder[] = ordersRes.rows.map((r) => ({
    id: String(r.id),
    buyerId: String(r.buyer_id),
    musicianId: String(r.musician_id),
    title: String(r.title),
    description: String(r.description ?? ""),
    priceBdt: Number(r.price_bdt ?? 0),
    deliveryDays: Number(r.delivery_days ?? 3),
    status: (r.status as OrderStatus) ?? "active",
    bkashTrxId: r.bkash_trx_id ?? undefined,
    attachmentUrl: r.attachment_url ?? undefined,
    attachmentKind: (r.attachment_kind as MediaAttachmentKind) ?? undefined,
    attachmentName: r.attachment_name ?? undefined,
    deliveryNote: r.delivery_note ?? undefined,
    deliveryAttachmentUrl: r.delivery_attachment_url ?? undefined,
    deliveryAttachmentKind: (r.delivery_attachment_kind as MediaAttachmentKind) ?? undefined,
    deliveryAttachmentName: r.delivery_attachment_name ?? undefined,
    createdAt: new Date(r.created_at).toISOString(),
    deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : undefined,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
  }));

  const reviews: OrderReview[] = reviewsRes.rows.map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id),
    buyerId: String(r.buyer_id),
    musicianId: String(r.musician_id),
    rating: Number(r.rating ?? 5),
    comment: String(r.comment ?? ""),
    orderTitle: String(r.order_title ?? ""),
    priceBdt: Number(r.price_bdt ?? 0),
    createdAt: new Date(r.created_at).toISOString(),
  }));

  return {
    users,
    collections,
    posts,
    follows,
    ratings,
    messages,
    orders,
    reviews,
  };
}

export async function upsertUserInPg(user: DbUser): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `INSERT INTO users (
      id, email, google_sub, avatar_url, cover_url, profile_completed,
      name, name_bn, city, city_bn, city_terms,
      roles, instruments, instruments_bn, genres, genres_bn, genre_terms,
      languages, languages_bn, language_terms, bio, bio_bn,
      price_from_bdt, turnaround_days, years, open_to_work,
      mood, mood_bn, mood_terms, followers, rating, rating_count,
      phone, bkash_number, is_private
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11::jsonb,
      $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
      $18::jsonb, $19::jsonb, $20::jsonb, $21, $22,
      $23, $24, $25, $26,
      $27::jsonb, $28::jsonb, $29::jsonb, $30, $31, $32,
      $33, $34, $35
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      google_sub = EXCLUDED.google_sub,
      avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
      cover_url = COALESCE(EXCLUDED.cover_url, users.cover_url),
      profile_completed = EXCLUDED.profile_completed,
      name = EXCLUDED.name,
      name_bn = EXCLUDED.name_bn,
      city = EXCLUDED.city,
      city_bn = EXCLUDED.city_bn,
      city_terms = EXCLUDED.city_terms,
      roles = EXCLUDED.roles,
      instruments = EXCLUDED.instruments,
      instruments_bn = EXCLUDED.instruments_bn,
      genres = EXCLUDED.genres,
      genres_bn = EXCLUDED.genres_bn,
      genre_terms = EXCLUDED.genre_terms,
      bio = EXCLUDED.bio,
      bio_bn = EXCLUDED.bio_bn,
      price_from_bdt = EXCLUDED.price_from_bdt,
      turnaround_days = EXCLUDED.turnaround_days,
      open_to_work = EXCLUDED.open_to_work,
      followers = EXCLUDED.followers,
      rating = EXCLUDED.rating,
      rating_count = EXCLUDED.rating_count,
      phone = EXCLUDED.phone,
      bkash_number = EXCLUDED.bkash_number,
      is_private = EXCLUDED.is_private`,
    [
      user.id,
      user.email ?? null,
      user.googleSub ?? null,
      user.avatarUrl ?? null,
      user.coverUrl ?? null,
      user.profileCompleted,
      user.name,
      user.nameBn,
      user.city,
      user.cityBn,
      JSON.stringify(user.cityTerms),
      JSON.stringify(user.roles),
      JSON.stringify(user.instruments),
      JSON.stringify(user.instrumentsBn),
      JSON.stringify(user.genres),
      JSON.stringify(user.genresBn),
      JSON.stringify(user.genreTerms),
      JSON.stringify(user.languages),
      JSON.stringify(user.languagesBn),
      JSON.stringify(user.languageTerms),
      user.bio,
      user.bioBn,
      user.priceFromBdt ?? null,
      user.turnaroundDays ?? null,
      user.years ?? null,
      user.openToWork,
      JSON.stringify(user.mood),
      JSON.stringify(user.moodBn),
      JSON.stringify(user.moodTerms),
      user.followers,
      user.rating,
      user.ratingCount,
      user.phone ?? null,
      user.bkashNumber ?? null,
      Boolean(user.isPrivate),
    ],
  );
  await syncUserVectorIndexInPg(user.id);
}

export async function updateUserVisibilityInPg(
  userId: string,
  isPrivate: boolean,
): Promise<void> {
  const pool = await ensureSchema();
  await pool.query("UPDATE users SET is_private = $1 WHERE id = $2", [
    Boolean(isPrivate),
    userId,
  ]);
}

export async function updateUserPaymentContactsInPg(
  userId: string,
  phone?: string,
  bkashNumber?: string,
): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `UPDATE users
     SET phone = $1,
         bkash_number = $2
     WHERE id = $3`,
    [phone?.trim() || null, bkashNumber?.trim() || null, userId],
  );
}

export async function updateUserPhotosInPg(
  userId: string,
  avatarUrl?: string,
  coverUrl?: string,
  coverPositionY?: number,
): Promise<void> {
  const pool = await ensureSchema();
  if (avatarUrl !== undefined) {
    await pool.query("UPDATE users SET avatar_url = $1 WHERE id = $2", [avatarUrl, userId]);
  }
  if (coverUrl !== undefined) {
    await pool.query("UPDATE users SET cover_url = $1 WHERE id = $2", [coverUrl, userId]);
  }
  if (coverPositionY !== undefined) {
    const clamped = Math.max(0, Math.min(100, Math.round(coverPositionY)));
    await pool.query("UPDATE users SET cover_position_y = $1 WHERE id = $2", [
      clamped,
      userId,
    ]);
  }
}

export async function insertShowcaseItemInPg(item: ShowcaseItem): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `INSERT INTO showcase_items (
      id, musician_id, kind, title, title_bn, youtube_id, audio_src, duration, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      item.id,
      item.musicianId,
      item.kind,
      item.title,
      item.titleBn,
      item.youtubeId ?? null,
      item.audioSrc ?? null,
      item.duration,
      item.createdAt,
    ],
  );
  await syncUserVectorIndexInPg(item.musicianId);
}

export async function insertPostInPg(post: CommunityPost): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `INSERT INTO community_posts (
      id, musician_id, category, title, title_bn, text, text_bn,
      role_tag, price_bdt, youtube_id, audio_src, loves, loved_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)`,
    [
      post.id,
      post.musicianId,
      post.category,
      post.title,
      post.titleBn,
      post.text,
      post.textBn,
      post.roleTag,
      post.priceBdt ?? null,
      post.youtubeId ?? null,
      post.audioSrc ?? null,
      post.loves,
      JSON.stringify(post.lovedBy),
      post.createdAt,
    ],
  );
  await syncUserVectorIndexInPg(post.musicianId);
}

export async function updatePostInPg({
  postId,
  musicianId,
  category,
  title,
  text,
  roleTag,
  priceBdt,
  youtubeId,
  audioSrc,
}: {
  postId: string;
  musicianId: string;
  category: PostCategory;
  title: string;
  text: string;
  roleTag: Role;
  priceBdt?: number;
  youtubeId?: string;
  audioSrc?: string;
}): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `UPDATE community_posts
     SET category = $3,
         title = $4,
         title_bn = $4,
         text = $5,
         text_bn = $5,
         role_tag = $6,
         price_bdt = $7,
         youtube_id = $8,
         audio_src = $9
     WHERE id = $1 AND musician_id = $2`,
    [
      postId,
      musicianId,
      category,
      title,
      text,
      roleTag,
      priceBdt ?? null,
      youtubeId ?? null,
      audioSrc ?? null,
    ],
  );
  await syncUserVectorIndexInPg(musicianId);
}

export async function deletePostInPg(postId: string, musicianId: string): Promise<void> {
  const pool = await ensureSchema();
  await pool.query("DELETE FROM community_posts WHERE id = $1 AND musician_id = $2", [
    postId,
    musicianId,
  ]);
  await syncUserVectorIndexInPg(musicianId);
}

export async function toggleLoveInPg(postId: string, userId: string): Promise<void> {
  const pool = await ensureSchema();
  const res = await pool.query(
    "SELECT loves, loved_by FROM community_posts WHERE id = $1",
    [postId],
  );
  if (res.rowCount === 0) return;
  const row = res.rows[0];
  const currentLovedBy: string[] = Array.isArray(row.loved_by) ? row.loved_by : [];
  const already = currentLovedBy.includes(userId);
  const nextLovedBy = already
    ? currentLovedBy.filter((id) => id !== userId)
    : [...currentLovedBy, userId];
  const nextLoves = Math.max(0, Number(row.loves ?? 0) + (already ? -1 : 1));
  await pool.query(
    "UPDATE community_posts SET loves = $1, loved_by = $2::jsonb WHERE id = $3",
    [nextLoves, JSON.stringify(nextLovedBy), postId],
  );
}

export async function toggleFollowInPg(followerId: string, musicianId: string): Promise<void> {
  const pool = await ensureSchema();
  const existing = await pool.query(
    "SELECT 1 FROM user_follows WHERE follower_id = $1 AND musician_id = $2",
    [followerId, musicianId],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    await pool.query(
      "DELETE FROM user_follows WHERE follower_id = $1 AND musician_id = $2",
      [followerId, musicianId],
    );
  } else {
    await pool.query(
      "INSERT INTO user_follows (follower_id, musician_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [followerId, musicianId],
    );
  }
  await pool.query(
    `UPDATE users SET followers = (
      SELECT COUNT(*)::int FROM user_follows WHERE musician_id = $1
    ) WHERE id = $1`,
    [musicianId],
  );
}

export async function rateMusicianInPg(
  raterId: string,
  musicianId: string,
  rating: number,
): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `INSERT INTO user_ratings (rater_id, musician_id, rating, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (rater_id, musician_id)
     DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()`,
    [raterId, musicianId, rating],
  );
  await pool.query(
    `UPDATE users SET
      rating_count = (SELECT COUNT(*)::int FROM user_ratings WHERE musician_id = $1),
      rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM user_ratings WHERE musician_id = $1), 5.0)
     WHERE id = $1`,
    [musicianId],
  );
}

export async function insertMessageInPg(msg: ChatMessage): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `INSERT INTO chat_messages (
       id, from_id, to_id, text, attachment_url, attachment_kind, attachment_name, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      msg.id,
      msg.fromId,
      msg.toId,
      msg.text,
      msg.attachmentUrl ?? null,
      msg.attachmentKind ?? null,
      msg.attachmentName ?? null,
      msg.createdAt,
    ],
  );
}

export async function markMessagesSeenInPg(viewerId: string, peerId: string): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `UPDATE chat_messages
     SET read_at = NOW()
     WHERE to_id = $1 AND from_id = $2 AND read_at IS NULL`,
    [viewerId, peerId],
  );
}

let lastUnseenCheckAt = 0;

export async function checkAndNotifyUnseenMessagesInPg(existingPool?: Pool): Promise<number> {
  const now = Date.now();
  if (now - lastUnseenCheckAt < 60_000) return 0;
  lastUnseenCheckAt = now;

  try {
    const pool = existingPool ?? (await ensureSchema());
    const unseenRes = await pool.query(
      `SELECT
         m.id,
         m.text,
         m.from_id,
         m.to_id,
         sender.name AS sender_name,
         recipient.name AS recipient_name,
         recipient.email AS recipient_email
       FROM chat_messages m
       JOIN users sender ON sender.id = m.from_id
       JOIN users recipient ON recipient.id = m.to_id
       WHERE m.read_at IS NULL
         AND m.email_notified_at IS NULL
         AND m.created_at <= NOW() - INTERVAL '1 hour'
       ORDER BY m.created_at ASC
       LIMIT 20`,
    );

    let sentCount = 0;
    for (const row of unseenRes.rows) {
      const ok = await notifyUnseenMessageEmail({
        recipientEmail: row.recipient_email ?? undefined,
        recipientName: String(row.recipient_name),
        senderName: String(row.sender_name),
        messageText: String(row.text),
        recipientId: String(row.to_id),
      });
      await pool.query(
        "UPDATE chat_messages SET email_notified_at = NOW() WHERE id = $1",
        [row.id],
      );
      if (ok) sentCount += 1;
    }
    return sentCount;
  } catch {
    return 0;
  }
}

export async function createOrderInPg(order: ServiceOrder): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `INSERT INTO service_orders (
       id, buyer_id, musician_id, title, description, price_bdt, delivery_days, status,
       bkash_trx_id, attachment_url, attachment_kind, attachment_name, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      order.id,
      order.buyerId,
      order.musicianId,
      order.title,
      order.description,
      order.priceBdt,
      order.deliveryDays,
      order.status,
      order.bkashTrxId ?? null,
      order.attachmentUrl ?? null,
      order.attachmentKind ?? null,
      order.attachmentName ?? null,
      order.createdAt,
    ],
  );

  // Also log an automatic chat message and trigger Gmail notification to the musician
  const usersRes = await pool.query(
    "SELECT id, name, email FROM users WHERE id = ANY($1::text[])",
    [[order.buyerId, order.musicianId]],
  );
  const buyer = usersRes.rows.find((u) => u.id === order.buyerId);
  const musician = usersRes.rows.find((u) => u.id === order.musicianId);

  if (musician && buyer) {
    void notifyOrderPlacedEmail({
      musicianEmail: musician.email ?? undefined,
      musicianName: String(musician.name),
      buyerName: String(buyer.name),
      orderTitle: order.title,
      priceBdt: order.priceBdt,
      deliveryDays: order.deliveryDays,
      description: order.description,
      musicianId: order.musicianId,
    });
  }
}

export async function markOrderDeliveredInPg(
  orderId: string,
  musicianId: string,
  deliveryNote?: string,
  deliveryAttachmentUrl?: string,
  deliveryAttachmentKind?: MediaAttachmentKind,
  deliveryAttachmentName?: string,
): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(
    `UPDATE service_orders
     SET status = 'delivered',
         delivery_note = COALESCE($3, delivery_note),
         delivery_attachment_url = COALESCE($4, delivery_attachment_url),
         delivery_attachment_kind = COALESCE($5, delivery_attachment_kind),
         delivery_attachment_name = COALESCE($6, delivery_attachment_name),
         delivered_at = NOW()
     WHERE id = $1 AND musician_id = $2 AND status = 'active'`,
    [
      orderId,
      musicianId,
      deliveryNote?.trim() || null,
      deliveryAttachmentUrl?.trim() || null,
      deliveryAttachmentKind ?? null,
      deliveryAttachmentName?.trim() || null,
    ],
  );
}

export async function completeOrderAndReviewInPg({
  orderId,
  buyerId,
  rating,
  comment,
}: {
  orderId: string;
  buyerId: string;
  rating: number;
  comment: string;
}): Promise<{ ok: boolean; error?: string }> {
  const pool = await ensureSchema();
  const orderRes = await pool.query("SELECT * FROM service_orders WHERE id = $1", [orderId]);
  if (orderRes.rowCount === 0) {
    return { ok: false, error: "Order not found." };
  }

  const orderRow = orderRes.rows[0];
  // Strictly enforce that ONLY the user who placed the order (buyer_id) can mark it completed
  if (String(orderRow.buyer_id) !== buyerId) {
    return {
      ok: false,
      error: "Only the user who placed this order can mark it as completed.",
    };
  }

  const musicianId = String(orderRow.musician_id);
  const clampedRating = Math.max(1, Math.min(5, Math.round(rating)));
  const cleanComment = comment.trim() || "Great collaboration and timely delivery!";

  await pool.query(
    `UPDATE service_orders
     SET status = 'completed',
         completed_at = NOW()
     WHERE id = $1 AND buyer_id = $2`,
    [orderId, buyerId],
  );

  const reviewId = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await pool.query(
    `INSERT INTO order_reviews (
       id, order_id, buyer_id, musician_id, rating, comment, order_title, price_bdt, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (order_id)
     DO UPDATE SET
       rating = EXCLUDED.rating,
       comment = EXCLUDED.comment,
       created_at = NOW()`,
    [
      reviewId,
      orderId,
      buyerId,
      musicianId,
      clampedRating,
      cleanComment,
      String(orderRow.title),
      Number(orderRow.price_bdt ?? 0),
    ],
  );

  // Sync user_ratings and recalculate overall musician rating & rating_count from both order_reviews and user_ratings
  await pool.query(
    `INSERT INTO user_ratings (rater_id, musician_id, rating, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (rater_id, musician_id)
     DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()`,
    [buyerId, musicianId, clampedRating],
  );

  await pool.query(
    `UPDATE users SET
       rating_count = (
         SELECT COUNT(*)::int FROM (
           SELECT rater_id, rating FROM user_ratings WHERE musician_id = $1
           UNION ALL
           SELECT buyer_id, rating FROM order_reviews WHERE musician_id = $1
         ) combined
       ),
       rating = COALESCE((
         SELECT ROUND(AVG(rating)::numeric, 1) FROM (
           SELECT rating FROM user_ratings WHERE musician_id = $1
           UNION ALL
           SELECT rating FROM order_reviews WHERE musician_id = $1
         ) combined
       ), 5.0)
     WHERE id = $1`,
    [musicianId],
  );

  await syncUserVectorIndexInPg(musicianId);

  const usersRes = await pool.query(
    "SELECT id, name, email FROM users WHERE id = ANY($1::text[])",
    [[buyerId, musicianId]],
  );
  const buyer = usersRes.rows.find((u) => u.id === buyerId);
  const musician = usersRes.rows.find((u) => u.id === musicianId);

  if (musician && buyer) {
    void notifyOrderCompletedEmail({
      musicianEmail: musician.email ?? undefined,
      buyerEmail: buyer.email ?? undefined,
      musicianName: String(musician.name),
      buyerName: String(buyer.name),
      orderTitle: String(orderRow.title),
      priceBdt: Number(orderRow.price_bdt ?? 0),
      rating: clampedRating,
      reviewComment: cleanComment,
      musicianId,
    });
  }

  return { ok: true };
}

export async function syncUserVectorIndexInPg(targetUserId?: string): Promise<void> {
  const pool = await ensureSchema();
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE TABLE IF NOT EXISTS user_vector_index (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      document_text TEXT NOT NULL,
      embedding vector(128) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const db = await readDatabase();
  const usersToIndex = targetUserId
    ? db.users.filter((u) => u.id === targetUserId)
    : db.users;

  for (const user of usersToIndex) {
    const docText = buildUserSearchDocument(user, db.collections, db.posts);
    const vec = buildEmbeddingVector(docText);
    const literal = toPgVectorLiteral(vec);
    await pool.query(
      `INSERT INTO user_vector_index (user_id, document_text, embedding, updated_at)
       VALUES ($1, $2, $3::vector, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         document_text = EXCLUDED.document_text,
         embedding = EXCLUDED.embedding,
         updated_at = NOW()`,
      [user.id, docText, literal],
    );
  }
}

export async function semanticSearchMusiciansInPg(
  query: string,
): Promise<SemanticMusicianHit[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const pool = await ensureSchema();
  // Ensure all users are indexed in user_vector_index
  await syncUserVectorIndexInPg();

  const db = await readDatabase();
  if (db.users.length === 0) return [];

  const queryVec = buildEmbeddingVector(cleanQuery);
  const queryVecLiteral = toPgVectorLiteral(queryVec);

  // Query pgvector cosine similarity + pg_trgm word_similarity directly in PostgreSQL
  const vectorRes = await pool.query(
    `SELECT
       user_id,
       1 - (embedding <=> $1::vector) AS vector_sim,
       word_similarity($2, document_text) AS trgm_sim
     FROM user_vector_index
     ORDER BY embedding <=> $1::vector ASC`,
    [queryVecLiteral, cleanQuery.toLowerCase()],
  );

  const userMap = new Map<string, DbUser>();
  for (const u of db.users) {
    userMap.set(u.id, u);
  }

  const hits: SemanticMusicianHit[] = [];

  for (const row of vectorRes.rows) {
    const user = userMap.get(String(row.user_id));
    if (!user || !user.profileCompleted || user.isPrivate) continue;

    const vectorSim = Math.max(0, Number(row.vector_sim ?? 0));
    const trgmSim = Math.max(0, Number(row.trgm_sim ?? 0));
    const evidence = extractReasonsForMatch(cleanQuery, user, db.collections, db.posts);

    // Only keep profiles with real evidence: a lexical/concept match or a strong vector match.
    const strongVector = vectorSim >= 0.45 || trgmSim >= 0.6;
    if (evidence.coverage === 0 && !strongVector) continue;

    const score = evidence.coverage * 0.7 + vectorSim * 0.2 + trgmSim * 0.1;
    if (score < 0.2) continue;

    const userCols = db.collections.filter((c) => c.musicianId === user.id);
    hits.push({
      user,
      similarity: Math.min(99, Math.round(score * 100)),
      reasons: evidence.reasons.length > 0 ? evidence.reasons : ["semantic"],
      matchedText: evidence.matchedText,
      matchedSource: evidence.matchedSource,
      matchedTerms: evidence.matchedTerms,
      showcaseCount: userCols.length,
      thumbnailYoutubeId: userCols.find((c) => c.youtubeId)?.youtubeId,
    });
  }

  hits.sort((a, b) => b.similarity - a.similarity || b.user.rating - a.user.rating);
  return hits;
}

