import { NextResponse } from "next/server";
import type { Role } from "@/data/catalog";
import {
  completeOrderAndReviewInPg,
  createOrderInPg,
  deletePostInPg,
  insertMessageInPg,
  insertPostInPg,
  insertShowcaseItemInPg,
  markMessagesSeenInPg,
  markOrderDeliveredInPg,
  rateMusicianInPg,
  readDatabase,
  toggleFollowInPg,
  toggleLoveInPg,
  updatePostInPg,
  updateUserPaymentContactsInPg,
  updateUserPhotosInPg,
  updateUserVisibilityInPg,
  upsertUserInPg,
} from "@/lib/db-server";
import { scopeDatabaseFor } from "@/lib/db-scope";
import { PROFILE_BIO_MAX, PROFILE_BIO_MIN } from "@/lib/profile-rules";
import { getSessionUserId } from "@/lib/session";
import type {
  ChatMessage,
  CommunityPost,
  DbUser,
  MediaAttachmentKind,
  PostCategory,
  ServiceOrder,
  ShowcaseItem,
} from "@/lib/db-types";
import { VIDEO_EXTS } from "@/lib/uploads";

export async function GET() {
  const viewerId = await getSessionUserId();
  return NextResponse.json(scopeDatabaseFor(await readDatabase(), viewerId));
}

// Actor ids sent by older clients (userId, fromId, buyerId, ...) are ignored: the signed session decides who acts.
type CommunityAction =
  | {
      action: "completeProfile";
      name: string;
      city: string;
      role: Role;
      bio: string;
      instruments: string;
      genres: string;
      price: string;
      phone?: string;
      bkashNumber?: string;
      isPrivate?: boolean;
      avatarUrl?: string;
      coverUrl?: string;
      youtubeId?: string;
      youtubeTitle?: string;
      audioSrc?: string;
      audioTitle?: string;
    }
  | {
      action: "updatePaymentContacts";
      phone?: string;
      bkashNumber?: string;
    }
  | {
      action: "updateProfileVisibility";
      isPrivate: boolean;
    }
  | {
      action: "updateProfilePhotos";
      avatarUrl?: string;
      coverUrl?: string;
      coverPositionY?: number;
    }
  | {
      action: "addCollectionItem";
      kind: "youtube" | "audio";
      title: string;
      youtubeId?: string;
      audioSrc?: string;
      duration?: string;
    }
  | {
      action: "createPost";
      category: PostCategory;
      title: string;
      text: string;
      roleTag: Role;
      priceBdt?: number;
      youtubeId?: string;
      audioSrc?: string;
    }
  | {
      action: "updatePost";
      postId: string;
      category: PostCategory;
      title: string;
      text: string;
      roleTag: Role;
      priceBdt?: number;
      youtubeId?: string;
      audioSrc?: string;
    }
  | { action: "deletePost"; postId: string }
  | { action: "toggleLove"; postId: string }
  | { action: "toggleFollow"; musicianId: string }
  | { action: "rateMusician"; musicianId: string; rating: number }
  | {
      action: "sendMessage";
      toId: string;
      text: string;
      attachmentUrl?: string;
      attachmentKind?: MediaAttachmentKind;
      attachmentName?: string;
    }
  | { action: "markMessagesSeen"; peerId: string }
  | {
      action: "createOrder";
      musicianId: string;
      title: string;
      description: string;
      priceBdt: number;
      deliveryDays: number;
      bkashTrxId?: string;
      attachmentUrl?: string;
      attachmentKind?: MediaAttachmentKind;
      attachmentName?: string;
    }
  | {
      action: "markOrderDelivered";
      orderId: string;
      deliveryNote?: string;
      deliveryAttachmentUrl?: string;
      deliveryAttachmentKind?: MediaAttachmentKind;
      deliveryAttachmentName?: string;
    }
  | { action: "completeOrderAndReview"; orderId: string; rating: number; comment: string };

