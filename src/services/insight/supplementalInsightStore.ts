import type { WorkplaceId } from '@/src/types/ids';
import type { Insight } from './insightTypes';

export interface SupplementalInsightProvider {
  observe(workplaceId: WorkplaceId, dismissed: boolean): Insight[];
  dismiss(workplaceId: WorkplaceId, id: string): void;
  restore(workplaceId: WorkplaceId, id: string): void;
}

type Listener = () => void;

const providers = new Set<SupplementalInsightProvider>();
const listeners = new Set<Listener>();
const snapshots = new Map<string, Insight[]>();

export function registerSupplementalInsightProvider(
  provider: SupplementalInsightProvider,
): () => void {
  providers.add(provider);
  return () => providers.delete(provider);
}

export function observeSupplementalInsights(
  workplaceId: WorkplaceId,
  dismissed: boolean,
): Insight[] {
  const key = `${workplaceId}:${dismissed}`;
  const previous = snapshots.get(key);
  if (previous) return previous;

  const result = [...providers].flatMap(provider => provider.observe(workplaceId, dismissed));
  snapshots.set(key, result);
  return result;
}

export function dismissSupplementalInsight(workplaceId: WorkplaceId, id: string): void {
  providers.forEach(provider => provider.dismiss(workplaceId, id));
  notify();
}

export function restoreSupplementalInsight(workplaceId: WorkplaceId, id: string): void {
  providers.forEach(provider => provider.restore(workplaceId, id));
  notify();
}

export function subscribeToSupplementalInsights(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySupplementalInsights(): void {
  notify();
}

function notify(): void {
  snapshots.clear();
  listeners.forEach(listener => listener());
}
