// Times a server-side data call and fails it (with its name) if it stalls,
// so a hang shows up as a clear error in the logs instead of a 300s timeout.
export async function timed<T>(label: string, work: Promise<T>, limitMs = 20_000): Promise<T> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} took longer than ${limitMs / 1000}s`)), limitMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    const ms = Date.now() - started;
    if (ms > 2000) console.warn(`[slow] ${label} ${ms}ms`);
  }
}
