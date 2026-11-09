import type { Musician, Role } from "@/data/catalog";

export type ShowcaseItem = {
  id: string;
  musicianId: string;
  kind: "youtube" | "audio";
  title: string;
  titleBn: string;
  youtubeId?: string;
  audioSrc?: string;
  duration: string;
  createdAt: string;
};

export type PostCategory = "work" | "offering" | "collab";

export type CommunityPost = {
  id: string;
  musicianId: string;
  category: PostCategory;
  title: string;
  titleBn: string;
  text: string;
  textBn: string;
  roleTag: Role;
  priceBdt?: number;
  youtubeId?: string;
  audioSrc?: string;
  loves: number;
  lovedBy: string[];
  createdAt: string;
};

export type MediaAttachmentKind = "audio" | "video";

export type ChatMessage = {
  id: string;
  fromId: string;
  toId: string;
  text: string;
  attachmentUrl?: string;
  attachmentKind?: MediaAttachmentKind;
  attachmentName?: string;
  createdAt: string;
  readAt?: string;
  emailNotifiedAt?: string;
};

export type OrderStatus = "active" | "delivered" | "completed";

export type ServiceOrder = {
  id: string;
  buyerId: string;
  musicianId: string;
  title: string;
  description: string;
  priceBdt: number;
  deliveryDays: number;
  status: OrderStatus;
  bkashTrxId?: string;
  attachmentUrl?: string;
  attachmentKind?: MediaAttachmentKind;
  attachmentName?: string;
  deliveryNote?: string;
  deliveryAttachmentUrl?: string;
  deliveryAttachmentKind?: MediaAttachmentKind;
  deliveryAttachmentName?: string;
  createdAt: string;
  deliveredAt?: string;
  completedAt?: string;
};

export type OrderReview = {
  id: string;
  orderId: string;
  buyerId: string;
  musicianId: string;
  rating: number;
  comment: string;
  orderTitle: string;
  priceBdt: number;
  createdAt: string;
};

export type DbUser = Musician & {
  email?: string;
  googleSub?: string;
  avatarUrl?: string;
  coverUrl?: string;
  coverPositionY?: number;
  phone?: string;
  bkashNumber?: string;
  isPrivate?: boolean;
  profileCompleted: boolean;
};

export type CommunityDatabase = {
  users: DbUser[];
  collections: ShowcaseItem[];
  posts: CommunityPost[];
  follows: Record<string, string[]>;
  ratings: Record<string, Record<string, number>>;
  messages: ChatMessage[];
  orders: ServiceOrder[];
  reviews: OrderReview[];
};
