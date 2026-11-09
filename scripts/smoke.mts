import crypto from "node:crypto";
import { Pool } from "pg";
import { upsertUserInPg } from "../src/lib/db-server";
import type {
  ChatMessage,
  CommunityDatabase,
  CommunityPost,
  DbUser,
  ServiceOrder,
  ShowcaseItem,
} from "../src/lib/db-types";

type Json = {
  db?: CommunityDatabase;
  user?: DbUser;
  post?: CommunityPost;
  item?: ShowcaseItem;
  message?: ChatMessage;
  order?: ServiceOrder;
  missing?: string[];
  error?: string;
};

// End-to-end API check against a running server: `npm run smoke` (uses two throwaway users, deleted afterwards).
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const secret = process.env.SESSION_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET!.trim();
const token = (id: string) => {
  const payload = `${Buffer.from(id).toString("base64url")}.${Math.floor(Date.now() / 1000) + 3600}`;
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
};

const base = (id: string, name: string): DbUser => ({
  id, email: `${id}@gmail.com`, googleSub: `g-${id}`, profileCompleted: false, name, nameBn: name,
  city: "Dhaka", cityBn: "ঢাকা", cityTerms: ["dhaka"], roles: ["vocalist"], instruments: ["Voice"],
  instrumentsBn: ["Voice"], genres: ["Folk"], genresBn: ["Folk"], genreTerms: ["folk"], languages: ["Bangla"],
  languagesBn: ["বাংলা"], languageTerms: ["bangla"], bio: "", bioBn: "", openToWork: true, mood: [], moodBn: [],
  moodTerms: [], followers: 0, rating: 5, ratingCount: 0,
});

const A = "zz-smoke-a";
const B = "zz-smoke-b";
await upsertUserInPg(base(A, "Smoke Buyer"));
await upsertUserInPg(base(B, "Smoke Musician"));

let failures = 0;
function check(label: string, rawOk: unknown, detail?: unknown) {
  const ok = Boolean(rawOk);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  -> ${JSON.stringify(detail).slice(0, 300)}`}`);
}

