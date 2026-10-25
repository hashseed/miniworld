// The chunk size limit of spec milestone 1, section 10.8: no file the build writes may be
// larger than 1 MB as it is sent, its Brotli copy.

/** The largest a file's Brotli copy may be, in bytes. */
export const CHUNK_LIMIT_BYTES = 1_000_000;

/** The `count` largest files by compressed size, largest first. */
export function largestFiles(
  sizes: ReadonlyMap<string, number>,
  count: number,
): [string, number][] {
  return [...sizes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, count);
}

/** One line per file over the limit, largest first; empty when every file fits. */
export function chunkSizeProblems(
  sizes: ReadonlyMap<string, number>,
  limit = CHUNK_LIMIT_BYTES,
): string[] {
  return largestFiles(sizes, sizes.size)
    .filter(([, n]) => n > limit)
    .map(
      ([name, n]) =>
        `${name} is ${(n / 1000).toFixed(0)} KB Brotli, over the ${limit / 1000} KB limit`,
    );
}
