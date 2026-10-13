import { database } from '@/src/data/database/Database';
import { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import Collection from '@nozbe/watermelondb/Collection';
import Model from '@nozbe/watermelondb/Model';
import { projectOrmRow } from './export/ExportOrmAdapter';
import { rawSqlExecutor } from './raw/RawSqlExecutor';
import { deviceSmsInboxRepository } from './DeviceSmsInboxRepository';
import { fetchSequentiallyInChunks } from './fetchSequentiallyInChunks';

interface ExportColumn {
  source: string;
  alias: string;
}

export class ExportRepository {
  /** Holds the database reader until all source rows have been copied; writers queue behind it. */
  captureConsistently<T>(capture: () => Promise<T>): Promise<T> {
    return database.read(capture, 'Capture Workplace backup');
  }

  /** Schema-derived, workplace-scoped raw table read used by the export workflow. */
  async fetchRawTable(input: {
    tableName: string;
    columns: readonly ExportColumn[];
    workplaceId: WorkplaceId;
    includeDeleted: boolean;
    includeSmsSources?: boolean;
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
    const rows = await rawSqlExecutor.query<Record<string, unknown>>(sql, args);
    return rows === null
      ? null
      : input.includeSmsSources === false
        ? rows
        : this.attachSmsSources(tableName, rows);
  }

  /** User-created backups carry sources for exported Workplace copies, not the Device pending feed. */
  private async attachSmsSources(
    tableName: string,
    rows: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (tableName !== 'transaction_inbox_records') return rows;
    const sourceIds = rows.flatMap(row =>
      row.channel === 'sms' && typeof row.deviceSourceId === 'string' ? [row.deviceSourceId] : [],
    );
    const sources = await fetchSequentiallyInChunks([...new Set(sourceIds)], ids =>
      deviceSmsInboxRepository.findBySourceIds([...ids]),
    );
    const bySource = new Map(sources.map(source => [source.deviceSourceId, source]));
    return rows.map(row => {
      const source =
        row.channel === 'sms' && typeof row.deviceSourceId === 'string'
          ? bySource.get(row.deviceSourceId)
          : undefined;
      return source
        ? {
            ...row,
            senderAddress: row.senderAddress ?? source.senderAddress,
            rawBody: row.rawBody ?? source.rawBody,
          }
        : row;
    });
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
    includeSmsSources = true,
  ): Promise<Record<string, unknown>[]> {
    const collection = this.getCollection(tableName);
    if (!collection?.query) return [];

    const clauses = columnNames.includes('workplace_id')
      ? [Q.where('workplace_id', workplaceId)]
      : [];
    const rows = await collection.query(...clauses).fetch();
    const projected = rows.map(row => projectOrmRow(row, columnNames));
    return includeSmsSources ? this.attachSmsSources(tableName, projected) : projected;
  }
}

export const exportRepository = new ExportRepository();
