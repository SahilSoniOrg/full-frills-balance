import { KeyOperationError } from '@/src/utils/keyOperationError';

/** Wire identifier, independent of payload encoding and application schema version. */
export const ROW_COMPRESSION = 'gzip' as const;
export type RowCompression = typeof ROW_COMPRESSION;

export function assertRowCompression(value: unknown): asserts value is RowCompression {
  if (value !== ROW_COMPRESSION) throw new KeyOperationError('FFB_ROW_UNSUPPORTED_COMPRESSION');
}
