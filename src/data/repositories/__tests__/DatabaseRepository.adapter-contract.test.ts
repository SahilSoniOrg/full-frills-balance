import { database } from '@/src/data/database/Database';
import { getRawAdapter, RawSqlArg } from '@/src/data/database/DatabaseUtils';
import type { WorkplaceId } from '@/src/types/ids';
import { DatabaseRepository } from '../DatabaseRepository';

type Row = {
  table: string;
  id: string;
  workplace_id: string;
};

type MockDatabase = {
  adapter: {
    underlyingAdapter: {
      _dispatcher: {
        _db: {
          unsafeQueryRaw: (sql: string, args: RawSqlArg[]) => Promise<unknown>;
        };
      };
    };
  };
  write: jest.Mock;
  collections: { get: jest.Mock };
};

type TestCollection = {
  _cache: {
    map: Map<string, { id: string; _raw: { workplace_id: string } }>;
    delete: jest.Mock;
  };
  _notify: jest.Mock;
};

/**
 * Contract-only test double. It exercises the native-shaped dispatcher wiring and the
 * RawSqlAdapter promise contract, but it is not SQLite, JSI, or device evidence.
 */
function createFaultInjectingAdapter(initialRows: Row[], failAfterPrefix: string) {
  let rows = initialRows.map(row => ({ ...row }));
  let savepointRows: Row[] | undefined;

  const unsafeQueryRaw = jest.fn(async (sql: string, args: RawSqlArg[]) => {
    if (sql === 'SAVEPOINT import_swap') {
      savepointRows = rows.map(row => ({ ...row }));
      return;
    }

    if (sql === 'ROLLBACK TO SAVEPOINT import_swap') {
      if (!savepointRows) throw new Error('savepoint was not opened');
      rows = savepointRows.map(row => ({ ...row }));
      return;
    }

    if (sql === 'RELEASE SAVEPOINT import_swap') {
      savepointRows = undefined;
      return;
    }

    const deleteMatch = /^DELETE FROM (\w+) WHERE workplace_id = \?$/.exec(sql);
    if (deleteMatch) {
      rows = rows.filter(row => row.table !== deleteMatch[1] || row.workplace_id !== args[0]);
    } else {
      const updateMatch = /^UPDATE (\w+) SET workplace_id = \? WHERE workplace_id = \?$/.exec(sql);
      if (!updateMatch) throw new Error(`unsupported SQL in contract test: ${sql}`);

      rows = rows.map(row =>
        row.table === updateMatch[1] && row.workplace_id === args[1]
          ? { ...row, workplace_id: String(args[0]) }
          : row,
      );
    }

    if (sql.startsWith(failAfterPrefix)) {
      throw new Error(`fault injected after ${failAfterPrefix}`);
    }
  });

  return {
    databaseAdapter: {
      underlyingAdapter: { _dispatcher: { _db: { unsafeQueryRaw } } },
    },
    unsafeQueryRaw,
    readRows: () => rows.map(row => ({ ...row })),
  };
}

jest.mock('@/src/data/database/Database', () => ({
  database: {
    adapter: {},
    write: jest.fn(),
    collections: { get: jest.fn() },
  },
}));

const mockDatabase = database as unknown as MockDatabase;

describe('DatabaseRepository raw adapter contract', () => {
  const repository = new DatabaseRepository();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabase.write.mockImplementation(async (work: () => Promise<unknown>) => work());
  });

  it.each(['DELETE FROM accounts', 'DELETE FROM journals', 'UPDATE accounts', 'UPDATE journals'])(
    'restores every row after a fault injected after %s',
    async failAfterPrefix => {
      const initialRows: Row[] = [
        { table: 'accounts', id: 'target-account', workplace_id: 'target' },
        { table: 'accounts', id: 'staging-account', workplace_id: 'staging' },
        { table: 'journals', id: 'target-journal', workplace_id: 'target' },
        { table: 'journals', id: 'staging-journal', workplace_id: 'staging' },
      ];
      const fakeAdapter = createFaultInjectingAdapter(initialRows, failAfterPrefix);
      mockDatabase.adapter = fakeAdapter.databaseAdapter;

      const collections = new Map<string, TestCollection>();
      for (const row of initialRows) {
        const record = { id: row.id, _raw: { workplace_id: row.workplace_id } };
        const collection = collections.get(row.table) ?? {
          _cache: { map: new Map(), delete: jest.fn() },
          _notify: jest.fn(),
        };
        collection._cache.map.set(record.id, record);
        collections.set(row.table, collection);
      }
      mockDatabase.collections.get.mockImplementation((table: string) => collections.get(table));

      await expect(
        repository.swapStagedWorkplaceInto('target' as WorkplaceId, 'staging' as WorkplaceId, [
          'accounts',
          'journals',
        ]),
      ).rejects.toThrow(`fault injected after ${failAfterPrefix}`);

      expect(getRawAdapter(database)).not.toBeNull();
      expect(fakeAdapter.readRows()).toEqual(initialRows);
      expect(fakeAdapter.unsafeQueryRaw).toHaveBeenCalledWith('SAVEPOINT import_swap', []);
      expect(fakeAdapter.unsafeQueryRaw).toHaveBeenCalledWith(
        'ROLLBACK TO SAVEPOINT import_swap',
        [],
      );
      expect(fakeAdapter.unsafeQueryRaw).toHaveBeenCalledWith('RELEASE SAVEPOINT import_swap', []);
      for (const collection of collections.values()) {
        expect(collection._cache.delete).not.toHaveBeenCalled();
        expect(collection._notify).not.toHaveBeenCalled();
      }
    },
  );
});
