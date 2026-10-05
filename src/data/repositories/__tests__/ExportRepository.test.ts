import { database } from '@/src/data/database/Database';
import { asWorkplaceId } from '@/src/types/ids';
import { ExportRepository } from '../ExportRepository';
import { deviceSmsInboxRepository } from '../DeviceSmsInboxRepository';

jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: { get: jest.fn() },
  },
}));

describe('ExportRepository.fetchOrmTable', () => {
  const repository = new ExportRepository();
  const mockGet = database.collections.get as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  it('attaches device SMS sources when exporting inbox copies', async () => {
    const rows = [
      { _raw: { id: 'copy-1', channel: 'sms', device_source_id: 'source-1' } },
      { _raw: { id: 'copy-2', channel: 'voice', device_source_id: 'source-2' } },
    ];
    mockGet.mockReturnValue({ query: jest.fn(() => ({ fetch: async () => rows })) });
    const lookup = jest.spyOn(deviceSmsInboxRepository, 'findBySourceIds').mockResolvedValue([
      {
        deviceSourceId: 'source-1',
        senderAddress: 'Bank',
        rawBody: 'Device body',
      } as never,
    ]);

    const exported = await repository.fetchOrmTable(
      'transaction_inbox_records',
      ['id', 'channel', 'device_source_id', 'senderAddress', 'rawBody'],
      asWorkplaceId('workplace-1'),
    );

    expect(exported).toEqual([
      {
        id: 'copy-1',
        channel: 'sms',
        deviceSourceId: 'source-1',
        senderAddress: 'Bank',
        rawBody: 'Device body',
      },
      {
        id: 'copy-2',
        channel: 'voice',
        deviceSourceId: 'source-2',
        senderAddress: undefined,
        rawBody: undefined,
      },
    ]);
    expect(lookup).toHaveBeenCalledWith(['source-1']);
  });

  it('scopes workplace-owned tables before projecting ORM rows', async () => {
    const rows = [{ _raw: { id: 'account-1', workplace_id: 'workplace-1' } }];
    const fetch = jest.fn().mockResolvedValue(rows);
    const query = jest.fn().mockReturnValue({ fetch });
    mockGet.mockReturnValue({ query });

    await expect(
      repository.fetchOrmTable('accounts', ['id', 'workplace_id'], asWorkplaceId('workplace-1')),
    ).resolves.toEqual([{ id: 'account-1', workplaceId: 'workplace-1' }]);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'where',
        left: 'workplace_id',
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not add a workplace predicate to global tables', async () => {
    const query = jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) });
    mockGet.mockReturnValue({ query });

    await repository.fetchOrmTable('currencies', ['id', 'code'], asWorkplaceId('workplace-1'));

    expect(query).toHaveBeenCalledWith();
  });
});
