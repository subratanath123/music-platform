import type { CommunityDatabase, DbUser } from "@/lib/db-types";

export function toPublicUser(user: DbUser): DbUser {
  return { ...user, email: undefined, googleSub: undefined };
}

/** Strips private data (other people's emails, chats and orders) before the database leaves the server. */
export function scopeDatabaseFor(db: CommunityDatabase, viewerId: string | null): CommunityDatabase {
  return {
    ...db,
    users: db.users.map((u) => (u.id === viewerId ? u : toPublicUser(u))),
    messages: viewerId
      ? db.messages.filter((m) => m.fromId === viewerId || m.toId === viewerId)
      : [],
    orders: viewerId
      ? db.orders.filter((o) => o.buyerId === viewerId || o.musicianId === viewerId)
      : [],
  };
}
