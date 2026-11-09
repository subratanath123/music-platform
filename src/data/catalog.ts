export type Role =
  | "vocalist"
  | "guitarist"
  | "percussion"
  | "flute"
  | "producer"
  | "lyricist";

export type Musician = {
  id: string;
  name: string;
  nameBn: string;
  avatarUrl?: string;
  coverUrl?: string;
  coverPositionY?: number;
  phone?: string;
  bkashNumber?: string;
  isPrivate?: boolean;
  city: string;
  cityBn: string;
  cityTerms: string[];
  roles: Role[];
  instruments: string[];
  instrumentsBn: string[];
  genres: string[];
  genresBn: string[];
  genreTerms: string[];
  languages: string[];
  languagesBn: string[];
  languageTerms: string[];
  bio: string;
  bioBn: string;
  priceFromBdt?: number;
  turnaroundDays?: number;
  years?: number;
  openToWork: boolean;
  vocalRange?: string;
  vocalRangeBn?: string;
  rangeTerms?: string[];
  daw?: string;
  dawTerms?: string[];
  mood: string[];
  moodBn: string[];
  moodTerms: string[];
  followers: number;
  rating: number;
  ratingCount: number;
};

export function pick(locale: string, bangla: string, english: string) {
  return locale === "bn" ? bangla : english;
}
