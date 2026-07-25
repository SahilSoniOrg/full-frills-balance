import {
  WORKPLACE_DATA_TABLES,
  WORKPLACE_EXPORT_GLOBAL_TABLE_NAMES,
  WORKPLACE_SCOPED_TABLE_NAMES,
} from '@/src/services/workplace/workplaceDataTables';

describe('workplaceDataTables', () => {
  const exportTableNames = WORKPLACE_DATA_TABLES.map(({ table }) => table);

  it('includes every workplace-scoped table in export', () => {
    for (const table of WORKPLACE_SCOPED_TABLE_NAMES) {
      expect(exportTableNames).toContain(table);
    }
  });

  it('keeps global reference tables in export but out of purge list', () => {
    for (const table of WORKPLACE_EXPORT_GLOBAL_TABLE_NAMES) {
      expect(exportTableNames).toContain(table);
      expect(WORKPLACE_SCOPED_TABLE_NAMES).not.toContain(table);
    }
  });

  it('aligns purge list with export minus global tables', () => {
    const globalSet = new Set<string>(WORKPLACE_EXPORT_GLOBAL_TABLE_NAMES);
    const exportScoped = exportTableNames.filter(table => !globalSet.has(table));
    expect([...WORKPLACE_SCOPED_TABLE_NAMES].sort()).toEqual(exportScoped.sort());
  });
});
