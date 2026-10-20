// Kickio files some items that aren't a football shirt under "Football
// Shirts" (shorts, training and leisure wear, fan tees, jackets, rugby
// shirts...) and gives them a generated "... Shirt" title, sometimes with the
// wrong shirt type ("Home" for a fan tee). Other evidence still says what the
// item really is: the shop's product URL and code, Kickio's shirt type, and
// the listing description. Any one of them is enough to rule an item out.

type Item = { source_url: string | null; shirt_type: string | null; description: string | null };

// Whole words in the URL path. "shorts" may run straight into a product code
// ("third-shortshe2980"), so it only needs a boundary before it.
const URL_WORDS =
  /(?:^|[^a-z])(shorts(?!leeve)|short(?!-?sleeve)(?=[^a-z]|$)|(?:rugby|basketball|baseball|hockey|cricket|nba|nfl|mlb|nhl|vest|polo|jacket|tracksuit|trracksuit|track-top|training-top|hooded|hoodie|hoody|sweat|sweatshirt|sweater|jumper|fleece|gilet|socks|scarf|pants|trousers|bottoms|anorak|windbreaker|coat|t-shirt|tee|full-kit|mini-kit|rework|backpack|bag|patch|name-set|mystery-box)(?=[^a-z]|$))/;

// Classic Football Shirts' legacy product codes: team letters, a type code,
// then digits ("livh13492624" = Liverpool home, "fratr9805771" = France
// training/leisure). Only unambiguous non-shirt codes are used ("sh" also
// appears on home shirts).
const CFS_CODE = /-[a-z]{3,4}?(tr|j)\d[0-9a-z]*\.html$/;
const CFS_KINDS: Record<string, string> = { tr: "training or leisure wear", j: "a jacket or top" };

// Kickio shirt types that are never a match shirt.
const TYPES =
  /\b(training|polo|fan|supporter|leisure|lifestyle|pre-?match|base ?layer|compression|graphic|cotton|tour|academy|youth camp|button-up|warm ?up|travel|tee|jacket|hooded|shorts|vest|presentation|casual)\b/;

// Description phrases that say what the item is. Deliberately specific: a
// shirt's description can mention training or shorts in passing. Reversible
// shirts (England 2002-05) describe the training shirt on the inside.
const DESCRIPTION =
  /\b(fan shirt|fans? (?:edition|version) shirt|supporters?'? shirt|training (?:top|shirt|jersey|tee|vest)|polo shirt|t-shirt|tee shirt|(?:1\/4|1\/2|quarter|half)[- ]zip|track (?:top|jacket)|sweatshirt|hoodie|hooded top|pre-?match (?:top|shirt)|warm[- ]up (?:top|shirt)|leisure (?:top|shirt)|rugby shirt)\b/;

// Why an item isn't a football shirt, or null when it is (or we can't tell).
export function notAFootballShirt(item: Item): string | null {
  if (item.source_url) {
    const url = item.source_url.toLowerCase();
    const path = url.replace(/^[a-z]+:\/\/[^/]+/, "").replace(/[?#].*$/, "");
    const word = URL_WORDS.exec(path);
    if (word) return `Not a football shirt: the source listing is "${word[1]}"`;
    if (/^https?:\/\/(www\.)?classicfootballshirts\./.test(url)) {
      const code = CFS_CODE.exec(path);
      if (code) return `Not a football shirt: the shop's product code marks it as ${CFS_KINDS[code[1]]}`;
    }
  }
  const type = item.shirt_type && TYPES.exec(item.shirt_type.toLowerCase());
  if (type) return `Not a football shirt: Kickio lists it as "${item.shirt_type}"`;
  const description = item.description && decodeEntities(item.description).toLowerCase();
  const text = description && !/reversible|inside out/.test(description) && DESCRIPTION.exec(description);
  if (text) return `Not a football shirt: the description says "${text[1]}"`;
  return null;
}

// Scraped descriptions can arrive HTML-escaped ("Fan&#x20;shirt").
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}
