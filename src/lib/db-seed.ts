import type { CommunityDatabase } from "@/lib/db-types";

export function createSeedDatabase(): CommunityDatabase {
  return {
    users: [],
    collections: [],
    posts: [],
    follows: {},
    ratings: {},
    messages: [],
    orders: [],
    reviews: [],
  };
}