async function call(as: string | null, payload: Record<string, unknown>) {
  const res = await fetch(`${BASE}/community-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(as ? { Cookie: `sur_session_user=${token(as)}` } : {}) },
    body: JSON.stringify(payload),
  });
  return { status: res.status, data: (await res.json()) as Json };
}

async function getDb(as: string | null) {
  const res = await fetch(`${BASE}/community-data`, {
    headers: as ? { Cookie: `sur_session_user=${token(as)}` } : {},
  });
  return (await res.json()) as CommunityDatabase;
}

try {
  // auth
  let r = await call(null, { action: "sendMessage", toId: B, text: "hi" });
  check("anonymous write rejected (401)", r.status === 401, r);
  const forged = await fetch(`${BASE}/community-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `sur_session_user=${B}` },
    body: JSON.stringify({ action: "sendMessage", toId: A, text: "forged" }),
  });
  check("forged plain-id cookie rejected", forged.status === 401, forged.status);
  r = await call(A, { action: "googleSignIn", email: "x@gmail.com", name: "x" });
  check("unverified googleSignIn action removed", r.status === 400, r);
  const sess = (await (await fetch(`${BASE}/auth/session`, { headers: { Cookie: `sur_session_user=${token(A)}` } })).json()) as { user?: DbUser };
  check("session endpoint resolves signed cookie", sess.user?.id === A, sess);

  // profile wizard
  r = await call(B, { action: "completeProfile", name: "Smoke Musician", city: "Dhaka", role: "guitarist", bio: "short", instruments: "", genres: "", price: "" });
  check("incomplete profile rejected", r.status === 400 && r.data.missing?.includes("bio"), r.data);
  r = await call(B, {
    action: "completeProfile", userId: A, name: "Smoke Musician", city: "Dhaka", role: "guitarist",
    bio: "Session guitarist playing folk and fusion for ten years in Dhaka.", instruments: "Acoustic Guitar",
    genres: "Folk, Fusion", price: "3000", phone: "01711000000", bkashNumber: "01711999999",
    youtubeId: "dQw4w9WgXcQ", youtubeTitle: "Smoke live",
  });
  check("profile completes (and ignores spoofed userId)", r.status === 200 && r.data.user?.id === B && r.data.user?.profileCompleted, r.data);
  check("optional phone & bKash saved on profile", r.data.user?.phone === "01711000000" && r.data.user?.bkashNumber === "01711999999", r.data.user);
  r = await call(B, { action: "updatePaymentContacts", phone: "01811222333", bkashNumber: "01811444555" });
  check("updatePaymentContacts updates phone & bKash", r.status === 200 && r.data.user?.bkashNumber === "01811444555", r.data.user);

  // showcase + photos
  r = await call(B, { action: "addCollectionItem", musicianId: A, kind: "audio", title: "Smoke take", audioSrc: "/media/farhan-guitar.wav" });
  check("audio showcase added to own profile", r.status === 200 && r.data.item?.musicianId === B, r.data);
  r = await call(B, { action: "addCollectionItem", kind: "audio", title: "bad", audioSrc: "javascript:alert(1)" });
  check("bad audio URL rejected", r.status === 400, r.data);
  r = await call(B, { action: "updateProfilePhotos", coverPositionY: 30 });
  check("cover position saved", r.status === 200 && r.data.user?.coverPositionY === 30, r.data);

  // feed
  r = await call(A, { action: "createPost", musicianId: B, category: "collab", title: "Need a guitarist", text: "Looking for folk guitar", roleTag: "vocalist" });
  check("post created as session user", r.status === 200 && r.data.post?.musicianId === A, r.data);
  const postId = r.data.post?.id;
  r = await call(B, { action: "updatePost", postId, category: "collab", title: "Hacked", text: "Hacked", roleTag: "vocalist" });
  check("non-author cannot edit post (403)", r.status === 403, r);
  r = await call(A, { action: "updatePost", postId, category: "offering", title: "Updated post title", text: "Updated folk guitar details", roleTag: "guitarist", priceBdt: 2500 });
  const updatedPost = r.data.db?.posts.find((p) => p.id === postId);
  check("author edits own post", r.status === 200 && updatedPost?.title === "Updated post title" && updatedPost?.priceBdt === 2500, updatedPost);
  r = await call(B, { action: "toggleLove", postId });
  check("love toggled", r.data.db?.posts.find((p) => p.id === postId)?.lovedBy.includes(B), r.data);

  // follow + rating
  r = await call(A, { action: "toggleFollow", musicianId: B });
  check("follow", (r.data.db?.follows?.[A] ?? []).includes(B), r.data.db?.follows);
  r = await call(A, { action: "rateMusician", musicianId: B, rating: 4 });
  check("rating", r.data.db?.ratings?.[A]?.[B] === 4, r.data.db?.ratings ?? r.data);
  r = await call(A, { action: "rateMusician", musicianId: A, rating: 5 });
  check("self-rating rejected", r.status === 400, r.data);

  // chat
  r = await call(A, { action: "sendMessage", fromId: B, toId: B, text: "Hello musician" });
  check("message sent from session user", r.status === 200 && r.data.message?.fromId === A, r.data);
  r = await call(A, { action: "sendMessage", toId: A, text: "me" });
  check("self chat rejected", r.status === 400, r.data);
  r = await call(B, { action: "sendMessage", toId: A, text: "Hi buyer", attachmentUrl: "/media/farhan-guitar.wav", attachmentKind: "audio", attachmentName: "guitar-stem" });
  check("reply with audio attachment sent", r.status === 200 && r.data.message?.attachmentUrl === "/media/farhan-guitar.wav", r.data);
  r = await call(A, { action: "markMessagesSeen", peerId: B });
  check("mark seen", r.status === 200, r.data);

  // privacy
  const anon = await getDb(null);
  check("anonymous sees no messages/orders", anon.messages.length === 0 && anon.orders.length === 0, anon.messages.length);
  check("anonymous sees no emails", anon.users.every((u) => !u.email), anon.users.map((u) => u.email));
  const dbA = await getDb(A);
  check("user sees only own chats", dbA.messages.every((m) => m.fromId === A || m.toId === A) && dbA.messages.length >= 2, dbA.messages.length);
  check("user sees own email only", dbA.users.find((u) => u.id === A)?.email && !dbA.users.find((u) => u.id === B)?.email, null);

  // orders
  r = await call(A, {
    action: "createOrder", musicianId: B, title: "Guitar track", description: "4 bars", priceBdt: 3000, deliveryDays: 3,
    bkashTrxId: "TRX987654", attachmentUrl: "/media/neela-vocal.wav", attachmentKind: "audio", attachmentName: "vocal-ref",
  });
  check("order placed with bKash TrxID & attachment", r.status === 200 && r.data.order?.buyerId === A && r.data.order?.bkashTrxId === "TRX987654" && r.data.order?.attachmentUrl === "/media/neela-vocal.wav", r.data);
  const orderId = r.data.order?.id;
  r = await call(A, { action: "createOrder", musicianId: A, title: "x", description: "", priceBdt: 10, deliveryDays: 1 });
  check("self order rejected", r.status === 400, r.data);
  r = await call(A, { action: "markOrderDelivered", orderId });
  check("buyer cannot deliver", r.status === 403, r.data);
  r = await call(B, { action: "completeOrderAndReview", orderId, rating: 5, comment: "x" });
  check("musician cannot complete own order", r.status === 403, r.data);
  r = await call(B, {
    action: "markOrderDelivered", orderId, deliveryNote: "Here you go",
    deliveryAttachmentUrl: "/media/farhan-guitar.wav", deliveryAttachmentKind: "audio", deliveryAttachmentName: "final-guitar",
  });
  const deliveredOrder = r.data.db?.orders.find((o) => o.id === orderId);
  check("musician delivers with attachment", deliveredOrder?.status === "delivered" && deliveredOrder?.deliveryAttachmentUrl === "/media/farhan-guitar.wav", deliveredOrder);
  r = await call(A, { action: "completeOrderAndReview", orderId, rating: 5, comment: "Great guitar work!" });
  check("buyer completes + reviews", r.status === 200 && r.data.db?.orders.find((o) => o.id === orderId)?.status === "completed", r.data);
  const anon2 = await getDb(null);
  check("review is public on profile", anon2.reviews.some((rv) => rv.orderId === orderId && rv.comment === "Great guitar work!"), anon2.reviews);

  // search
  const s = (await (await fetch(`${BASE}/community-search?q=${encodeURIComponent("folk guitar dhaka")}`)).json()) as {
    hits?: { user: DbUser }[];
  };
  const ids: string[] = s.hits?.map((h) => h.user.id) ?? [];
  check("search finds the folk guitarist", ids.includes(B), ids);
  check("incomplete profiles excluded from search", !ids.includes(A), ids);
  check("search hides email", s.hits?.every((h) => !h.user.email), null);

  // private / public profile visibility
  r = await call(B, { action: "updateProfileVisibility", isPrivate: true });
  check("profile set to private", r.status === 200 && r.data.user?.isPrivate === true, r.data.user);
  const sPriv = (await (await fetch(`${BASE}/community-search?q=${encodeURIComponent("folk guitar dhaka")}`)).json()) as {
    hits?: { user: DbUser }[];
  };
  check("private profile hidden from search", !(sPriv.hits ?? []).some((h) => h.user.id === B), sPriv.hits?.map((h) => h.user.id));
  r = await call(B, { action: "updateProfileVisibility", isPrivate: false });
  check("profile set back to public", r.status === 200 && r.data.user?.isPrivate === false, r.data.user);

  // upload
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(64)], { type: "audio/wav" }), "smoke.wav");
  let up = await fetch(`${BASE}/community-upload`, { method: "POST", body: fd });
  check("anonymous upload rejected", up.status === 401, up.status);
  const fd2 = new FormData();
  fd2.append("file", new Blob([new Uint8Array(64)], { type: "audio/wav" }), "smoke.wav");
  up = await fetch(`${BASE}/community-upload`, { method: "POST", body: fd2, headers: { Cookie: `sur_session_user=${token(A)}` } });
  const upJson = (await up.json()) as { url?: string };
  check("signed-in upload works", up.status === 200 && upJson.url?.startsWith("/uploads/"), upJson);
  const served = await fetch(`${BASE}${upJson.url}`, { headers: { Range: "bytes=0-9" } });
  check("uploaded file served with range", served.status === 206 || served.status === 200, served.status);
  if (upJson.url) {
    const fs = await import("node:fs");
    fs.rmSync(`public${upJson.url}`, { force: true });
  }
} catch (error) {
  failures++;
  console.log("EXCEPTION", error);
} finally {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("DELETE FROM order_reviews WHERE order_id IN (SELECT id FROM service_orders WHERE buyer_id = ANY($1) OR musician_id = ANY($1))", [[A, B]]);
  await pool.query("DELETE FROM service_orders WHERE buyer_id = ANY($1) OR musician_id = ANY($1)", [[A, B]]);
  await pool.query("DELETE FROM chat_messages WHERE from_id = ANY($1) OR to_id = ANY($1)", [[A, B]]);
  await pool.query("DELETE FROM community_posts WHERE musician_id = ANY($1)", [[A, B]]);
  await pool.query("DELETE FROM showcase_items WHERE musician_id = ANY($1)", [[A, B]]);
  await pool.query("DELETE FROM user_follows WHERE follower_id = ANY($1) OR musician_id = ANY($1)", [[A, B]]);
  await pool.query("DELETE FROM user_ratings WHERE rater_id = ANY($1) OR musician_id = ANY($1)", [[A, B]]);
  await pool.query("DELETE FROM user_vector_index WHERE user_id = ANY($1)", [[A, B]]).catch(() => {});
  await pool.query("DELETE FROM users WHERE id = ANY($1)", [[A, B]]);
  await pool.end();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}
