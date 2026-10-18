import {
  WORKPLACE_DATA_TABLES,
  WORKPLACE_SCOPED_TABLE_NAMES,
} from '@/src/services/workplace/workplaceDataTables';

describe('workplaceDataTables', () => {
  const exportTableNames = WORKPLACE_DATA_TABLES.map(({ table }) => table);

  it('purges device-local sync state without adding it to plaintext exports', () => {
    for (const table of exportTableNames) expect(WORKPLACE_SCOPED_TABLE_NAMES).toContain(table);
    for (const table of [
      'sync_row_index',
      'sync_checkpoints',
      'sync_conflicts',
      'sync_pending_commits',
    ]) {
      expect(WORKPLACE_SCOPED_TABLE_NAMES).toContain(table);
      expect(exportTableNames).not.toContain(table);
    }
  });
});
