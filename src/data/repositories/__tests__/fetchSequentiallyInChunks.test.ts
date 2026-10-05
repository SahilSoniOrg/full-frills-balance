import { fetchSequentiallyInChunks } from '../fetchSequentiallyInChunks';

describe('fetchSequentiallyInChunks', () => {
  it.each([
    { count: 601, chunkSize: 100, expectedChunkSizes: [100, 100, 100, 100, 100, 100, 1] },
    { count: 250, chunkSize: 100, expectedChunkSizes: [100, 100, 50] },
    { count: 1, chunkSize: 100, expectedChunkSizes: [1] },
  ])(
    'fetches $count ids in chunks of $chunkSize',
    async ({ count, chunkSize, expectedChunkSizes }) => {
      const ids = Array.from({ length: count }, (_, index) => `id-${index}`);
      const fetchChunk = jest.fn(async (chunk: readonly string[]) => chunk.map(id => ({ id })));

      const rows = await fetchSequentiallyInChunks(ids, fetchChunk, chunkSize);

      expect(rows).toHaveLength(count);
      expect(fetchChunk.mock.calls.map(([chunk]) => chunk.length)).toEqual(expectedChunkSizes);
      expect(fetchChunk.mock.calls.flatMap(([chunk]) => chunk)).toEqual(ids);
    },
  );
});
