import type { RecordType } from './rowHeader';
import type { RowEnvelopeJson } from './envelopeJson';
import type { KeyOperationErrorCode } from '@/src/utils/keyOperationError';

export const MAX_ROW_PLAINTEXT_BYTES = 64 * 1024;
export const MAX_ROW_CIPHERTEXT_BYTES = 68 * 1024;
export const MAX_ROW_BATCH_COUNT = 500;
export const MAX_ROW_BATCH_BYTES = 4 * 1024 * 1024;
export type EncryptRow = Readonly<{
  table: RecordType;
  rowId: string;
  updatedAt: number;
  deleted: boolean;
  schemaVersion: number;
  dictId: string;
  plaintext: string;
}>;
export type DecryptedRow = Readonly<
  | {
      ok: true;
      table: RecordType;
      rowId: string;
      schemaVersion: number;
      dictId: string;
      plaintext: string;
    }
  | { ok: false; table: RecordType; rowId: string; error: KeyOperationErrorCode }
>;
export type EncryptedRows = readonly RowEnvelopeJson[];
