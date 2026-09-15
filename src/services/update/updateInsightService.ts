import { preferences } from '@/src/services/preferences';
import type { Insight } from '@/src/services/insight/insightTypes';
import type { WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';
import type { VersionPolicy } from './types';

type Listener = () => void;
const DISMISSED_KEY = 'full_frills_balance_update_notice_dismissed_v1';

class UpdateInsightService {
  private readonly listeners = new Set<Listener>();
  private readonly snapshots = new Map<string, Insight[]>();
  private current: { policy: VersionPolicy; dismissed: boolean } | null = null;

  observe(workplaceId: WorkplaceId, dismissed: boolean): Insight[] {
    const key = `${workplaceId}:${dismissed}`;
    const current = this.current;
    const insight = current?.dismissed ? this.buildInsight(current.policy) : null;
    const dismissedIds = preferences.insights.dismissedPatternIds(workplaceId);
    const result = insight && dismissedIds.includes(insight.id) === dismissed ? [insight] : [];
    const previous = this.snapshots.get(key);
    if (!previous || previous.length !== result.length || previous[0]?.id !== result[0]?.id) {
      this.snapshots.set(key, result);
      return result;
    }
    return previous;
  }

  dismiss(workplaceId: WorkplaceId, id: string): void {
    preferences.insights.dismissPattern(workplaceId, id);
    this.notify();
  }

  restore(workplaceId: WorkplaceId, id: string): void {
    preferences.insights.undismissPattern(workplaceId, id);
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publishAvailableUpdate(policy: VersionPolicy): void {
    this.current = {
      policy,
      dismissed: storage.getString(DISMISSED_KEY) === this.policyKey(policy),
    };
    this.notify();
  }

  clearAvailableUpdate(): void {
    this.current = null;
    this.notify();
  }

  dismissAvailableUpdate(policy: VersionPolicy): void {
    storage.set(DISMISSED_KEY, this.policyKey(policy));
    this.current = { policy, dismissed: true };
    this.notify();
  }

  private buildInsight(policy: VersionPolicy): Insight {
    return {
      id: `app-update-${policy.latestBuild}`,
      type: 'app-update',
      severity: 'low',
      message: policy.availableMessage ?? 'A newer version is available.',
      description: 'A newer version of Full Frills Balance is ready to install.',
      suggestion: 'Update the app from your app store.',
      journalIds: [],
      storeUrl: policy.storeUrl,
    };
  }

  private policyKey(policy: VersionPolicy): string {
    return `${policy.latestBuild ?? ''}:${policy.storeUrl}`;
  }

  private notify(): void {
    this.snapshots.clear();
    this.listeners.forEach(listener => listener());
  }
}

export const updateInsightService = new UpdateInsightService();
