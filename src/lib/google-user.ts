import { readDatabase, upsertUserInPg } from "@/lib/db-server";
import type { DbUser } from "@/lib/db-types";

export type VerifiedGoogleProfile = {
  sub?: string;
  email: string;
  name?: string;
  picture?: string;
};

export function isGmailAddress(email: string) {
  return email.endsWith("@gmail.com") || email.endsWith("@googlemail.com");
}

export async function findOrCreateGoogleUser(profile: VerifiedGoogleProfile): Promise<DbUser> {
  const email = profile.email.trim().toLowerCase();
  const db = await readDatabase();
  const existing = db.users.find(
    (u) => (profile.sub && u.googleSub === profile.sub) || u.email?.toLowerCase() === email,
  );

  if (existing) {
    if (profile.picture && existing.avatarUrl !== profile.picture && !existing.avatarUrl?.startsWith("/uploads/")) {
      const updated: DbUser = {
        ...existing,
        googleSub: profile.sub ?? existing.googleSub,
        avatarUrl: profile.picture,
      };
      await upsertUserInPg(updated);
      return updated;
    }
    return existing;
  }

  const slug = email
    .split("@")[0]
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const id = `u-${slug || "member"}-${Date.now().toString(36).slice(-4)}`;
  const displayName = profile.name?.trim() || email.split("@")[0];
  const user: DbUser = {
    id,
    email,
    googleSub: profile.sub ?? `google-${id}`,
    avatarUrl: profile.picture,
    profileCompleted: false,
    name: displayName,
    nameBn: displayName,
    city: "Dhaka",
    cityBn: "ঢাকা",
    cityTerms: ["dhaka", "ঢাকা"],
    roles: ["vocalist"],
    instruments: ["Voice"],
    instrumentsBn: ["কণ্ঠ"],
    genres: ["Folk"],
    genresBn: ["লোক"],
    genreTerms: ["folk", "লোক"],
    languages: ["Bangla", "English"],
    languagesBn: ["বাংলা", "ইংরেজি"],
    languageTerms: ["bangla", "বাংলা", "english", "ইংরেজি"],
    bio: "",
    bioBn: "",
    openToWork: true,
    mood: [],
    moodBn: [],
    moodTerms: [],
    followers: 0,
    rating: 5.0,
    ratingCount: 0,
  };
  await upsertUserInPg(user);
  return user;
}
