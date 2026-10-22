import { assertSafeNonnegativeInteger } from '@/src/services/crypto/protocol/tlv';
import {
  parseRowEnvelope as parseProtocolEnvelope,
  assertCompleteStateMembership,
  type RowEnvelope as ProtocolRowEnvelope,
  type RowScope,
} from '@/src/services/crypto/protocol/rowEnvelope';
import { encodeRowHeader } from '@/src/services/crypto/protocol/rowHeader';
import { assertRowTable, type RowTable } from './rowTables';

export type RowEnvelope = ProtocolRowEnvelope & { table: RowTable };

/** Financial profile checks live above the schema-independent protocol. */
function narrowEnvelope(envelope: ProtocolRowEnvelope, scope: RowScope): RowEnvelope {
  assertRowTable(envelope.table);
  if (envelope.table === 'workplace' && (envelope.rowId !== scope.workplaceId || envelope.deleted))
    throw new Error('Invalid singleton workplace envelope');
  return { ...envelope, table: envelope.table };
}
export function parseRowEnvelope(value: unknown, scope: RowScope): RowEnvelope {
  return narrowEnvelope(parseProtocolEnvelope(value, scope), scope);
}
export function rowEnvelopeAad(value: unknown, scope: RowScope): Uint8Array {
  return encodeRowHeader(parseRowEnvelope(value, scope));
}
/** Complete financial state includes exactly one live Workplace metadata row. */
export function validateCompleteEnvelopeState(
  values: readonly unknown[],
  scope: RowScope,
  rowCount: number,
): readonly RowEnvelope[] {
  assertSafeNonnegativeInteger(rowCount, 'rowCount');
  if (values.length !== rowCount) throw new Error('State rowCount mismatch');
  const rows = values.map(value => parseRowEnvelope(value, scope));
  assertCompleteStateMembership(rows, rowCount);
  if (rows.filter(row => row.table === 'workplace').length !== 1)
    throw new Error('Complete state requires exactly one live workplace row');
  return rows;
}
