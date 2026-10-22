import { describe, expect, it } from "vitest";
import { type AlertForTelegram, alertButtons, alertText, inQuietHours, type TelegramPrefs, wantsAlert } from "./message";

const alert = (o: Partial<AlertForTelegram> = {}): AlertForTelegram => ({
  alert_id: "a1",
  kind: "new",
  ask_pence: 2999,
  ref_price_pence: 8200,
  discount_pct: "63.43",
  previous_ask_pence: null,
  opportunity_id: "00000000-0000-0000-0000-000000000001",
  title: "2018-19 Juventus Away Shirt Ronaldo",
  condition: "Very Good",
  size: "XL",
  manufacturer: "Adidas",
  source_name: "Cushtykits",
  source_url: "https://www.ebay.co.uk/itm/1",
  pre_live: true,
  image_url: null,
  ask_currency: "GBP",
  ref_sold_at: new Date("2026-09-12T10:00:00Z"),
  ref_source: "cfs",
  saving_pence: 5201,
  confidence: "low",
  needs_review: true,
  match_notes: ["number missing on the listing", "size M vs XL"],
  ...o,
});
const prefs = (o: Partial<TelegramPrefs> = {}): TelegramPrefs => ({
  min_discount_pct: null,
  include_needs_check: true,
  live_only: false,
  quiet_from_hour: null,
  quiet_to_hour: null,
  ...o,
});

describe("telegram alert message", () => {
  it("says what it is, what it costs and why to check it", () => {
    const text = alertText(alert());
    expect(text).toContain("🟢 <b>New opportunity: 63% below</b>");
    expect(text).toContain("<b>2018-19 Juventus Away Shirt Ronaldo</b>");
    expect(text).toContain("Very Good · XL · Adidas · Cushtykits (pre-live)");
    expect(text).toContain("<b>Ask £29.99</b>");
    expect(text).toContain("Lowest sold £82 (12 Sept 2026, Classic Football Shirts)");
    expect(text).toContain("Saving <b>£52.01</b>");
    expect(text).toContain("⚠️ Needs a check: number missing on the listing; size M vs XL");
  });

  it("shows the previous price on a price drop and escapes HTML", () => {
    const text = alertText(alert({ kind: "price_drop", previous_ask_pence: 3999, title: "<b>Spurs</b> & co", needs_review: false }));
    expect(text).toContain("🔻 <b>Price drop: now 63% below</b>");
    expect(text).toContain("<b>Ask £29.99</b> (was £39.99)");
    expect(text).toContain("&lt;b&gt;Spurs&lt;/b&gt; &amp; co");
    expect(text).not.toContain("Needs a check");
  });

  it("gives buyers action buttons and viewers only links", () => {
    const buyer = alertButtons(alert(), "https://kb.example", true);
    expect(buyer[0].map((b) => b.url)).toEqual(["https://kb.example/opportunities/00000000-0000-0000-0000-000000000001", "https://www.ebay.co.uk/itm/1"]);
    expect(buyer[1].map((b) => b.callback_data)).toEqual([
      "w:00000000-0000-0000-0000-000000000001",
      "d:00000000-0000-0000-0000-000000000001",
      "r:00000000-0000-0000-0000-000000000001",
    ]);
    expect(buyer[1].every((b) => (b.callback_data ?? "").length <= 64)).toBe(true);
    expect(alertButtons(alert(), "https://kb.example", false)).toHaveLength(1);
  });
});

describe("telegram preferences", () => {
  it("filters by discount, confidence and pre-live", () => {
    expect(wantsAlert(prefs(), alert())).toBe(true);
    expect(wantsAlert(prefs({ min_discount_pct: "70" }), alert())).toBe(false);
    expect(wantsAlert(prefs({ min_discount_pct: 60 }), alert())).toBe(true);
    expect(wantsAlert(prefs({ include_needs_check: false }), alert())).toBe(false);
    expect(wantsAlert(prefs({ live_only: true }), alert())).toBe(false);
    expect(wantsAlert(prefs({ live_only: true }), alert({ pre_live: false }))).toBe(true);
  });

  it("knows quiet hours in UK time, including overnight", () => {
    const night = prefs({ quiet_from_hour: 23, quiet_to_hour: 7 });
    // 20 Oct 2026 is BST (UTC+1).
    expect(inQuietHours(night, new Date("2026-10-20T22:30:00Z"))).toBe(true); // 23:30 UK
    expect(inQuietHours(night, new Date("2026-10-21T05:59:00Z"))).toBe(true); // 06:59 UK
    expect(inQuietHours(night, new Date("2026-10-21T06:00:00Z"))).toBe(false); // 07:00 UK
    expect(inQuietHours(prefs({ quiet_from_hour: 12, quiet_to_hour: 14 }), new Date("2026-10-21T12:00:00Z"))).toBe(true); // 13:00
    expect(inQuietHours(prefs(), new Date())).toBe(false);
  });
});
