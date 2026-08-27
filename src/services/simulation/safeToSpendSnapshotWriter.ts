import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { snapshotService } from '@/src/utils/SnapshotService';

const STS_SNAPSHOT_KEY = 'safe_to_spend';

export interface SafeToSpendPaintSnapshot extends Omit<
  SafeToSpendDashboard,
  'report' | 'accountMap'
> {
  readonly snapshotKind: 'paint';
  readonly report: Omit<SafeToSpendDashboard['report'], 'allFlows'>;
}

/** Tag snapshots written before the paint discriminator was introduced. */
export function restoreSafeToSpendPaintSnapshot(
  snapshot: SafeToSpendPaintSnapshot | SafeToSpendDashboard,
): SafeToSpendPaintSnapshot {
  if ('snapshotKind' in snapshot) return snapshot;
  return { ...snapshot, snapshotKind: 'paint' };
}

/** Drop heavy sim payloads so the mint number can round-trip through MMKV. */
export function toSafeToSpendPaintSnapshot(
  dashboard: SafeToSpendDashboard,
): SafeToSpendPaintSnapshot {
  const {
    report: { allFlows: _allFlows, ...paintReport },
    accountMap: _accountMap,
    projection,
    ...paintBase
  } = dashboard;
  return {
    ...paintBase,
    snapshotKind: 'paint',
    report: paintReport,
    projection: {
      history: (projection?.history ?? []).map(({ timestamp, value, isProjected }) => ({
        timestamp,
        value,
        isProjected,
      })),
      projection: (projection?.projection ?? []).map(
        ({ timestamp, value, isProjected, dailyBurn }) => ({
          timestamp,
          value,
          isProjected,
          dailyBurn,
        }),
      ),
      safeDaysCount: projection?.safeDaysCount ?? null,
      safeToSpend: projection?.safeToSpend ?? dashboard.summary.safeToSpend,
    },
  };
}

/**
 * Persists a successful Safe-to-Spend projection for offline/widget use.
 * Failures are logged and swallowed so persistence never alters pipeline output.
 */
export function persistSafeToSpendSnapshot(
  workplaceId: WorkplaceId,
  dashboard: SafeToSpendDashboard,
): void {
  try {
    const paint = toSafeToSpendPaintSnapshot(dashboard);
    snapshotService.saveCustomSnapshot(workplaceId, STS_SNAPSHOT_KEY, paint);
    logger.info(
      `[SafeToSpend] paint snapshot saved for ${workplaceId} (sts=${paint.summary.safeToSpend})`,
    );
  } catch (error) {
    logger.warn('[SafeToSpendReadModel] Failed to save snapshot', { error });
  }
}
