import Link from "next/link";
import { CONDITIONS } from "@/lib/engine/normalise";
import { type Filters, hasFilters, LISTING_FILTERS, SORTS, STATUS_FILTERS } from "@/lib/filters";
import { saleSourceLabel } from "@/lib/labels";

// A plain GET form, so filters live in the URL and work without JavaScript.
export function FilterBar({ f, sources }: { f: Filters; sources: string[] }) {
  return (
    <details className="card" open={hasFilters(f)}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Filter and sort
        <span className="ml-2 font-normal text-muted">
          {SORTS[f.sort]}
          {hasFilters(f) && " · filtered"}
        </span>
      </summary>
    <form method="get" className="grid gap-3 border-t border-border p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
      <label className="sm:col-span-2">
        <span className="label">Search title</span>
        <input name="q" defaultValue={f.q} placeholder="e.g. Umbro 1997" className="input mt-1" />
      </label>
      <label>
        <span className="label">Club / country</span>
        <input name="club" defaultValue={f.club} className="input mt-1" />
      </label>
      <label>
        <span className="label">Season</span>
        <input name="season" defaultValue={f.season} placeholder="1997-98" className="input mt-1" />
      </label>
      <label>
        <span className="label">Condition</span>
        <select name="condition" defaultValue={f.condition} className="input mt-1">
          <option value="">Any</option>
          {CONDITIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Listing</span>
        <select name="listing" defaultValue={f.listing} className="input mt-1">
          {Object.entries(LISTING_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Opportunity status</span>
        <select name="status" defaultValue={f.status} className="input mt-1">
          {Object.entries(STATUS_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="label">Ask from £</span>
          <input name="min" type="number" min={0} step="1" defaultValue={f.minPrice ?? ""} className="input mt-1" />
        </label>
        <label className="flex-1">
          <span className="label">to £</span>
          <input name="max" type="number" min={0} step="1" defaultValue={f.maxPrice ?? ""} className="input mt-1" />
        </label>
      </div>
      <label>
        <span className="label">Min discount %</span>
        <input name="disc" type="number" min={0} max={99} step="1" defaultValue={f.minDiscount ?? ""} className="input mt-1" />
      </label>
      <label>
        <span className="label">Confidence</span>
        <select name="conf" defaultValue={f.confidence} className="input mt-1">
          <option value="">Any</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low (needs review)</option>
        </select>
      </label>
      <label>
        <span className="label">Listed since</span>
        <input name="since" type="date" defaultValue={f.listedSince} className="input mt-1" />
      </label>
      <label>
        <span className="label">Reference sale from</span>
        <select name="src" defaultValue={f.refSource} className="input mt-1">
          <option value="">Any source</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {saleSourceLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="label">Sort by</span>
        <select name="sort" defaultValue={f.sort} className="input mt-1">
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-3 lg:col-span-6">
        <button className="btn">Apply</button>
        {hasFilters(f) && (
          <Link href="/" className="btn btn-secondary">
            Clear
          </Link>
        )}
      </div>
    </form>
    </details>
  );
}
