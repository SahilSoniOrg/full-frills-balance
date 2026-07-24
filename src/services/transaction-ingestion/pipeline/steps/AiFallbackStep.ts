import { AccountType } from '@/src/data/models/Account';
import { analytics } from '@/src/services/analytics-service';
import { accountResolutionService } from '@/src/services/ledger/AccountResolutionService';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { AIContext, TransactionSemanticTag } from '../../types/ai-parsing';
import { PipelineContext, PipelineStep } from '../types';

export class AiFallbackStep implements PipelineStep {
  async execute(context: PipelineContext): Promise<void> {
    analytics.logAiIngestion(context.forceAi ? 'ai_forced' : 'ai_fallback_triggered');

    const allAccounts = context.allAccounts || [];
    const assetAccountNames = allAccounts
      .filter(a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY)
      .map(a => a.name);
    const categoryAccountNames = allAccounts
      .filter(a => a.accountType === AccountType.INCOME || a.accountType === AccountType.EXPENSE)
      .map(a => a.name);

    const parsed = context.parsed!;
    const defaultCurrency = context.defaultCurrency!;
    const resolved = context.resolved!;

    const aiContext: AIContext = {
      accounts: assetAccountNames,
      categories: categoryAccountNames,
      parserHints: {
        amount: parsed.amount,
        rawAccount: parsed.sourceAccountHint,
        rawItem: parsed.destinationCategoryHint,
        direction: parsed.direction,
      },
    };

    try {
      let timeoutOccurred = false;
      const aiParsed = await Promise.race([
        context.aiProvider.parse(context.transcript, aiContext, {
          mode: preferences.ai.aiInferenceMode,
        }),
        new Promise<null>(resolve =>
          setTimeout(() => {
            timeoutOccurred = true;
            resolve(null);
          }, 20000),
        ),
      ]);

      const latency = Date.now() - context.startTime;
      if (timeoutOccurred) {
        analytics.logAiIngestion('ai_timeout', { latency_ms: latency });
      } else if (aiParsed) {
        analytics.logAiIngestion('ai_success', { latency_ms: latency });

        // SECOND PASS RESOLUTION
        const resolvedTransactions = await Promise.all(
          aiParsed.transactions.map(async tx => {
            const aiResolved = await accountResolutionService.resolve({
              sourceHint: tx.accountNameHint,
              destinationHint: tx.categoryNameHint,
              direction: tx.type === 'income' ? 'credit' : 'debit',
              workplaceId: context.workplaceId,
              isReversal: tx.isReversal,
              unconstrained: true,
            });

            return {
              ...tx,
              accountId: aiResolved.sourceAccountId,
              categoryId: aiResolved.categoryAccountId,
              accountNameHint: aiResolved.sourceAccountName || tx.accountNameHint,
              categoryNameHint: aiResolved.categoryAccountName || tx.categoryNameHint,
            };
          }),
        );

        context.result = {
          ...aiParsed,
          transactions: resolvedTransactions,
          provider: 'ai',
          processTimeMs: Date.now() - context.startTime,
        };
        context.isHalted = true;
        return;
      } else {
        analytics.logAiIngestion('ai_failure', { latency_ms: latency });
      }
    } catch (error) {
      analytics.logAiIngestion('ai_failure', {
        latency_ms: Date.now() - context.startTime,
        error: String(error),
      });
      logger.error('[IngestionService] AI Fallback failed', error);
    }

    // Still Low Confidence - Return deterministic output for Confirmation UI
    context.result = {
      transactions: [
        {
          type: parsed.direction === 'credit' ? 'income' : 'expense',
          amount: parsed.amount,
          currencyCode: parsed.currencyCode || defaultCurrency,
          accountId: resolved.sourceAccountId,
          categoryId: resolved.categoryAccountId,
          accountNameHint: resolved.sourceAccountName,
          categoryNameHint: resolved.categoryAccountName,
          isReversal: parsed.isReversal,
          semanticTag: resolved.semanticType as TransactionSemanticTag,
        },
      ],
      confidenceScore: resolved.confidence,
      isHighConfidence: false,
      provider: 'deterministic',
      processTimeMs: Date.now() - context.startTime,
    };
  }
}
