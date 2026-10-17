// Kickio files some items that aren't a single football shirt under
// "Football Shirts" (shorts, shirt-and-shorts sets, training tops and vests,
// polos, rugby shirts...) and gives them a generated "... Shirt" title. The
// shop's own product URL still names the real item, so it decides.

// Whole words in the URL path. "shorts" may run straight into a product code
// ("third-shortshe2980"), so it only needs a boundary before it.
const NOT_A_FOOTBALL_SHIRT =
  /(?:^|[^a-z])(shorts(?!leeve)|(?:rugby|basketball|baseball|hockey|cricket|nba|nfl|mlb|nhl|vest|polo|jacket|tracksuit|track-top|training-top|hoodie|hoody|sweatshirt|sweater|jumper|fleece|gilet|socks|scarf|pants|trousers|anorak|windbreaker|coat|t-shirt|tee)(?=[^a-z]|$))/;

// Why a listing isn't a football shirt, or null when it is (or we can't tell).
export function notAFootballShirt(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  const path = sourceUrl.toLowerCase().replace(/^[a-z]+:\/\/[^/]+/, "");
  const m = NOT_A_FOOTBALL_SHIRT.exec(path);
  return m ? `Not a football shirt: the source listing is "${m[1]}"` : null;
}
