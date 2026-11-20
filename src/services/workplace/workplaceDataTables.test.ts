import {
  WORKPLACE_DATA_TABLES,
  WORKPLACE_SCOPED_TABLE_NAMES,
} from '@/src/services/workplace/workplaceDataTables';

describe('workplaceDataTables', () => {
  const exportTableNames = WORKPLACE_DATA_TABLES.filter(task => !task.purgeOnly).map(
    ({ table }) => table,
  );

  it('purges every table listed in the registry', () => {
    for (const { table } of WORKPLACE_DATA_TABLES) {
      expect(WORKPLACE_SCOPED_TABLE_NAMES).toContain(table);
    }
  });

  it('purges internal rebuild intents without exporting them', () => {
    expect(WORKPLACE_SCOPED_TABLE_NAMES).toContain('balance_rebuild_intents');
    expect(exportTableNames).not.toContain('balance_rebuild_intents');
    expect(
      WORKPLACE_SCOPED_TABLE_NAMES.filter(table => table !== 'balance_rebuild_intents').sort(),
    ).toEqual(exportTableNames.sort());
  });
});
