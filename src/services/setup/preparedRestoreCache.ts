import type { PreparedRestore } from '@/src/services/import/restore';
import type { WorkplaceId } from '@/src/types/ids';
import type { RestoreSourceOutput } from './setupTypes';

const preparedByFingerprint = new Map<string, PreparedRestore>();
const preparedByOperationId = new Map<string, PreparedRestore>();
const preparedByWorkplaceIndex = new Map<string, PreparedRestore>();

function indexedSourceKey(fingerprint: string, workplaceIndex: number): string {
  return `${fingerprint}:${workplaceIndex}`;
}

export function rememberPreparedRestore(
  prepared: PreparedRestore,
  operationId?: WorkplaceId,
  workplaceIndex?: number,
): void {
  if (operationId) preparedByOperationId.set(operationId, prepared);
  else if (workplaceIndex !== undefined) {
    preparedByWorkplaceIndex.set(indexedSourceKey(prepared.fingerprint, workplaceIndex), prepared);
  } else preparedByFingerprint.set(prepared.fingerprint, prepared);
}

export function forgetAllPreparedRestores(): void {
  preparedByFingerprint.clear();
  preparedByOperationId.clear();
  preparedByWorkplaceIndex.clear();
}

export function keepPreparedRestores(sources: readonly RestoreSourceOutput[]): void {
  const fingerprints = new Set(
    sources.filter(source => !source.operationId).map(source => source.source.fingerprint),
  );
  const operationIds = new Set<string>(
    sources.flatMap(source => (source.operationId ? [source.operationId] : [])),
  );
  const indexedSources = new Set(
    sources.flatMap(source =>
      !source.operationId && source.source.workplaceIndex !== undefined
        ? [indexedSourceKey(source.source.fingerprint, source.source.workplaceIndex)]
        : [],
    ),
  );
  for (const fingerprint of preparedByFingerprint.keys()) {
    if (!fingerprints.has(fingerprint)) preparedByFingerprint.delete(fingerprint);
  }
  for (const operationId of preparedByOperationId.keys()) {
    if (!operationIds.has(operationId)) preparedByOperationId.delete(operationId);
  }
  for (const key of preparedByWorkplaceIndex.keys()) {
    if (!indexedSources.has(key)) preparedByWorkplaceIndex.delete(key);
  }
}

export function cachedPreparedRestore(source: RestoreSourceOutput): PreparedRestore | undefined {
  return source.operationId
    ? preparedByOperationId.get(source.operationId)
    : source.source.workplaceIndex === undefined
      ? preparedByFingerprint.get(source.source.fingerprint)
      : preparedByWorkplaceIndex.get(
          indexedSourceKey(source.source.fingerprint, source.source.workplaceIndex),
        );
}
