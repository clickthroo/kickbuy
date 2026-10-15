"use client";
import { useEffect, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { verifyMfa } from "./actions";

type Mode =
  | { kind: "loading" }
  | { kind: "enrol"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

// Every KickBuy session must reach AAL2. First sign-in enrols an
// authenticator app; later sign-ins ask for its current code.
export function MfaForm() {
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setMode({ kind: "error", message: error.message });
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setMode({ kind: "verify", factorId: verified.id });

      // Clear any half-finished enrolment before starting a new one.
      for (const f of data.all.filter((f) => f.status === "unverified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const enrol = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "KickBuy" });
      if (enrol.error) return setMode({ kind: "error", message: enrol.error.message });
      setMode({
        kind: "enrol",
        factorId: enrol.data.id,
        qr: enrol.data.totp.qr_code,
        secret: enrol.data.totp.secret,
      });
    })();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind !== "enrol" && mode.kind !== "verify") return;
    const factorId = mode.factorId;
    setError(null);
    // Verified server-side; on success the action redirects to the app.
    startTransition(async () => {
      const message = await verifyMfa(factorId, code.trim());
      if (message) setError(message);
    });
  }

  if (mode.kind === "loading") return <p className="text-sm text-muted">Loading…</p>;
  if (mode.kind === "error") return <p className="text-sm text-warn">{mode.message}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode.kind === "enrol" ? (
        <div className="space-y-3 text-sm">
          <p>Scan this with an authenticator app (1Password, Google Authenticator, Authy…), then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mode.qr} alt="Authenticator QR code" className="mx-auto h-44 w-44 rounded bg-white p-2" />
          <p className="text-xs text-muted">
            Can&apos;t scan? Enter this key: <code className="break-all font-mono">{mode.secret}</code>
          </p>
        </div>
      ) : (
        <p className="text-sm">Enter the 6-digit code from your authenticator app.</p>
      )}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        className="input text-center font-mono text-lg tracking-[0.4em]"
      />
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn w-full justify-center" disabled={pending}>
        {pending ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}
