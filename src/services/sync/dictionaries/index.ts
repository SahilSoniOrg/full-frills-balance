import { getRowTable, ROW_TABLE_NAMES, type RowTable } from '../rowTables';

export const MAX_DICTIONARY_BYTES = 16 * 1024;
export type RowDictionaryDefinition = Readonly<{
  id: string;
  table: RowTable;
  version: number;
  file: string;
}>;
/** Build-time metadata for the deterministic byte artifacts embedded by the native crypto core. */
export const ROW_DICTIONARIES: readonly RowDictionaryDefinition[] = Object.freeze(
  ROW_TABLE_NAMES.map(table =>
    Object.freeze({ id: `${table}/v1`, table, version: 1, file: `${table}.v1.bin` }),
  ),
);
export function getRowDictionary(table: RowTable, dictId: string): RowDictionaryDefinition {
  getRowTable(table);
  const definition = ROW_DICTIONARIES.find(entry => entry.id === dictId && entry.table === table);
  if (!definition) throw new Error(`FFB_ROW_UNKNOWN_DICT: ${dictId}`);
  return definition;
}
