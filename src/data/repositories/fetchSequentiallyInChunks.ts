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
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError('chunkSize must be a positive integer');
  }

  const rows: TRow[] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    rows.push(...(await fetchChunk(ids.slice(index, index + chunkSize))));
  }
  return rows;
}
