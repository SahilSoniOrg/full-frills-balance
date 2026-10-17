import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { schema } from '@/src/data/database/schema';
import { currencyReadService } from '@/src/services/currency-read-service';
import { preferences } from '@/src/services/preferences';
import type { WorkplaceId } from '@/src/types/ids';
import { ROW_TABLES } from './rowTables';
import type { RowSourceRecord } from './rowRecords';
import { validateWorkplaceRows } from './workplaceRowValidation';
import {
  TABLE_COLUMNS,
  type PhysicalRowTable,
  preparePhysicalRow,
  collectCurrencyCodes,
  prepareWorkplaceMetadata,
} from './rowPreparation';
import { snakeToCamel } from '@/src/utils/serialization';

export type { RowSourceRecord } from './rowRecords';

/** Phase 5 can consume these rows while holding its database writer lock. */
export interface RowSource {
  readWorkplaceRows(workplaceId: WorkplaceId): Promise<readonly RowSourceRecord[]>;
  /** Caller already holds the database writer; never enqueue a nested reader. */
  readWorkplaceRowsInWriter(workplaceId: WorkplaceId): Promise<readonly RowSourceRecord[]>;
}

const PAGE_SIZE = 250;
async function readConsistentRows(workplaceId: WorkplaceId): Promise<readonly RowSourceRecord[]> {
  const workplace = await workplaceRepository.find(workplaceId);
  if (!workplace) throw new Error('Workplace not found for row source');
  const data: RowSourceRecord[] = [];

  for (const definition of ROW_TABLES) {
    if (definition.table === 'workplace') continue;
    const table = definition.table as PhysicalRowTable;
    const columns = ['id', ...TABLE_COLUMNS[table].split(' ')].map(name => ({
      source: name,
      alias: snakeToCamel(name),
    }));
    const descriptors = TABLE_COLUMNS[table].split(' ').map(snake => {
      const column = schema.tables[table].columns[snake];
      if (!column) throw new Error(`Missing schema column ${table}.${snake}`);
      return { name: snakeToCamel(snake), type: column.type };
    });
    let afterId: string | undefined;
    while (true) {
      const page = await exportRepository.fetchTablePage({
        tableName: table,
        columns,
        workplaceId,
        afterId,
        limit: PAGE_SIZE,
      });
      if (page.length === 0) break;
      for (const raw of page) {
        const prepared = preparePhysicalRow(table, raw, descriptors);
        if (prepared) data.push(prepared);
      }
      // Advance on the final raw id too, even if an SMS source row was filtered.
      if (page.length > 0) afterId = String(page[page.length - 1].id);
      if (page.length < PAGE_SIZE) break;
    }
  }

  const currencyPrecisions = Object.fromEntries(
    await Promise.all(
      collectCurrencyCodes(workplace.defaultCurrencyCode, data).map(
        async code => [code, await currencyReadService.getPrecision(code)] as const,
      ),
    ),
  );
  const prefs = preferences.workplace.getSnapshot(workplaceId);
  data.push(
    prepareWorkplaceMetadata(
      {
        id: workplace.id,
        updatedAt: workplace.updatedAt.getTime(),
        name: workplace.name,
        icon: workplace.icon,
        defaultCurrencyCode: workplace.defaultCurrencyCode,
      },
      prefs.safeToSpendDays,
      currencyPrecisions,
    ),
  );
  return validateWorkplaceRows(data, workplaceId);
}

export const rowSource: RowSource = {
  readWorkplaceRowsInWriter: readConsistentRows,
  readWorkplaceRows(workplaceId) {
    return exportRepository.captureConsistently(() => readConsistentRows(workplaceId));
  },
};
