import type { Role } from "@/data/catalog";

export const PROFILE_BIO_MIN = 30;
export const PROFILE_BIO_MAX = 600;

export const INSTRUMENT_SUGGESTIONS: Record<Role, string[]> = {
  vocalist: ["Lead Vocals", "Backing Vocals", "Harmony", "Chorus"],
  guitarist: ["Acoustic Guitar", "Electric Guitar", "Bass Guitar", "Ukulele"],
  percussion: ["Tabla", "Dhol", "Drums", "Cajon"],
  flute: ["Bansuri", "Flute", "Esraj"],
  producer: ["Mixing", "Mastering", "Arrangement", "FL Studio", "Ableton"],
  lyricist: ["Lyrics", "Songwriting", "Composition"],
};

export const GENRE_SUGGESTIONS = [
  "Folk",
  "Baul",
  "Rabindra Sangeet",
  "Nazrul Geeti",
  "Modern",
  "Rock",
  "Pop",
  "Classical",
  "Fusion",
  "Hip-hop",
];
