import { database } from '@/src/data/database/Database';
import { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import Collection from '@nozbe/watermelondb/Collection';
import Model from '@nozbe/watermelondb/Model';
import { projectOrmRow } from './export/ExportOrmAdapter';
import { rawSqlExecutor } from './raw/RawSqlExecutor';

export interface ExportColumn {
  source: string;
  alias: string;
}

export class ExportRepository {
  /** Schema-derived, workplace-scoped raw table read used by the export workflow. */
  async fetchRawTable(input: {
    tableName: string;
    columns: readonly ExportColumn[];
    workplaceId: WorkplaceId;
    includeDeleted: boolean;
  }): Promise<Record<string, unknown>[] | null> {
    const { tableName, columns, workplaceId, includeDeleted } = input;
    const isIdentifier = (value: string) => /^[a-z][a-z0-9_]*$/i.test(value);
    if (
      !isIdentifier(tableName) ||
      columns.some(column => !isIdentifier(column.source) || !isIdentifier(column.alias))
    ) {
      throw new Error('Export query contains an invalid table or column identifier');
    }

    const select = columns.map(column => `"${column.source}" AS "${column.alias}"`).join(', ');
    const where: string[] = [];
    const args: (string | number | boolean | null)[] = [];
    if (columns.some(column => column.source === 'workplace_id')) {
      where.push('"workplace_id" = ?');
      args.push(workplaceId);
    }
    if (!includeDeleted && columns.some(column => column.source === 'deleted_at')) {
      where.push('"deleted_at" IS NULL');
    }
    const sql = `SELECT ${select} FROM "${tableName}"${
      where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
    }`;
    return rawSqlExecutor.query<Record<string, unknown>>(sql, args);
  }

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

  async countTable(tableName: string): Promise<number> {
    return this.getCollection(tableName)?.query().fetchCount() ?? 0;
  }
}

export const exportRepository = new ExportRepository();
