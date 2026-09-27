import { analytics } from '@/src/services/analytics';
import { journalBalanceInsightService } from '@/src/services/integrity';
import type { WorkplaceId } from '@/src/types/ids';
import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';

/**
 * Audits journal balances after startup. The Hub notification stays until the journals are fixed;
 * the popup only appears the first time a given set of journals is found.
 */
export async function checkJournalBalancesOnStartup(
  workplaceId: WorkplaceId,
  signal: AbortSignal,
): Promise<void> {
  const { unbalanced, journalsChecked } = await journalBalanceInsightService.refresh(
    workplaceId,
    'startup',
  );
  analytics.logJournalBalanceChecked(unbalanced.length, journalsChecked);
  if (signal.aborted) return;

  const insight = journalBalanceInsightService.claimPrompt(workplaceId);
  if (!insight) return;

  const count = insight.journalIds.length;
  confirm.show({
    title: "Some Entries Don't Balance",
    message: `${count} posted ${count === 1 ? 'entry has' : 'entries have'} debits and credits that don't match, so some account balances may be off. Fix them now, or later from Notifications on your dashboard.`,
    confirmText: 'Fix Now',
    cancelText: 'Later',
    onConfirm: () => {
      analytics.logUnbalancedJournalsPromptAnswered('fix_now');
      analytics.logEntrypointSelected('app_start', 'startup_prompt', 'journal_balance_review');
      AppNavigation.toJournalBalanceReview();
    },
    onCancel: () => analytics.logUnbalancedJournalsPromptAnswered('later'),
    onClose: () => analytics.logUnbalancedJournalsPromptAnswered('dismissed'),
  });
}
