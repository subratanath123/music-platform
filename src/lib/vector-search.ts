import type { Role } from "@/data/catalog";
import type { CommunityPost, DbUser, ShowcaseItem } from "@/lib/db-types";

export const VECTOR_DIM = 128;

export type SemanticReason =
  | "semantic"
  | "name"
  | "location"
  | "skill"
  | "genre"
  | "showcase"
  | "budget";

export type MatchSource =
  | "showcase"
  | "post"
  | "bio"
  | "skills"
  | "genres"
  | "location"
  | "name"
  | "profile";

export type SemanticMusicianHit = {
  user: DbUser;
  similarity: number; // 0 to 100 percentage
  reasons: SemanticReason[];
  matchedText: string;
  matchedSource: MatchSource;
  matchedTerms: string[];
  showcaseCount: number;
  thumbnailYoutubeId?: string;
};

export type MatchEvidence = {
  reasons: SemanticReason[];
  /** Fraction (0..1) of meaningful query tokens found anywhere in the profile. */
  coverage: number;
  matchedText: string;
  matchedSource: MatchSource;
  matchedTerms: string[];
};

const STOPWORDS = new Set([
  "a", "an", "the", "in", "at", "on", "of", "for", "to", "and", "or", "with", "from", "by",
  "is", "are", "who", "can", "me", "my", "i", "we", "want", "find", "search", "show", "some",
  "any", "near", "around", "someone", "person", "people", "musician", "musicians", "artist",
  "need", "needs", "looking", "hire", "good", "best", "please", "also", "like", "that", "this",
  "আমি", "আমার", "একজন", "চাই", "দরকার", "খুঁজছি", "এবং", "ও", "এর", "জন্য", "কে", "যে", "শিল্পী",
]);

// Too generic to stand in for a specific skill when expanding synonyms ("tabla" must not match "rhythm").
const GENERIC_EXPANSION_TERMS = new Set([
  "song", "sound", "rhythm", "beat", "solo", "lead", "voice", "strings", "words", "writing",
  "writer", "studio", "record", "melody", "wind", "acoustic", "electric", "modern", "soft",
  "warm", "root", "band", "master", "logic", "part", "take", "সুর", "গান", "তার", "তাল", "কথা", "লেখা",
]);

