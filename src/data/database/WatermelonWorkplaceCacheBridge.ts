import Collection from '@nozbe/watermelondb/Collection';
import Model from '@nozbe/watermelondb/Model';
import { WorkplaceId } from '@/src/types/ids';

type WorkplaceScopedRaw = { workplace_id?: string };

type CollectionCacheInternals = Collection<Model> & {
  _cache?: {
    map: Map<string, Model>;
    delete: (record: Model) => void;
  };
  _notify?: (operations: { record: Model; type: 'updated' | 'destroyed' }[]) => void;
};

/**
 * Compatibility seam for raw workplace mutations. WatermelonDB does not expose
 * cache invalidation for SQL writes, so private internals stay quarantined here.
 * Remove this bridge if the adapter gains a supported invalidation API.
 */
export function syncWatermelonWorkplaceCache(
  collections: Collection<Model>[],
  options: {
    reassignFrom?: WorkplaceId;
    reassignTo?: WorkplaceId;
    deletedWorkplaceId?: WorkplaceId;
    deletedRecordId?: string;
  },
): void {
  const { reassignFrom, reassignTo, deletedWorkplaceId } = options;

  for (const collection of collections) {
    const cachedCollection = collection as CollectionCacheInternals;
    const cache = cachedCollection._cache;
    if (!cache?.map) continue;

    const operations: { record: Model; type: 'updated' | 'destroyed' }[] = [];
    for (const record of [...cache.map.values()]) {
      const workplaceId = (record._raw as unknown as WorkplaceScopedRaw).workplace_id;
      if (
        (deletedWorkplaceId && workplaceId === deletedWorkplaceId) ||
        (options.deletedRecordId && record.id === options.deletedRecordId)
      ) {
        cache.delete(record);
        operations.push({ record, type: 'destroyed' });
      } else if (reassignFrom && reassignTo && workplaceId === reassignFrom) {
        (record._raw as unknown as WorkplaceScopedRaw).workplace_id = reassignTo;
        operations.push({ record, type: 'updated' });
      }
    }
    if (operations.length > 0) cachedCollection._notify?.(operations);
  }
}
