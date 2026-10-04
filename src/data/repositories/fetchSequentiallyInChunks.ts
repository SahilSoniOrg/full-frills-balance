const DEFAULT_QUERY_CHUNK_SIZE = 100;

/**
 * Fetches bounded ID queries in input-chunk order. Rows within each chunk retain
 * the underlying query's order; this helper does not promise global ID ordering.
 */
export async function fetchSequentiallyInChunks<TId extends string, TRow>(
  ids: readonly TId[],
  fetchChunk: (chunk: readonly TId[]) => Promise<readonly TRow[]>,
  chunkSize = DEFAULT_QUERY_CHUNK_SIZE,
): Promise<TRow[]> {
  const size = Math.max(1, chunkSize | 0);
  const rows: TRow[] = [];
  for (let index = 0; index < ids.length; index += size) {
    rows.push(...(await fetchChunk(ids.slice(index, index + size))));
  }
  return rows;
}