export function tokenizeQuery(normalizedQuery: string): string[] {
  return normalizedQuery
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function splitSentences(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimAround(text: string, terms: string[], maxLen = 170): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const lower = clean.toLowerCase();
  const firstHit = terms
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const start = firstHit === undefined ? 0 : Math.max(0, firstHit - 50);
  const slice = clean.slice(start, start + maxLen).trim();
  return `${start > 0 ? "…" : ""}${slice}${start + maxLen < clean.length ? "…" : ""}`;
}

// Concept clusters (dimensions 0..31) bridging English, Bangla, Romanized Bangla, and common typos
const CONCEPT_CLUSTERS: Array<{ dim: number; weight: number; terms: string[] }> = [
  {
    dim: 0,
    weight: 3.2,
    terms: [
      "vocal", "vocalist", "singer", "sing", "singing", "voice", "song", "lead",
      "chorus", "melody", "playback", "soprano", "mezzo", "tenor", "singar", "vokal",
      "কণ্ঠ", "কন্ঠ", "গান", "গায়ক", "গায়ক", "গায়িকা", "গায়িকা", "গাইতে", "গলা", "সুর", "কোরাস",
    ],
  },
  {
    dim: 1,
    weight: 3.2,
    terms: [
      "guitar", "guitarist", "guiter", "guiterist", "giter", "acoustic", "electric",
      "strum", "strumming", "fingerstyle", "solo", "riff", "chords", "chord", "strings", "pluck",
      "গিটার", "গিটারিস্ট", "তার", "অ্যাকুস্টিক", "ইলেকট্রিক", "সোলো", "কর্ড", "রিদম",
    ],
  },
  {
    dim: 2,
    weight: 3.2,
    terms: [
      "percussion", "tabla", "dhol", "drum", "drums", "drummer", "cajon", "beat",
      "rhythm", "theka", "tala", "taal", "keherwa", "dadra",
      "তবলা", "ঢোল", "ড্রাম", "ড্রামার", "ঠেকা", "তাল", "ছন্দ", "পারকাশন",
    ],
  },
  {
    dim: 3,
    weight: 3.2,
    terms: [
      "flute", "bansuri", "flutist", "woodwind", "bamboo", "wind",
      "বাঁশি", "বংশী", "বাঁশুরি",
    ],
  },
  {
    dim: 4,
    weight: 3.2,
    terms: [
      "producer", "production", "mix", "mixing", "master", "mastering", "arrange",
      "arrangement", "ableton", "reaper", "flstudio", "logic", "daw", "stem", "studio", "sound", "engineer",
      "মিক্স", "মিক্সিং", "মাস্টার", "মাস্টারিং", "প্রোডিউসার", "অ্যারেঞ্জমেন্ট", "স্টুডিও", "সাউন্ড",
    ],
  },
  {
    dim: 5,
    weight: 3.2,
    terms: [
      "lyric", "lyrics", "lyricist", "songwriter", "writing", "writer", "poem",
      "poet", "composer", "compose", "words", "verse",
      "কথা", "গীতিকার", "লিরিক", "লিরিক্স", "সুরকার", "লেখা", "গান লেখা",
    ],
  },
  // Locations & Address clusters (dimensions 6..15)
  {
    dim: 6,
    weight: 2.8,
    terms: [
      "dhaka", "dacca", "mirpur", "dhanmondi", "uttara", "banani", "gulshan",
      "mohammadpur", "bashundhara", "badda", "rampura", "shahbag", "tejgaon", "motijheel",
      "ঢাকা", "মিরপুর", "ধানমন্ডি", "উত্তরা", "বনানী", "গুলশান", "মোহাম্মদপুর", "বসুন্ধরা", "শাহবাগ",
    ],
  },
  {
    dim: 7,
    weight: 2.8,
    terms: [
      "chattogram", "chittagong", "ctg", "agrabad", "nasirabad", "halishahar", "patenga",
      "চট্টগ্রাম", "চিটাগাং", "আগ্রাবাদ", "নাসিরাবাদ",
    ],
  },
  {
    dim: 8,
    weight: 2.8,
    terms: ["sylhet", "সুনামগঞ্জ", "সিলেট", "মৌলভীবাজার", "হবিগঞ্জ"],
  },
  {
    dim: 9,
    weight: 2.8,
    terms: ["khulna", "খুলনা", "যশোর", " সাতক্ষীরা", "বাগেরহাট"],
  },
  {
    dim: 10,
    weight: 2.8,
    terms: ["rajshahi", "রাজশাহী", "বগুড়া", "বগুড়া", "পাবনা", "নাটোর"],
  },
  {
    dim: 11,
    weight: 2.6,
    terms: [
      "barishal", "barisal", "rangpur", "mymensingh", "cumilla", "comilla", "gazipur", "narayanganj",
      "বরিশাল", "রংপুর", "ময়মনসিংহ", "ময়মনসিংহ", "কুমিল্লা", "গাজীপুর", "নারায়ণগঞ্জ",
    ],
  },
  // Genres & Styles (dimensions 12..19)
  {
    dim: 12,
    weight: 2.4,
    terms: [
      "folk", "baul", "bhatiali", "bhawaiya", "lalon", "root", "traditional", "acoustic",
      "লোক", "লোকগান", "বাউল", "ভাটিয়ালি", "ভাওয়াইয়া", "লালন", "মাটির গান",
    ],
  },
  {
    dim: 13,
    weight: 2.4,
    terms: [
      "rock", "band", "metal", "indie", "alternative", " distortion", "overdrive",
      "রক", "ব্যান্ড", "মেটাল", "ইন্ডি",
    ],
  },
  {
    dim: 14,
    weight: 2.4,
    terms: [
      "rabindra", "tagore", "nazrul", "classical", "semi-classical", "raag", "raga",
      "রবীন্দ্র", "রবীন্দ্রসঙ্গীত", "নজরুল", "শাস্ত্রীয়", "রাগ", "ধ্রুপদী",
    ],
  },
  {
    dim: 15,
    weight: 2.4,
    terms: [
      "pop", "modern", "ballad", "romantic", "mellow", "soft", "warm", "unplugged", "fusion", "hiphop", "rap",
      "পপ", "আধুনিক", "রোমান্টিক", "শান্ত", "নরম", "উষ্ণ", "ফিউশন", "হিপহপ",
    ],
  },
  // Collaboration & Hiring intent (dimensions 16..18)
  {
    dim: 16,
    weight: 1.5,
    terms: [
      "hire", "need", "looking", "collab", "collaboration", "session", "record", "recording", "part", "take",
      "ভাড়া", "ভাড়া", "দরকার", "চাই", "খুঁজছি", "কাজ", "রেকর্ড", "সেশন", "অফার",
    ],
  },
];

export function normalizeDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
}

