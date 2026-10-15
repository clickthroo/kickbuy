// Normalisation of Kickio's free-text attributes into comparable keys.
//
// Deliberately conservative: anything we can't read with confidence becomes
// null ("unknown") rather than a guess, and the matcher treats unknowns as a
// reason to ask for manual review, never as a match.

// Kickio's condition grades (kickioapp src/features/listings/schemas.ts).
export const CONDITIONS = [
  "Brand New (With Tags)",
  "Mint",
  "Very Good",
  "Good",
  "Fair",
  "Needs Attention",
] as const;
export type Condition = (typeof CONDITIONS)[number];

const CONDITION_BY_KEY = new Map<string, Condition>(CONDITIONS.map((c) => [c.toLowerCase(), c]));

export function norm(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return s === "" ? null : s;
}

// Only Kickio's exact grades count (any case/spacing). Typos such as
// "Excelllent" are not mapped: a condition we can't read is never valued
// against a guess.
export function canonicalCondition(value: string | null | undefined): Condition | null {
  const k = norm(value);
  return k === null ? null : (CONDITION_BY_KEY.get(k) ?? null);
}

// "1997/98", "97-98", "1997-1998" → "1997-98"; "1998" stays "1998".
export function normaliseSeason(value: string | null | undefined): string | null {
  const s = norm(value);
  if (s === null) return null;
  const range = /^(\d{2}|\d{4})\s*[-/]\s*(\d{2}|\d{4})$/.exec(s);
  if (range) {
    const start = range[1].length === 2 ? expandYear(range[1]) : Number(range[1]);
    const end = range[2].length === 2 ? Number(range[2]) : Number(range[2]) % 100;
    return `${start}-${String(end).padStart(2, "0")}`;
  }
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{2}$/.test(s)) return String(expandYear(s));
  return s;
}

function expandYear(two: string): number {
  const n = Number(two);
  return n >= 50 ? 1900 + n : 2000 + n;
}

export type SizeBand = "adult" | "kids" | "one_size";
export type NormalisedSize = { key: string | null; band: SizeBand | null };

const ADULT_WORDS: Record<string, string> = {
  "extra small": "XS",
  "x small": "XS",
  xsmall: "XS",
  small: "S",
  medium: "M",
  large: "L",
  "extra large": "XL",
  "x large": "XL",
  xlarge: "XL",
  "xx large": "XXL",
  xxlarge: "XXL",
  "2xl": "XXL",
  xxxl: "3XL",
  "xxx large": "3XL",
  "xxxx large": "4XL",
  xxxxl: "4XL",
};
const ADULT_KEYS = new Set(["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"]);

// Sizes are messy ("Large", "XL.Boys", "Kids, 13-14Y", "M, L"). We only need
// two things: an exact key when we can read one, and the band (adult / kids /
// one size), because a kids' shirt must never be valued against an adult one.
export function normaliseSize(value: string | null | undefined): NormalisedSize {
  const s = norm(value);
  if (s === null) return { key: null, band: null };
  if (/one size|^os$/.test(s)) return { key: "ONE SIZE", band: "one_size" };

  const kids = /\b(kid|kids|boy|boys|girl|girls|youth|junior|jnr|infant|baby|child|children)\b|years?|yrs?|\d+\s*-\s*\d+\s*y\b|\b\d+y\b|\bmb\b|\blb\b|\bsb\b|\bxlb\b/.test(
    s,
  );
  if (kids) {
    const ages = /(\d{1,2})\s*-\s*(\d{1,2})/.exec(s);
    if (ages) return { key: `${Number(ages[1])}-${Number(ages[2])}Y`, band: "kids" };
    const letter = /\b(xs|s|m|l|xl)\b/.exec(s.replace(/[.,]/g, " "));
    return { key: letter ? `${letter[1].toUpperCase()} KIDS` : null, band: "kids" };
  }

  if (/[,/&]| or /.test(s)) return { key: null, band: "adult" }; // "M, L": ambiguous
  const compact = s.replace(/[\s.-]+/g, " ").trim();
  const word = ADULT_WORDS[compact] ?? ADULT_WORDS[compact.replace(/ /g, "")];
  if (word) return { key: word, band: "adult" };
  const upper = compact.replace(/ /g, "").toUpperCase();
  if (ADULT_KEYS.has(upper)) return { key: upper, band: "adult" };
  return { key: null, band: null };
}

// Player names: accents, case and punctuation don't matter.
export function normalisePlayer(value: string | null | undefined): string | null {
  const s = norm(value);
  if (s === null) return null;
  const k = s.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return k === "" ? null : k;
}

export function normaliseNumber(value: string | null | undefined): string | null {
  const s = norm(value);
  if (s === null) return null;
  const k = s.replace(/^#/, "").replace(/^0+(?=\d)/, "").trim();
  return k === "" ? null : k;
}

// "Other" / "Unknown" carry no information.
export function normaliseManufacturer(value: string | null | undefined): string | null {
  const s = norm(value);
  if (s === null || s === "other" || s === "unknown" || s === "n/a") return null;
  return s;
}

export function normaliseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return norm(value);
  }
}
