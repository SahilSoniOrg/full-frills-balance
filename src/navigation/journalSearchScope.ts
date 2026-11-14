import type { JournalId } from '@/src/types/ids';

const MAX_STORED_SCOPES = 20;
const scopes = new Map<string, readonly JournalId[]>();
let nextScopeId = 0;

/**
 * Keeps large journal-ID scopes out of route URLs while navigation stays in-process.
 * The Journal Search screen consumes the scope immediately after navigation.
 */
export function saveJournalSearchScope(journalIds: readonly string[]): string {
  const scopeId = `journal-scope-${++nextScopeId}`;
  scopes.set(
    scopeId,
    journalIds.map(id => id as JournalId),
  );

  while (scopes.size > MAX_STORED_SCOPES) {
    const oldestScopeId = scopes.keys().next().value;
    if (!oldestScopeId) break;
    scopes.delete(oldestScopeId);
  }

  return scopeId;
}

export function readJournalSearchScope(scopeId?: string): readonly JournalId[] {
  return scopeId ? (scopes.get(scopeId) ?? []) : [];
}