const YOUTUBE_ID = /^[\w-]{11}$/;
const MEDIA_SRC = /^\/(uploads|media)\/[\w.-]+$/;
const POST_CATEGORIES: PostCategory[] = ["work", "offering", "collab"];

function splitList(raw: string, fallback: string) {
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  return list.length > 0 ? list : [fallback];
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanPhone(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/[^\d+-\s]/g, "").slice(0, 24);
  return trimmed || undefined;
}

function optionalYoutube(value: unknown) {
  return typeof value === "string" && YOUTUBE_ID.test(value) ? value : undefined;
}

function optionalMedia(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const v = value.trim();
  return MEDIA_SRC.test(v) || /^https:\/\/\S+$/.test(v) ? v.slice(0, 1000) : undefined;
}

function inferAttachmentKind(url: string | undefined, explicit?: unknown): MediaAttachmentKind | undefined {
  if (!url) return undefined;
  if (explicit === "video" || explicit === "audio") return explicit;
  const lower = url.toLowerCase();
  for (const ext of VIDEO_EXTS) {
    if (lower.endsWith(ext) || lower.includes("/video-")) return "video";
  }
  return "audio";
}

const optionalImage = optionalMedia;

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const me = await getSessionUserId();
  if (!me) return badRequest("Please sign in with Google first.", 401);

  let body: CommunityAction;
  try {
    body = (await request.json()) as CommunityAction;
  } catch {
    return badRequest("Invalid request body.");
  }

  const currentDb = await readDatabase();
  const meUser = currentDb.users.find((u) => u.id === me);
  if (!meUser) return badRequest("Your session is no longer valid. Please sign in again.", 401);
  const userExists = (id: unknown) => typeof id === "string" && currentDb.users.some((u) => u.id === id);

  const respond = async (extra: Record<string, unknown> = {}) =>
    NextResponse.json({ db: scopeDatabaseFor(await readDatabase(), me), ...extra });

  if (body.action === "completeProfile") {
    const name = clean(body.name, 80);
    const city = clean(body.city, 60);
    const bio = clean(body.bio, PROFILE_BIO_MAX);
    const instrumentsRaw = clean(body.instruments, 300);
    const genresRaw = clean(body.genres, 300);
    const priceNumber = Number(String(body.price ?? "").replace(/[^\d]/g, ""));
    const youtubeId = optionalYoutube(body.youtubeId);
    const audioSrc = optionalMedia(body.audioSrc);
    const hasExistingShowcase = currentDb.collections.some((c) => c.musicianId === me);
    const missing = [
      !name && "name",
      !city && "city",
      bio.length < PROFILE_BIO_MIN && "bio",
      !instrumentsRaw && "instruments",
      !genresRaw && "genres",
      !(priceNumber > 0) && "price",
      !youtubeId && !audioSrc && !hasExistingShowcase && "showcase",
    ].filter(Boolean);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Profile is incomplete: ${missing.join(", ")}.`, missing },
        { status: 400 },
      );
    }
    const role = clean(body.role, 40) as Role;
    const instruments = splitList(instrumentsRaw, role);
    const genres = splitList(genresRaw, "Folk");
    const updatedUser: DbUser = {
      ...meUser,
      avatarUrl: optionalImage(body.avatarUrl) ?? meUser.avatarUrl,
      coverUrl: optionalImage(body.coverUrl) ?? meUser.coverUrl,
      phone: body.phone !== undefined ? cleanPhone(body.phone) : meUser.phone,
      bkashNumber: body.bkashNumber !== undefined ? cleanPhone(body.bkashNumber) : meUser.bkashNumber,
      isPrivate: body.isPrivate !== undefined ? Boolean(body.isPrivate) : Boolean(meUser.isPrivate),
      profileCompleted: true,
      name,
      nameBn: name,
      city,
      cityBn: city,
      cityTerms: [city.toLowerCase()],
      roles: [role],
      instruments,
      instrumentsBn: instruments,
      genres,
      genresBn: genres,
      genreTerms: genres.map((item) => item.toLowerCase()),
      bio,
      bioBn: bio,
      priceFromBdt: Math.min(priceNumber, 10_000_000),
      turnaroundDays: meUser.turnaroundDays ?? 4,
      openToWork: true,
    };

    await upsertUserInPg(updatedUser);

    if (youtubeId) {
      const ytItem: ShowcaseItem = {
        id: `col-yt-${Date.now().toString(36)}`,
        musicianId: me,
        kind: "youtube",
        title: clean(body.youtubeTitle, 140) || `${name} — YouTube Performance`,
        titleBn: clean(body.youtubeTitle, 140) || `${name} — ইউটিউব পারফরম্যান্স`,
        youtubeId,
        duration: "Video",
        createdAt: new Date().toISOString(),
      };
      await insertShowcaseItemInPg(ytItem);
    }

    if (audioSrc) {
      const audioItem: ShowcaseItem = {
        id: `col-au-${Date.now().toString(36)}`,
        musicianId: me,
        kind: "audio",
        title: clean(body.audioTitle, 140) || `${name} — Audio Showcase`,
        titleBn: clean(body.audioTitle, 140) || `${name} — অডিও পারফরম্যান্স`,
        audioSrc,
        duration: "Audio",
        createdAt: new Date().toISOString(),
      };
      await insertShowcaseItemInPg(audioItem);
    }

    return respond({ user: updatedUser });
  }

  if (body.action === "updatePaymentContacts") {
    await updateUserPaymentContactsInPg(
      me,
      cleanPhone(body.phone),
      cleanPhone(body.bkashNumber),
    );
    const db = await readDatabase();
    return NextResponse.json({
      db: scopeDatabaseFor(db, me),
      user: db.users.find((u) => u.id === me),
    });
  }

  if (body.action === "updateProfileVisibility") {
    await updateUserVisibilityInPg(me, Boolean(body.isPrivate));
    const db = await readDatabase();
    return NextResponse.json({
      db: scopeDatabaseFor(db, me),
      user: db.users.find((u) => u.id === me),
    });
  }

  if (body.action === "updateProfilePhotos") {
    const position = Number(body.coverPositionY);
    await updateUserPhotosInPg(
      me,
      optionalImage(body.avatarUrl),
      optionalImage(body.coverUrl),
      Number.isFinite(position) ? Math.min(100, Math.max(0, position)) : undefined,
    );
    const db = await readDatabase();
    return NextResponse.json({
      db: scopeDatabaseFor(db, me),
      user: db.users.find((u) => u.id === me),
    });
  }

  if (body.action === "addCollectionItem") {
    const kind = body.kind === "youtube" ? "youtube" : "audio";
    const youtubeId = optionalYoutube(body.youtubeId);
    const audioSrc = optionalMedia(body.audioSrc);
    const title = clean(body.title, 140);
    if (!title) return badRequest("Title is required.");
    if (kind === "youtube" ? !youtubeId : !audioSrc) return badRequest("A valid YouTube link or audio file is required.");
    const item: ShowcaseItem = {
      id: `col-${Date.now().toString(36)}`,
      musicianId: me,
      kind,
      title,
      titleBn: title,
      youtubeId: kind === "youtube" ? youtubeId : undefined,
      audioSrc: kind === "audio" ? audioSrc : undefined,
      duration: clean(body.duration, 20) || (kind === "youtube" ? "Video" : "Audio"),
      createdAt: new Date().toISOString(),
    };
    await insertShowcaseItemInPg(item);
    return respond({ item });
  }

  if (body.action === "createPost") {
    const title = clean(body.title, 140);
    const text = clean(body.text, 2000);
    if (!title || !text) return badRequest("Title and text are required.");
    const price = Number(body.priceBdt);
    const post: CommunityPost = {
      id: `post-${Date.now().toString(36)}`,
      musicianId: me,
      category: POST_CATEGORIES.includes(body.category) ? body.category : "work",
      title,
      titleBn: title,
      text,
      textBn: text,
      roleTag: (clean(body.roleTag, 40) || meUser.roles[0]) as Role,
      priceBdt: Number.isFinite(price) && price > 0 ? Math.round(price) : undefined,
      youtubeId: optionalYoutube(body.youtubeId),
      audioSrc: optionalMedia(body.audioSrc),
      loves: 1,
      lovedBy: [me],
      createdAt: new Date().toISOString(),
    };
    await insertPostInPg(post);
    return respond({ post });
  }

  if (body.action === "updatePost") {
    const existingPost = currentDb.posts.find((p) => p.id === body.postId);
    if (!existingPost) return badRequest("Post not found.", 404);
    if (existingPost.musicianId !== me) {
      return badRequest("Only the author of this post can edit it.", 403);
    }
    const title = clean(body.title, 140);
    const text = clean(body.text, 2000);
    if (!title || !text) return badRequest("Title and text are required.");
    const price = Number(body.priceBdt);
    await updatePostInPg({
      postId: existingPost.id,
      musicianId: me,
      category: POST_CATEGORIES.includes(body.category) ? body.category : existingPost.category,
      title,
      text,
      roleTag: (clean(body.roleTag, 40) || existingPost.roleTag) as Role,
      priceBdt: Number.isFinite(price) && price > 0 ? Math.round(price) : undefined,
      youtubeId: optionalYoutube(body.youtubeId),
      audioSrc: optionalMedia(body.audioSrc),
    });
    return respond();
  }

  if (body.action === "deletePost") {
    const existingPost = currentDb.posts.find((p) => p.id === body.postId);
    if (!existingPost) return badRequest("Post not found.", 404);
    if (existingPost.musicianId !== me) {
      return badRequest("Only the author of this post can delete it.", 403);
    }
    await deletePostInPg(existingPost.id, me);
    return respond();
  }

  if (body.action === "toggleLove") {
    if (!currentDb.posts.some((p) => p.id === body.postId)) return badRequest("Post not found.", 404);
    await toggleLoveInPg(body.postId, me);
    return respond();
  }

  if (body.action === "toggleFollow") {
    if (!userExists(body.musicianId)) return badRequest("Musician not found.", 404);
    if (body.musicianId === me) return badRequest("You cannot follow yourself.");
    await toggleFollowInPg(me, body.musicianId);
    return respond();
  }

  if (body.action === "rateMusician") {
    const rating = Math.round(Number(body.rating));
    if (!userExists(body.musicianId)) return badRequest("Musician not found.", 404);
    if (body.musicianId === me) return badRequest("You cannot rate yourself.");
    if (!(rating >= 1 && rating <= 5)) return badRequest("Rating must be between 1 and 5.");
    await rateMusicianInPg(me, body.musicianId, rating);
    return respond();
  }

  if (body.action === "sendMessage") {
    if (body.toId === me) return badRequest("Self chat is restricted.");
    if (!userExists(body.toId)) return badRequest("Recipient not found.", 404);
    const attachmentUrl = optionalMedia(body.attachmentUrl);
    const attachmentKind = inferAttachmentKind(attachmentUrl, body.attachmentKind);
    const attachmentName = clean(body.attachmentName, 140) || undefined;
    const rawText = clean(body.text, 4000);
    const text =
      rawText ||
      (attachmentUrl
        ? `📎 ${attachmentKind === "video" ? "Video" : "Audio"}: ${attachmentName ?? "attachment"}`
        : "");
    if (!text && !attachmentUrl) return badRequest("Message is empty.");
    const msg: ChatMessage = {
      id: `msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      fromId: me,
      toId: body.toId,
      text,
      attachmentUrl,
      attachmentKind,
      attachmentName,
      createdAt: new Date().toISOString(),
    };
    await insertMessageInPg(msg);
    return respond({ message: msg });
  }

  if (body.action === "markMessagesSeen") {
    if (typeof body.peerId !== "string") return badRequest("peerId is required.");
    await markMessagesSeenInPg(me, body.peerId);
    return respond();
  }

  if (body.action === "createOrder") {
    if (body.musicianId === me) return badRequest("Cannot place an order with yourself.");
    if (!userExists(body.musicianId)) return badRequest("Musician not found.", 404);
    const title = clean(body.title, 140);
    if (!title) return badRequest("Order title is required.");
    const priceBdt = Math.round(Number(body.priceBdt) || 0);
    if (priceBdt <= 0) return badRequest("Order price must be greater than 0.");

    const bkashTrxId = clean(body.bkashTrxId, 60) || undefined;
    const attachmentUrl = optionalMedia(body.attachmentUrl);
    const attachmentKind = inferAttachmentKind(attachmentUrl, body.attachmentKind);
    const attachmentName = clean(body.attachmentName, 140) || undefined;

    const order: ServiceOrder = {
      id: `ord-${Date.now().toString(36)}`,
      buyerId: me,
      musicianId: body.musicianId,
      title,
      description: clean(body.description, 2000),
      priceBdt,
      deliveryDays: Math.min(90, Math.max(1, Math.round(Number(body.deliveryDays) || 3))),
      status: "active",
      bkashTrxId,
      attachmentUrl,
      attachmentKind,
      attachmentName,
      createdAt: new Date().toISOString(),
    };
    await createOrderInPg(order);

    const trxSuffix = bkashTrxId ? ` · bKash TrxID: ${bkashTrxId}` : "";
    const orderChatMsg: ChatMessage = {
      id: `msg-ord-${Date.now().toString(36)}`,
      fromId: me,
      toId: body.musicianId,
      text: `📦 Order Placed: "${order.title}" — ৳${order.priceBdt} (${order.deliveryDays} days)${order.description ? ` · ${order.description}` : ""}${trxSuffix}`,
      attachmentUrl,
      attachmentKind,
      attachmentName,
      createdAt: new Date().toISOString(),
    };
    await insertMessageInPg(orderChatMsg);
    return respond({ order });
  }

  if (body.action === "markOrderDelivered") {
    const order = currentDb.orders.find((o) => o.id === body.orderId);
    if (!order) return badRequest("Order not found.", 404);
    if (order.musicianId !== me) return badRequest("Only the musician on this order can deliver it.", 403);
    if (order.status !== "active") return badRequest("This order is not active.");

    const deliveryNote = clean(body.deliveryNote, 2000) || undefined;
    const deliveryAttachmentUrl = optionalMedia(body.deliveryAttachmentUrl);
    const deliveryAttachmentKind = inferAttachmentKind(deliveryAttachmentUrl, body.deliveryAttachmentKind);
    const deliveryAttachmentName = clean(body.deliveryAttachmentName, 140) || undefined;

    await markOrderDeliveredInPg(
      body.orderId,
      me,
      deliveryNote,
      deliveryAttachmentUrl,
      deliveryAttachmentKind,
      deliveryAttachmentName,
    );

    const deliveredMsg: ChatMessage = {
      id: `msg-dlv-${Date.now().toString(36)}`,
      fromId: me,
      toId: order.buyerId,
      text: `📦 Order Delivered: "${order.title}"${deliveryNote ? ` — ${deliveryNote}` : ""}`,
      attachmentUrl: deliveryAttachmentUrl,
      attachmentKind: deliveryAttachmentKind,
      attachmentName: deliveryAttachmentName,
      createdAt: new Date().toISOString(),
    };
    await insertMessageInPg(deliveredMsg);
    return respond();
  }

  if (body.action === "completeOrderAndReview") {
    const rating = Math.round(Number(body.rating));
    if (!(rating >= 1 && rating <= 5)) return badRequest("Rating must be between 1 and 5.");
    const result = await completeOrderAndReviewInPg({
      orderId: body.orderId,
      buyerId: me,
      rating,
      comment: clean(body.comment, 2000),
    });
    if (!result.ok) return badRequest(result.error ?? "Could not complete order.", 403);
    return respond();
  }

  return badRequest("Unknown action");
}
