/**
 * Runs an async job over a list, a few at a time.
 *
 * The history replay needs every revision of a note in memory before it can
 * play smoothly, and a note edited daily for a year has a lot of revisions.
 * Firing all of them at once is the obvious thing and the wrong one: the
 * browser caps its own connections anyway, so the requests queue regardless,
 * and GitHub's rate limit is spent in one burst that the rest of the app then
 * has to wait out. A small pool keeps the network busy without doing either.
 *
 * Results come back in the order the items were given, not the order they
 * finished — a caller indexing into the result by position should not have to
 * think about scheduling.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  job: (item: T, index: number) => Promise<R>,
  options: { signal?: AbortSignal } = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  // A limit below one would mean no worker ever starts, and the returned
  // promise would never settle. Treat it as "one at a time".
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      // Read and advance in one step: this is single-threaded, so no two
      // workers can land on the same index between these two lines.
      const index = next;
      next += 1;
      if (index >= items.length) return;
      if (options.signal?.aborted) return;

      results[index] = await job(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workers }, run));
  return results;
}
