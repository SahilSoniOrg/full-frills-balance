import {
  WORKPLACE_DATA_TABLES,
  WORKPLACE_SCOPED_TABLE_NAMES,
} from '@/src/services/workplace/workplaceDataTables';

describe('workplaceDataTables', () => {
  const exportTableNames = WORKPLACE_DATA_TABLES.map(({ table }) => table);

  it('includes every workplace-scoped table in export', () => {
    for (const table of WORKPLACE_SCOPED_TABLE_NAMES) {
      expect(exportTableNames).toContain(table);
    }
  });

  it('aligns purge list with the export table list', () => {
    expect([...WORKPLACE_SCOPED_TABLE_NAMES].sort()).toEqual(exportTableNames.sort());
  });
});
