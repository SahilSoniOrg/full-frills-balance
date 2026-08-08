import {
  prepareArchiveMutation,
  serializeArchiveAuditChanges,
} from '@/src/services/accounts/accountArchiveCommands';
import {
  normalizeAccountAuditState,
  parsePersistedAuditDate,
  toPersistedIsoDate,
} from '@/src/services/accounts/accountAuditState';
import { collectArchiveAuditEntries } from '@/src/services/accounts/accountArchiveMutations';

describe('accountArchiveCommands', () => {
  it('serializes archive dates as explicit ISO strings', () => {
    const archivedAt = new Date('2026-01-01T00:00:00.000Z');
    const [entry] = collectArchiveAuditEntries(
      [{ id: 'acct-1', archivedAt: undefined }],
      [],
      archivedAt,
    );

    const payload = serializeArchiveAuditChanges(entry);
    expect(payload.before).toEqual({ archivedAt: null });
    expect(payload.after.archivedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(typeof payload.after.archivedAt).toBe('string');
  });

  it('round-trips persisted audit JSON through normalizeAccountAuditState', () => {
    const before = new Date('2025-12-01T00:00:00.000Z');
    const [entry] = collectArchiveAuditEntries(
      [],
      [{ id: 'acct-1', archivedAt: before }],
      new Date('2026-01-01T00:00:00.000Z'),
    );

    const persisted = JSON.parse(JSON.stringify(serializeArchiveAuditChanges(entry)));
    const normalized = normalizeAccountAuditState(persisted.before);

    expect(normalized.archivedAt).toEqual(before);
    expect(persisted.after).toEqual({ archivedAt: null, action: 'UNARCHIVED' });
  });

  it('parses null archivedAt as explicitly unarchived', () => {
    expect(parsePersistedAuditDate(null)).toBeNull();
    expect(normalizeAccountAuditState({ archivedAt: null }).archivedAt).toBeNull();
  });

  it('converts undefined archive timestamps to null in persisted audit', () => {
    expect(toPersistedIsoDate(undefined)).toBeNull();
  });

  it('rejects invalid archivedAt during audit normalization', () => {
    expect(() => normalizeAccountAuditState({ archivedAt: 'not-a-date' })).toThrow(
      /Invalid archivedAt in audit snapshot/,
    );
  });
});

describe('prepareArchiveMutation', () => {
  it('returns null when both change lists are empty', async () => {
    const result = await prepareArchiveMutation(
      'wp-1' as import('@/src/types/domain').WorkplaceId,
      {
        toArchive: [],
        toUnarchive: [],
      },
    );
    expect(result).toBeNull();
  });
});