function hashToken(token: string, seed = 2166136261): number {
  let h = seed;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Generates a 128-dimensional L2-normalized semantic & lexical embedding vector
 * suitable for PostgreSQL `pgvector` (`vector(128)`).
 * Combines bilingual music/skill/location concept dimensions (0..31) with
 * character n-gram & word feature hashing (32..127) so names, addresses,
 * typos ("guiter"), and free-form descriptions match with high recall.
 */
export function buildEmbeddingVector(rawText: string): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  const clean = normalizeDigits(rawText.toLowerCase())
    .replace(/[^\p{L}\p{M}\p{N}\s#@.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    vec[0] = 1;
    return vec;
  }

  // 1. Semantic concept clusters (dims 0..31)
  for (const cluster of CONCEPT_CLUSTERS) {
    let matchedCount = 0;
    for (const term of cluster.terms) {
      if (clean.includes(term)) {
        matchedCount += 1;
      }
    }
    if (matchedCount > 0) {
      vec[cluster.dim] += cluster.weight * (1 + Math.min(2, matchedCount * 0.35));
    }
  }

  // 2. Word unigrams + character 3-grams hashed into dims 32..127 (96 buckets)
  const words = clean.split(" ").filter((w) => w.length >= 2);
  for (const word of words) {
    const bucket = 32 + (hashToken(word) % 96);
    const sign = hashToken(word, 1315423911) % 2 === 0 ? 1 : -1;
    vec[bucket] += sign * 1.8;

    // Character 3-grams for typo tolerance ("guiter" ~ "guitar", partial names/addresses)
    const padded = `^${word}$`;
    for (let i = 0; i <= padded.length - 3; i++) {
      const trigram = padded.slice(i, i + 3);
      const triBucket = 32 + (hashToken(trigram, 2654435761) % 96);
      const triSign = hashToken(trigram, 97531) % 2 === 0 ? 1 : -1;
      vec[triBucket] += triSign * 0.55;
    }
  }

  // 3. L2 normalize for cosine similarity in pgvector
  let normSq = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm > 1e-8) {
    for (let i = 0; i < VECTOR_DIM; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(6));
    }
  } else {
    vec[0] = 1;
  }

  return vec;
}

export function toPgVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA < 1e-8 || normB < 1e-8) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const ROLE_SYNONYMS: Record<Role, string> = {
  vocalist: "vocal vocalist singer voice sing song lead melody কণ্ঠ গান গায়ক গায়িকা সুর",
  guitarist: "guitar guitarist guiter acoustic electric chords solo riff গিটার গিটারিস্ট তার অ্যাকুস্টিক ইলেকট্রিক সোলো",
  percussion: "percussion tabla dhol drum drums rhythm beat theka tala তবলা ঢোল ড্রাম ঠেকা তাল",
  flute: "flute bansuri woodwind bamboo বাঁশি বংশী",
  producer: "producer mix mixing master mastering arrangement studio daw stem মিক্স মাস্টার প্রোডিউসার স্টুডিও",
  lyricist: "lyricist lyrics songwriter composer poem words কথা গীতিকার সুরকার লিরিক্স",
};

/**
 * Builds the rich searchable document for a musician combining their profile,
 * location/address, skills/roles, instruments, genres, bio, showcase titles, and posts.
 */
