-- SurShongi PostgreSQL Schema Initialization

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  google_sub TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  cover_position_y INTEGER NOT NULL DEFAULT 50,
  phone TEXT,
  bkash_number TEXT,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
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
  attachment_url TEXT,
  attachment_kind TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  email_notified_at TIMESTAMPTZ
);

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

CREATE INDEX IF NOT EXISTS idx_showcase_musician ON showcase_items(musician_id);
CREATE INDEX IF NOT EXISTS idx_posts_musician ON community_posts(musician_id);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON chat_messages(from_id, to_id);
CREATE INDEX IF NOT EXISTS idx_orders_pair ON service_orders(buyer_id, musician_id);
CREATE INDEX IF NOT EXISTS idx_reviews_musician ON order_reviews(musician_id);

CREATE TABLE IF NOT EXISTS user_vector_index (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  document_text TEXT NOT NULL,
  embedding vector(128) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_vector_hnsw
  ON user_vector_index USING hnsw (embedding vector_cosine_ops);

