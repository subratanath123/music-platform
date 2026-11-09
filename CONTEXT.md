# SurShongi (সুরসঙ্গী) — Project Context & Architecture

> Updated automatically while working. This file tracks the current product requirements, database schema, API routes, and implementation progress.

## 1. Product Vision
SurShongi (সুরসঙ্গী) is a community and collaboration platform for musicians in Bangladesh:
- **Multitrack Studio (`/editor`, nav label "Cut")** — browser DAW built on the Web Audio API:
  - `src/components/editor/daw-engine.ts`: project model (tracks → clips with source in/out, timeline offset, clip gain, fade in/out), `AudioEngine` (one `AudioContext`; every clip is scheduled against the same start time so all tracks play sample-synced; per-track gain → stereo panner → master → analyser; live mute/solo/volume/pan via `updateMix`; metronome clicks scheduled on the audio clock), and `renderMix` (`OfflineAudioContext` mixdown using the same graph).
  - `src/components/editor/daw-parts.tsx`: track headers (name, M/S, volume in dB, pan), time ruler (click to seek, drag to set a loop), clip view (waveform from precomputed peaks, drag to move incl. across tracks, edge trim handles, corner fade handles).
  - `src/components/editor/mix-editor.tsx`: transport (play/pause, stop, go to start, record overdub via `MediaRecorder` with latency compensation, BPM, click, snap-to-beat, loop, zoom, master volume + meter, WAV export), toolbar (import files / drag-drop anywhere, import from community audio showcases, add track, split at playhead, duplicate, delete, undo/redo), clip inspector with exact numeric values, and "Render & send mix" with a scalable **Choose Musician Modal** (displays the user's **Following** list up front plus an optional search input that queries `/community-search` + local profile matching, then renders WAV → `/community-upload` → chat message with inside-chatbox audio attachment).
  - Shortcuts: Space, S, Delete, Ctrl+D, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, L, Home. `?src=/uploads/...` or `/media/...` preloads a take.
- **Gmail-Only Sign-In + Profile Onboarding (`/register`)**:
  - Step 1: Real **Google OAuth 2.0 SSO** (`/api/auth/google` -> `https://accounts.google.com/o/oauth2/v2/auth` -> `/api/google-oauth/callback-chatbot`). Canonicalizes the incoming host to `NEXT_PUBLIC_SITE_URL` so the state cookie and callback share one host, exchanges the authorization code with `https://oauth2.googleapis.com/token`, fetches the verified user profile from `https://openidconnect.googleapis.com/v1/userinfo`, verifies `@gmail.com`, upserts the `DbUser` via `src/lib/google-user.ts`, and sets an HMAC-signed HTTP-only `sur_session_user` cookie (`src/lib/session.ts`) read by `/api/auth/session`. Distinct failures report `access_denied`, `state_mismatch`, `token_exchange_failed`, `unverified_email`, `gmail_only`, or `server_error`.
  - All mutations in `/api/community` and `/api/upload` require a valid signed session cookie and derive the actor from the session. `/community-data` and `/community-search` pass through `scopeDatabaseFor` (`src/lib/db-scope.ts`) so other users' emails, chats and orders are never returned.
  - `npm run smoke` (`scripts/smoke.mts`) runs 35 end-to-end API, auth and privacy checks against a running server using two temporary users that are deleted afterwards.
  - Step 2 is a 5-part wizard (`src/components/register/register-form.tsx`): **Basics** (role, name, city, bio ≥ 30 chars) → **Skills & rate** (instrument/genre chip inputs with role-based suggestions, starting price in BDT) → **Photos** (live profile-header preview; profile photo required, cover optional) → **Showcase** (at least one YouTube link or audio upload, each with a title; existing showcase items count) → **Review** (summary with Edit per section, then Publish). "Continue" is blocked with inline errors until the current part is valid; the stepper only allows jumping back or to already-valid parts. Rules live in `src/lib/profile-rules.ts`.
  - `completeProfile` in `/api/community` re-validates the same rules server-side and returns `400 { error, missing }` for incomplete profiles.
  - `ProfileCompletionGuard` (mounted in `src/app/[locale]/layout.tsx`) redirects any signed-in user whose `profileCompleted` is false back to `/register`, so the app can't be used until Step 2 is finished.
- **Showcase Collection Grid (`/u/[id]`)**:
  - Every musician profile has a full-width rounded **Cover Photo Banner (`coverUrl`)** (with high-resolution photography defaults in `public/covers/` for guitar, vocal mic, and studio) and overlapping **Profile Photo (`avatarUrl`)** at the top of `/u/[id]`.
  - Profile owners can both **Update Cover Photo (`কভার ছবি বদলাও`)** and **Reposition Cover (`কভার পজিশন ঠিক করো`)** via drag-to-reposition or a `0%–100%` vertical focal slider persisted in PostgreSQL (`cover_position_y`).
  - Overall typography scaled up via `html { font-size: 112.5%; }` (`18px` root scale) in `src/app/globals.css`.
  - Every musician has a collection list on their profile (`showcase_items` table) where they can add multiple YouTube performance links and upload audio files (WAV/MP3) for their showcase.
  - Other users view this collection in a responsive 2-column media grid (`Showcase Collection (Video & Audio Grid)`) and play videos/audio inline.
- **Community Homefeed (Posts, Offerings & Following Feed on `/`)**:
  - Signed-in Gmail musicians can post updates about their recent work (`work`), session offerings (`offering`), or parts they need (`collab`) into the `community_posts` table, and **edit or delete their own posts inline** (`updatePost` / `deletePost` in `/api/community`, enforced by session ownership) both on the Home Feed (`PostCard` in `src/components/home/home-feed.tsx`) and on their Profile page (`src/components/profile/profile-screen.tsx`).
  - Users can **Love / Like** posts (`toggleLove`) and **Follow** musicians (`user_follows` table).
  - The **Following** feed filter (`অনুসরণ করা / Following`) shows posts from musicians the user follows alongside **All Feed** and the **Musicians Directory**.
  - **Musicians Directory excludes the signed-in user's own profile** (`person.id !== activeUserId`) and excludes private profiles (`person.isPrivate`).
  - **Public / Private Profile Option (`isPrivate`)**: Musicians can set their profile to **Public** or **Private** during Step 2 of `/register` or toggle it anytime in one click from their profile header (`updateProfileVisibility`). Private profiles are hidden from the Musicians Directory and semantic search, and show a Private Profile lock screen to other visitors.
- **bKash Payment Info & Inside-Chatbox Audio/Video Player (Orders, Mixes & Chat)**:
  - Musicians can optionally provide their **Phone Number (`phone`)** and **bKash Number (`bkashNumber`)** in Step 2 of `/register` or edit them anytime from their profile sidebar (`updatePaymentContacts`).
  - During **Place Order / Confirm Order** (both in `ProfileScreen` and `FacebookChatDock`), the receiver's **bKash Number** (with 1-click Copy) and **Phone Number** are displayed so the buyer can pay via bKash and optionally record their `bkashTrxId`.
  - `/api/upload` (`src/lib/uploads.ts`) accepts **audio, video, and image** files (up to 60 MB audio, 100 MB video) and streams them via `/uploads/[name]`.
  - Both **Confirm Order**, **Deliver Order**, **Send Mix (`mix-editor.tsx`)**, and **Chat Messages** (`FacebookChatDock`) attach audio/video files and render a clickable card (`MediaAttachmentPreview`); clicking any mix or audio/video message in chat opens the **Inside-Chatbox Player (`ChatboxDockedPlayer`)** right inside the chat window with Play/Pause, seek bar, time counter, **Open in Studio** (`/editor?src=...`), and Download.
- **Facebook-Style Floating Chat Windows (`FacebookChatDock`)**:
  - Self-chat is strictly restricted in the UI (Message buttons hidden on own posts/cards/profile), client store (`openChatWindow` blocks `musicianId === currentUserId`), and API (`sendMessage` rejects `fromId === toId`).
  - The floating **Messages** icon (`FacebookChatDock`) lists only musicians with whom the signed-in user has an actual conversation in `chat_messages` (showing the latest message preview), rather than listing all users.
  - Clicking **Message** on another musician's post, card, or profile opens a large (`620px–680px` wide, expandable to `820px–920px`) floating Facebook Messenger-style chat window docked at the bottom-right of the viewport.
  - **Instant Optimistic Send + Live 1.5s Polling**: Sending a message immediately renders the bubble in `0ms` optimistically before the server round-trip finishes, and `src/lib/community-store.ts` polls `/community-data` every `1.5s` (plus on window focus/visibility) so incoming messages appear automatically without reloading the page, auto-popping open the sender's chat window and scrolling to the newest message.

## 2. Containerized PostgreSQL & Docker Compose Architecture
- **`docker-compose.yml`**:
  - `postgres` (`postgres:16-alpine`, container `surshongi-postgres`, port `5432:5432`, volume `pgdata`, schema initialized via `docker/init.sql`).
  - `app` (`surshongi-app`, multi-stage Node 22 Alpine build from `Dockerfile`, port `3000:3000`, connected via `DATABASE_URL=postgresql://surshongi:surshongi_pass@postgres:5432/surshongi_db`).
- **PostgreSQL Tables (`docker/init.sql` & `src/lib/db-server.ts`)**:
  - `users`: Musician accounts (`@gmail.com` enforced) & profile details.
  - `showcase_items`: YouTube performance links & uploaded audio tracks per musician.
  - `community_posts`: Community posts, offerings, and collaboration requests + love counts.
  - `user_follows`: Follower-to-musician relationships.
  - `user_ratings`: 1–5 star ratings per musician.
  - `chat_messages`: Direct messages between musicians (`read_at` and `email_notified_at` track seen status and automated 1-hour unseen Gmail alerts).
  - `service_orders`: Fiverr-style collaboration orders (`id`, `buyer_id`, `musician_id`, `title`, `description`, `price_bdt`, `delivery_days`, `status`: `'active' | 'delivered' | 'completed'`, `created_at`, `delivered_at`, `completed_at`).
  - `order_reviews`: Verified client reviews (`id`, `order_id`, `buyer_id`, `musician_id`, `rating` 1–5, `comment`, `order_title`, `price_bdt`, `created_at`) displayed on the musician's profile (`/u/[id]`).
  - `user_vector_index`: PostgreSQL `pgvector` (`vector(128)`) table with HNSW cosine index (`idx_user_vector_hnsw`) + `pg_trgm` trigram similarity. Automatically indexes each musician's name, city/address, roles/skills, instruments, genres, bio, showcase titles, and posts whenever a user registers, updates their profile, or adds media/posts.
- **Fiverr-Style Order & Review Trust Flow + Automated Gmail Alerts (`src/lib/mailer.ts`)**:
  - **Place Order**: Inside the floating chat window (`FacebookChatDock`) or on a musician's profile sidebar (`ProfileScreen`), a user can click **Place Order (`অর্ডার দাও`)** with a title, BDT price, delivery days, and requirements.
  - **Strict Buyer-Only Completion & Review**: Only the buyer who placed the order (`buyer_id === activeUserId`) can mark the order as **Completed** (`completeOrderAndReviewInPg`) and post a 1–5 star review with a comment. The review is saved in `order_reviews`, updates the musician's aggregate rating, and appears under **Verified Order Reviews (`কাজের রিভিউ ও রেটিং`)** on the musician's profile.
  - **Automated Gmail Notifications (`smtp.gmail.com` via `nodemailer`)**:
    1. **Order Placed**: Emails the musician's Gmail immediately when an order is placed.
    2. **Order Completed & Reviewed**: Emails both the musician and the buyer when the buyer marks the order completed and leaves a review.
    3. **Unseen Message Over 1 Hour (`checkAndNotifyUnseenMessagesInPg`)**: Automatically checks `chat_messages` where `read_at IS NULL AND email_notified_at IS NULL AND created_at <= NOW() - INTERVAL '1 hour'`, sends an email alert to the recipient's Gmail, and marks `email_notified_at = NOW()`. Opening the chat window automatically marks incoming messages as seen (`markMessagesSeen`).
- **Semantic Vector Search (`/api/search` & `/community-search`)**:
  - Clicking **Ask (`জিজ্ঞেস`)** on the Homefeed or searching on `/find` embeds the query into the 128-D bilingual (Bangla + English) vector space (`src/lib/vector-search.ts`) and queries `user_vector_index` in PostgreSQL using `1 - (embedding <=> $1::vector)` cosine similarity combined with `pg_trgm` `word_similarity` and structured reason extraction (`Semantic Vector Match`, `Name Match`, `Location / Address`, `Skill / Instrument`, `Genre Match`, `Showcase / Work`, `Within Budget`).
  - Relevance: query tokens drop stopwords and expand through concept clusters (e.g. "singer" ↔ "vocalist", "গিটার" ↔ "guitar"), skipping generic words like "song"/"rhythm". A musician is returned only if a token matches their profile (coverage > 0) or the vector/trigram similarity is strong; score = coverage·0.7 + vector·0.2 + trigram·0.1. Tokenizers keep Unicode marks (`\p{M}`) so Bangla vowel signs survive.
  - Each hit carries `matchedText` (the exact showcase title, post, or bio sentence containing the matched words), `matchedSource`, `matchedTerms` (highlighted in UI), `showcaseCount`, and `thumbnailYoutubeId`.
  - UI: `src/components/search/search-results-list.tsx` renders ONE list (thumbnail = first YouTube showcase, else cover photo; avatar overlay; role · city · rating · price; quoted matched content). Home feed hides feed/filters/directory while a search is active; `/find` shows only the latest query's results.
- **Key Files**:
  - `src/lib/db-server.ts`: `pg.Pool` connection pool & SQL query helpers (`readDatabase`, `upsertUserInPg`, `insertShowcaseItemInPg`, `insertPostInPg`, `toggleLoveInPg`, `toggleFollowInPg`, `rateMusicianInPg`, `insertMessageInPg`).
  - `src/app/api/community/route.ts`: Next.js API Route Handler executing async PostgreSQL queries.
  - `src/app/api/upload/route.ts`: Multipart audio upload saving to `public/uploads/`.

## 3. Implementation Status
- [x] Phase 0: Next.js 16 App Router, Bangla/English `next-intl`, SoundCloud-inspired dark studio theme.
- [x] Fix Turbopack HMR reload loop and `<Suspense>` params handling on `/u/[id]` and `/watch/[id]`.
- [x] Containerized PostgreSQL 16 (`docker-compose.yml`, `Dockerfile`, `docker/init.sql`) replacing file-based JSON storage.
- [x] Gmail-only Sign-In flow (`@gmail.com` enforced, all dummy accounts removed) + post-login profile onboarding + showcase collection manager.
- [x] Community Homefeed (posts, offerings, Love/Like, Follow feed filter, post composer).
- [x] Profile showcase collection grid (YouTube + audio upload) + Enlarged Facebook-style floating chat dock with rounded gradient UI.
