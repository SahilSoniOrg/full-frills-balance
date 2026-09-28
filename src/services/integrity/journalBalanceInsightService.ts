import { analytics } from '@/src/services/analytics';
import type { Insight } from '@/src/services/insight/insightTypes';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';
import {
  findUnbalancedJournals,
  findUnbalancedJournalsByIds,
  type JournalBalanceAuditResult,
} from './journalBalanceAudit';

type Listener = () => void;
export type JournalBalanceCheckSource =
  'startup' | 'hub' | 'maintenance' | 'review' | 'review_edit' | 'review_fx_suggestions';
interface OpenIssue {
  peakCount: number;
  firstDetectedAt: number;
}

const PROMPTED_KEY_PREFIX = 'journal_balance_prompted_v1_';
const OPEN_ISSUE_KEY_PREFIX = 'journal_balance_open_issue_v1_';
const COMPLETED_AUDIT_KEY_PREFIX = 'journal_balance_completed_audit_v1_';
// Increment when journalBalanceEvaluator changes what qualifies as a balanced posted journal.
const BALANCE_RULE_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_INSIGHTS: readonly Insight[] = [];

interface CompletedAudit {
  balanceRuleVersion: number;
  unbalancedJournalIds: JournalId[];
}

function isJournalId(value: unknown): value is JournalId {
  return typeof value === 'string' && value.length > 0;
}

function readOpenIssue(key: string): OpenIssue | null {
  const raw = storage.getString(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OpenIssue>;
    return typeof parsed.peakCount === 'number' && typeof parsed.firstDetectedAt === 'number'
      ? { peakCount: parsed.peakCount, firstDetectedAt: parsed.firstDetectedAt }
      : null;
  } catch {
    return null;
  }
}

function readCompletedAudit(key: string): CompletedAudit | null {
  const raw = storage.getString(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      balanceRuleVersion?: unknown;
      unbalancedJournalIds?: unknown;
    };
    if (
      parsed.balanceRuleVersion !== BALANCE_RULE_VERSION ||
      !Array.isArray(parsed.unbalancedJournalIds) ||
      !parsed.unbalancedJournalIds.every(isJournalId)
    ) {
      return null;
    }
    return {
      balanceRuleVersion: BALANCE_RULE_VERSION,
      unbalancedJournalIds: [...new Set(parsed.unbalancedJournalIds)],
    };
  } catch {
    return null;
  }
}

/** Short stable id for a set of journals, so the startup prompt resets when the set changes. */
function fingerprint(journalIds: readonly string[]): string {
  const text = [...journalIds].sort().join(',');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function buildInsight(journalIds: string[]): Insight {
  const count = journalIds.length;
  return {
    id: `unbalanced-journals-${fingerprint(journalIds)}`,
    type: 'unbalanced-journals',
    severity: 'high',
    message: count === 1 ? "1 entry doesn't balance" : `${count} entries don't balance`,
    description:
      "Debits and credits don't match, often because an exchange rate is missing, so some account balances may be off.",
    suggestion: 'Open each entry and correct its amounts or exchange rates.',
    journalIds,
  };
}

/** Latest unbalanced-journal audit per workplace, surfaced as a Hub notification. */
class JournalBalanceInsightService {
  private readonly listeners = new Set<Listener>();
  private readonly insights = new Map<WorkplaceId, readonly [Insight]>();
  private readonly inFlightRefreshes = new Map<WorkplaceId, Promise<JournalBalanceAuditResult>>();

  async refresh(
    workplaceId: WorkplaceId,
    source: JournalBalanceCheckSource,
  ): Promise<JournalBalanceAuditResult> {
    const inFlight = this.inFlightRefreshes.get(workplaceId);
    if (inFlight) return inFlight;

    const refresh = this.refreshWorkplace(workplaceId, source);
    this.inFlightRefreshes.set(workplaceId, refresh);
    try {
      return await refresh;
    } finally {
      if (this.inFlightRefreshes.get(workplaceId) === refresh) {
        this.inFlightRefreshes.delete(workplaceId);
      }
    }
  }

  private async refreshWorkplace(
    workplaceId: WorkplaceId,
    source: JournalBalanceCheckSource,
  ): Promise<JournalBalanceAuditResult> {
    const auditKey = `${COMPLETED_AUDIT_KEY_PREFIX}${workplaceId}`;
    const completedAudit = readCompletedAudit(auditKey);
    const result = completedAudit
      ? await findUnbalancedJournalsByIds(workplaceId, completedAudit.unbalancedJournalIds)
      : await findUnbalancedJournals(workplaceId);
    const journalIds = result.unbalanced.map(entry => entry.journal.journalId);
    storage.set(
      auditKey,
      JSON.stringify({
        balanceRuleVersion: BALANCE_RULE_VERSION,
        unbalancedJournalIds: journalIds,
      } satisfies CompletedAudit),
    );
    this.trackOpenIssue(workplaceId, journalIds.length, source);
    const insight = journalIds.length > 0 ? buildInsight(journalIds) : undefined;
    if (insight?.id !== this.insights.get(workplaceId)?.[0].id) {
      if (insight) this.insights.set(workplaceId, [insight]);
      else this.insights.delete(workplaceId);
      this.listeners.forEach(listener => listener());
    }
    return result;
  }

  hasIssues(workplaceId: WorkplaceId): boolean {
    return this.insights.has(workplaceId);
  }

  /**
   * Returns the current notification the first time it is seen, so the startup popup shows once
   * per set of unbalanced journals rather than on every launch.
   */
  claimPrompt(workplaceId: WorkplaceId): Insight | null {
    const insight = this.insights.get(workplaceId)?.[0];
    if (!insight) return null;
    const key = `${PROMPTED_KEY_PREFIX}${workplaceId}`;
    if (storage.getString(key) === insight.id) return null;
    storage.set(key, insight.id);
    return insight;
  }

  /** Stable per refresh result, as `useSyncExternalStore` requires. */
  observe(workplaceId: WorkplaceId): readonly Insight[] {
    return this.insights.get(workplaceId) ?? NO_INSIGHTS;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Persisted so a fix made outside the app session is still reported on the next check. */
  private trackOpenIssue(
    workplaceId: WorkplaceId,
    unbalancedCount: number,
    source: JournalBalanceCheckSource,
  ): void {
    const key = `${OPEN_ISSUE_KEY_PREFIX}${workplaceId}`;
    const open = readOpenIssue(key);
    if (unbalancedCount > 0) {
      if (open && open.peakCount >= unbalancedCount) return;
      const next: OpenIssue = {
        peakCount: unbalancedCount,
        firstDetectedAt: open?.firstDetectedAt ?? Date.now(),
      };
      storage.set(key, JSON.stringify(next));
      return;
    }
    if (!open) return;
    storage.remove(key);
    const daysOpen = Math.max(0, Math.floor((Date.now() - open.firstDetectedAt) / DAY_MS));
    analytics.logUnbalancedJournalsCleared(open.peakCount, daysOpen, source);
  }
}

export const journalBalanceInsightService = new JournalBalanceInsightService();
