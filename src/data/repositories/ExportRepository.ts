import { database } from '@/src/data/database/Database';
import { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import Collection from '@nozbe/watermelondb/Collection';
import Model from '@nozbe/watermelondb/Model';
import { projectOrmRow } from './export/ExportOrmAdapter';

export class ExportRepository {
  private getCollection(tableName: string): Collection<Model> | undefined {
    try {
      return database.collections.get<Model>(tableName);
    } catch {
      return undefined;
    }
  }

  async fetchOrmTable(
    tableName: string,
    columnNames: readonly string[],
    workplaceId: WorkplaceId,
  ): Promise<Record<string, unknown>[]> {
    const collection = this.getCollection(tableName);
    if (!collection?.query) return [];

    const clauses = columnNames.includes('workplace_id')
      ? [Q.where('workplace_id', workplaceId)]
      : [];
    const rows = await collection.query(...clauses).fetch();
    return rows.map(row => projectOrmRow(row, columnNames));
  }
}

export const exportRepository = new ExportRepository();
