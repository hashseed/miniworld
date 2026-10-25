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

/**
 * The largest a minute's tree file may be, Brotli, before the tree is split by tile as well
 * (humankind.md section 8).
 */
export const TREE_MINUTE_LIMIT_BYTES = 100_000;

const TREE_MINUTE = /^tree\/m\d+\./;

/** One line per file over its limit, largest first; empty when every file fits. */
export function chunkSizeProblems(
  sizes: ReadonlyMap<string, number>,
  limit = CHUNK_LIMIT_BYTES,
  treeLimit = TREE_MINUTE_LIMIT_BYTES,
): string[] {
  const kb = (n: number) => (n / 1000).toFixed(0);
  return largestFiles(sizes, sizes.size).flatMap(([name, n]) =>
    n > limit
      ? [`${name} is ${kb(n)} KB Brotli, over the ${kb(limit)} KB limit`]
      : TREE_MINUTE.test(name) && n > treeLimit
        ? [
            `${name} is ${kb(n)} KB Brotli, over the ${kb(treeLimit)} KB of a minute's tree file: ` +
              'split the tree by tile (humankind.md section 8)',
          ]
        : [],
  );
}
