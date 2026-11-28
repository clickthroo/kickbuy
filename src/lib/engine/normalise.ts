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
  // "Medium adult", "XXL (2XL)", "Mens L".
  const plain = s.replace(/\([^)]*\)/g, " ").replace(/\b(adults?|mens|men's|men|unisex)\b/g, " ");
  const compact = plain.replace(/[\s.-]+/g, " ").trim();
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

// A player name reduced to the surname, so "Steven Gerrard", "Gerrard" and
// scraped noise like "Barcelona Messi" or "Centenary Lampard" all compare
// equal. Numbers still have to agree when both sides have one.
export function playerKey(value: string | null | undefined): string | null {
  const s = normalisePlayer(value);
  if (s === null) return null;
  const words = s.split(" ").filter((w) => /[a-z]/.test(w));
  return words.length ? words[words.length - 1] : s;
}

// Words that sit next to a number in a product URL without being a printed
// name: kit words, sizes, makers, grades.
const NOT_A_NAME = new Set(
  (
    "shirt jersey top kit football soccer home away third fourth gk goalkeeper keeper training ls ss long short sleeve " +
    "sleeved retro vintage classic original authentic player issue match worn prepared replica bnwt bnib new tags kids " +
    "boys girls youth junior womens ladies mens adult small medium large xs s m l xl xxl xxxl xxxxl 2xl 3xl 4xl 5xl " +
    "mboys lboys xlboys sboys xsboys yrs years months size the and with of edition special limited anniversary centenary " +
    "cup final league champions europa season euro world adidas nike umbro puma kappa diadora reebok lotto hummel " +
    "le coq sportif errea macron joma castore admiral asics mizuno uhlsport fila hummel new balance under armour " +
    "warrior pony ribero bukta patrick o neills avec score draw signed"
  ).split(" "),
);

// The name and number printed on the shirt, when the shop's product URL says
// ("…-third-shirt-gerrard-8-8-10", "…-home-shirt-gerrard-8-610-3xl-…",
// "…-football-shirt-l-diadora-8-eustace-ff301925"). Kickio often leaves the
// player blank on scraped items, so without this a Gerrard 8 shirt would be
// compared with a plain one. Only looks after the "shirt" word, and only at
// a 1-2 digit number next to a word that isn't a size, maker or kit word.
export function namesetFromUrl(url: string | null | undefined): { player: string; number: string } | null {
  if (!url) return null;
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  const slug = path.replace(/\/$/, "").split("/").pop()?.replace(/\.html?$/, "") ?? "";
  const tokens = slug.split("-");
  const start = tokens.findIndex((t) => t === "shirt" || t === "jersey");
  if (start < 0) return null;
  const isName = (t: string | undefined) => !!t && /^[a-z]{3,}$/.test(t) && !NOT_A_NAME.has(t);
  for (let i = start + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/^\d{1,2}$/.test(t) || t === "0") continue;
    if (isName(tokens[i - 1])) return { player: tokens[i - 1], number: String(Number(t)) };
    // "8-10" is a condition grade, not a number.
    if (/^(9|10|11)$/.test(tokens[i + 1] ?? "") && Number(t) <= 10) continue;
    if (isName(tokens[i + 1])) return { player: tokens[i + 1], number: String(Number(t)) };
  }
  return null;
}
