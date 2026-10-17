import type { RowTable } from './rowTables';

export type RowSourceRecord = Readonly<{
  table: RowTable;
  rowId: string;
  updatedAt: number;
  deleted: boolean;
  content: Readonly<Record<string, unknown>>;
}>;

export type PhysicalRowTable = Exclude<RowTable, 'workplace'>;
