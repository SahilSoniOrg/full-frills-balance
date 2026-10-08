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
  private current: { policy: VersionPolicy; dismissed: boolean; ready: boolean } | null = null;

  observe(workplaceId: WorkplaceId, dismissed: boolean): Insight[] {
    const key = `${workplaceId}:${dismissed}`;
    const current = this.current;
    const insight = current?.dismissed ? this.buildInsight(current.policy, current.ready) : null;
    const dismissedIds = preferences.insights.dismissedPatternIds(workplaceId);
    const result = insight && dismissedIds.includes(insight.id) === dismissed ? [insight] : [];
    const previous = this.snapshots.get(key);
    if (
      !previous ||
      previous.length !== result.length ||
      previous[0]?.id !== result[0]?.id ||
      previous[0]?.updateReady !== result[0]?.updateReady ||
      previous[0]?.message !== result[0]?.message
    ) {
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

  isNoticeDismissed(policy: VersionPolicy, ready = false): boolean {
    return storage.getString(DISMISSED_KEY) === this.policyKey(policy, ready);
  }

  publishAvailableUpdate(policy: VersionPolicy, ready = false): void {
    this.current = {
      policy,
      dismissed: this.isNoticeDismissed(policy, ready),
      ready,
    };
    this.notify();
  }

  clearAvailableUpdate(): void {
    this.current = null;
    this.notify();
  }

  dismissAvailableUpdate(policy: VersionPolicy, ready = false): void {
    storage.set(DISMISSED_KEY, this.policyKey(policy, ready));
    this.current = { policy, dismissed: true, ready };
    this.notify();
  }

  private buildInsight(policy: VersionPolicy, ready: boolean): Insight {
    return {
      id: `app-update-${policy.latestBuild}`,
      type: 'app-update',
      severity: 'low',
      message: ready
        ? 'Update downloaded. Restart when you’re ready.'
        : (policy.availableMessage ?? 'A newer version is available.'),
      description: ready
        ? 'The update has finished downloading.'
        : 'A newer version of Full Frills Balance is available.',
      suggestion: ready ? 'Restart to update.' : 'Update the app.',
      updateReady: ready,
      journalIds: [],
      storeUrl: policy.storeUrl,
    };
  }

  private policyKey(policy: VersionPolicy, ready = false): string {
    return `${policy.latestBuild ?? ''}:${policy.storeUrl}${ready ? ':ready' : ''}`;
  }

  private notify(): void {
    this.snapshots.clear();
    this.listeners.forEach(listener => listener());
  }
}

export const updateInsightService = new UpdateInsightService();
