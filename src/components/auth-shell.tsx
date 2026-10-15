export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">KickBuy</p>
        <h1 className="mt-1 mb-5 text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