export function buildUserSearchDocument(
  user: DbUser,
  collections: ShowcaseItem[],
  posts: CommunityPost[],
): string {
  const userCollections = collections.filter((c) => c.musicianId === user.id);
  const userPosts = posts.filter((p) => p.musicianId === user.id);
  const roleExpansions = user.roles.map((r) => ROLE_SYNONYMS[r] ?? r).join(" ");

  return [
    user.name,
    user.nameBn,
    user.email?.split("@")[0] ?? "",
    user.city,
    user.cityBn,
    ...(user.cityTerms ?? []),
    ...user.roles,
    roleExpansions,
    ...user.instruments,
    ...user.instrumentsBn,
    ...user.genres,
    ...user.genresBn,
    user.bio,
    user.bioBn,
    user.priceFromBdt ? `${user.priceFromBdt} bdt taka` : "",
    ...userCollections.map((c) => `${c.title} ${c.titleBn} ${c.kind}`),
    ...userPosts.map((p) => `${p.title} ${p.titleBn} ${p.text} ${p.textBn} ${p.roleTag}`),
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractReasonsForMatch(
  rawQuery: string,
  user: DbUser,
  collections: ShowcaseItem[],
  posts: CommunityPost[],
): MatchEvidence {
  const q = normalizeDigits(rawQuery.toLowerCase().trim());
  const qTokens = tokenizeQuery(q);
  const empty: MatchEvidence = {
    reasons: [],
    coverage: 0,
    matchedText: "",
    matchedSource: "profile",
    matchedTerms: [],
  };
  if (qTokens.length === 0) return empty;

  const userCols = collections.filter((c) => c.musicianId === user.id);
  const userPosts = posts.filter((p) => p.musicianId === user.id);

  // Each query token expands to itself plus its concept-cluster synonyms ("singer" -> "vocalist").
  const tokenGroups = qTokens.map((tok) => {
    const variants = new Set<string>([tok]);
    for (const cluster of CONCEPT_CLUSTERS) {
      if (cluster.dim === 16) continue;
      if (cluster.terms.some((term) => term.trim() === tok)) {
        for (const term of cluster.terms) {
          const clean = term.trim().toLowerCase();
          if (clean.length >= 3 && !clean.includes(" ") && !GENERIC_EXPANSION_TERMS.has(clean)) {
            variants.add(clean);
          }
        }
      }
    }
    return { tok, variants: [...variants] };
  });

  type Field = { reason: SemanticReason; source: MatchSource; text: string };
  const fields: Field[] = ([
    { reason: "name", source: "name", text: `${user.name} ${user.nameBn} ${user.email?.split("@")[0] ?? ""}` },
    { reason: "location", source: "location", text: [user.city, user.cityBn, ...(user.cityTerms ?? [])].join(" ") },
    {
      reason: "skill",
      source: "skills",
      text: [
        ...user.roles,
        ...user.roles.map((r) => ROLE_SYNONYMS[r] ?? ""),
        ...user.instruments,
        ...user.instrumentsBn,
      ].join(" "),
    },
    { reason: "genre", source: "genres", text: [...user.genres, ...user.genresBn, ...(user.genreTerms ?? [])].join(" ") },
    ...userCols.flatMap((c) => [
      { reason: "showcase" as const, source: "showcase" as const, text: c.title },
      { reason: "showcase" as const, source: "showcase" as const, text: c.titleBn },
    ]),
    ...userPosts.flatMap((p) => [
      { reason: "showcase" as const, source: "post" as const, text: `${p.title}. ${p.text}` },
      { reason: "showcase" as const, source: "post" as const, text: `${p.titleBn}. ${p.textBn}` },
    ]),
    ...splitSentences(user.bio).map((s) => ({ reason: "skill" as const, source: "bio" as const, text: s })),
    ...splitSentences(user.bioBn).map((s) => ({ reason: "skill" as const, source: "bio" as const, text: s })),
  ] satisfies Field[]).filter((f) => f.text.trim().length > 0);

  const reasons = new Set<SemanticReason>();
  const matchedTerms = new Set<string>();
  let matchedGroups = 0;

  for (const group of tokenGroups) {
    let groupMatched = false;
    for (const field of fields) {
      const hay = field.text.toLowerCase();
      const hit = group.variants.find((v) => hay.includes(v));
      if (hit) {
        groupMatched = true;
        reasons.add(field.reason);
        matchedTerms.add(hit);
      }
    }
    if (groupMatched) matchedGroups += 1;
  }

  const budgetMatch = q.match(/(\d{3,6})/);
  if (budgetMatch && user.priceFromBdt && user.priceFromBdt <= Number(budgetMatch[1])) {
    reasons.add("budget");
    matchedGroups += 1;
  }

  // Prefer content the musician wrote (showcase, post, bio) as the snippet over metadata fields.
  const sourcePriority: Record<MatchSource, number> = {
    showcase: 6,
    post: 5,
    bio: 4,
    skills: 3,
    genres: 2,
    location: 1,
    name: 0,
    profile: -1,
  };
  let best: { source: MatchSource; text: string; score: number } | null = null;
  const terms = [...matchedTerms];
  for (const field of fields) {
    if (field.source === "skills" || field.source === "genres" || field.source === "name") continue;
    const hay = field.text.toLowerCase();
    const count = terms.filter((term) => hay.includes(term)).length;
    if (count === 0) continue;
    const score = count * 10 + sourcePriority[field.source];
    if (!best || score > best.score) best = { source: field.source, text: field.text, score };
  }

  let matchedText: string;
  let matchedSource: MatchSource;
  if (best && best.source !== "location") {
    matchedText = trimAround(best.text, terms);
    matchedSource = best.source;
  } else {
    const fallback = splitSentences(user.bio)[0] || userCols[0]?.title || "";
    matchedText = trimAround(fallback, terms);
    matchedSource = fallback ? (splitSentences(user.bio)[0] ? "bio" : "showcase") : "profile";
  }

  return {
    reasons: [...reasons],
    coverage: matchedGroups / (tokenGroups.length + (budgetMatch ? 1 : 0)),
    matchedText,
    matchedSource,
    matchedTerms: terms,
  };
}
