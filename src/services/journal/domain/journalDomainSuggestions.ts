import { journalEnrichmentQueries } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import type { JournalSuggestion, JournalSuggestionPage } from '@/src/types/journalSuggestions';
import type { TabType } from '@/src/types/domainJournal';
import { WorkplaceId } from '@/src/types/ids';

export type JournalSuggestionsHost = {
  suggestionsCache: Map<string, JournalSuggestion[]>;
  inFlightSuggestions: Map<string, Promise<JournalSuggestion[]>>;
  suggestionsGeneration: Map<WorkplaceId, number>;
};

export function createJournalSuggestionsState(): JournalSuggestionsHost {
  return {
    suggestionsCache: new Map(),
    inFlightSuggestions: new Map(),
    suggestionsGeneration: new Map(),
  };
}

function getSuggestionsGeneration(host: JournalSuggestionsHost, workplaceId: WorkplaceId): number {
  return host.suggestionsGeneration.get(workplaceId) ?? 0;
}

export function clearSuggestionsCache(
  host: JournalSuggestionsHost,
  workplaceId?: WorkplaceId,
): void {
  if (workplaceId) {
    host.suggestionsGeneration.set(workplaceId, getSuggestionsGeneration(host, workplaceId) + 1);
    for (const key of host.suggestionsCache.keys()) {
      if (key.startsWith(`${workplaceId}:`)) host.suggestionsCache.delete(key);
    }
    for (const key of host.inFlightSuggestions.keys()) {
      if (key.startsWith(`${workplaceId}:`)) host.inFlightSuggestions.delete(key);
    }
  } else {
    const workplaces = new Set([
      ...host.suggestionsGeneration.keys(),
      ...[...host.suggestionsCache.keys(), ...host.inFlightSuggestions.keys()].map(
        key => key.slice(0, key.indexOf(':')) as WorkplaceId,
      ),
    ]);
    workplaces.forEach(id => {
      host.suggestionsGeneration.set(id, getSuggestionsGeneration(host, id) + 1);
    });
    host.suggestionsCache.clear();
    host.inFlightSuggestions.clear();
  }
}

export async function getJournalSuggestions(
  host: JournalSuggestionsHost,
  params: {
    workplaceId: WorkplaceId;
    query: string;
    page: JournalSuggestionPage;
    transactionType?: TabType;
    limit?: number;
  },
): Promise<JournalSuggestion[]> {
  const { workplaceId, page, transactionType } = params;
  const query = params.query ?? '';
  const limit = params.limit ?? 20;
  if (!workplaceId) return [];
  const normalizedQuery = query.trim().toLowerCase();
  const boundedLimit = limit === 0 ? 0 : Math.max(1, Math.min(50, limit));
  const cacheKey = [
    workplaceId,
    page,
    transactionType ?? 'all',
    normalizedQuery,
    boundedLimit,
  ].join(':');
  if (host.suggestionsCache.has(cacheKey)) {
    return host.suggestionsCache.get(cacheKey)!;
  }
  if (host.inFlightSuggestions.has(cacheKey)) {
    return host.inFlightSuggestions.get(cacheKey)!;
  }

  const generation = getSuggestionsGeneration(host, workplaceId);
  let fetchPromise: Promise<JournalSuggestion[]>;
  fetchPromise = journalEnrichmentQueries
    .findJournalSuggestions({
      workplaceId,
      query: normalizedQuery,
      page,
      transactionType,
      limit: boundedLimit,
    })
    .then(suggestions => {
      if (getSuggestionsGeneration(host, workplaceId) === generation) {
        host.suggestionsCache.set(cacheKey, suggestions);
      }
      return suggestions;
    })
    .finally(() => {
      if (
        getSuggestionsGeneration(host, workplaceId) === generation &&
        host.inFlightSuggestions.get(cacheKey) === fetchPromise
      ) {
        host.inFlightSuggestions.delete(cacheKey);
      }
    });

  host.inFlightSuggestions.set(cacheKey, fetchPromise);
  return fetchPromise;
}
