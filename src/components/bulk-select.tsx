"use client";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { removeOpportunities } from "@/app/(app)/opportunities/actions";

type Selection = { selected: Set<string>; toggle: (id: string) => void; setAll: (on: boolean) => void; ids: string[] };
const Ctx = createContext<Selection | null>(null);

// Tick opportunities in a list and remove them together. Removing is for
// good, so it takes a second tap, in the bar rather than a browser dialog.
export function BulkSelection({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  // Rows can disappear after a refresh (removed, expired): forget them.
  const live = new Set([...selected].filter((id) => ids.includes(id)));
  const toggle = (id: string) => {
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const setAll = (on: boolean) => {
    setMessage(null);
    setSelected(on ? new Set(ids) : new Set());
  };
  const clear = () => {
    setSelected(new Set());
    setConfirming(false);
  };
  const remove = () =>
    start(async () => {
      const { removed } = await removeOpportunities([...live]);
      clear();
      setMessage(`Removed ${removed} opportunit${removed === 1 ? "y" : "ies"}.`);
    });

  return (
    <Ctx.Provider value={{ selected: live, toggle, setAll, ids }}>
      {children}
      {(live.size > 0 || message) && (
        <div className="sticky bottom-3 z-30 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 shadow-lg">
          {live.size > 0 ? (
            <>
              <span className="px-2 text-sm font-medium">{live.size} selected</span>
              {confirming ? (
                <>
                  <button
                    type="button"
                    className="btn h-11 border-warn! bg-warn! text-white! md:h-9"
                    disabled={pending}
                    onClick={remove}
                    autoFocus
                  >
                    {pending ? "Removing…" : `Remove ${live.size} for good`}
                  </button>
                  <button type="button" className="btn btn-secondary h-11 md:h-9" disabled={pending} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary h-11 text-warn! md:h-9" onClick={() => setConfirming(true)}>
                    Remove {live.size}
                  </button>
                  <button type="button" className="btn btn-secondary h-11 md:h-9" onClick={clear}>
                    Clear
                  </button>
                </>
              )}
            </>
          ) : (
            <span className="px-2 text-sm text-muted">{message}</span>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

const box = "h-5 w-5 cursor-pointer accent-[var(--accent)]";

// One row's tick box, with a finger-sized hit area on phones.
export function SelectBox({ id, title }: { id: string; title: string }) {
  const s = useContext(Ctx);
  if (!s) return null;
  return (
    <label className="relative z-20 -m-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center md:h-8 md:w-8">
      <input type="checkbox" className={box} checked={s.selected.has(id)} onChange={() => s.toggle(id)} aria-label={`Select ${title}`} />
    </label>
  );
}

// Select or clear every row in the list; shows a dash when some are ticked.
export function SelectAllBox({ label = false }: { label?: boolean }) {
  const s = useContext(Ctx);
  const ref = useRef<HTMLInputElement>(null);
  const all = !!s && s.ids.length > 0 && s.selected.size === s.ids.length;
  const some = !!s && s.selected.size > 0 && !all;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  if (!s) return null;
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-0">
      <input ref={ref} type="checkbox" className={box} checked={all} onChange={() => s.setAll(!all)} aria-label="Select all" />
      {label && <span>{all ? "Clear selection" : `Select all ${s.ids.length}`}</span>}
    </label>
  );
}
