import { analytics } from '@/src/services/analytics';
import { resolveAccount } from '@/src/services/ledger/resolution';
import { logger } from '@/src/utils/logger';
import type { TransactionSemanticTag } from '../../types/ai-parsing';
import { parseMockTransaction } from '../../mockTransactionParser';
import type { IngestionContext } from '../types';

export class AiFallbackStep {
  async execute(context: IngestionContext): Promise<void> {
    analytics.logAiIngestion(context.forceAi ? 'ai_forced' : 'ai_fallback_triggered');

    const parsed = context.parsed!;
    const defaultCurrency = context.defaultCurrency;
    const resolved = context.resolved!;

    try {
      const aiParsed = await parseMockTransaction(context.transcript);

      const latency = Date.now() - context.startTime;
      if (aiParsed) {
        analytics.logAiIngestion('ai_success', { latency_ms: latency });

        // SECOND PASS RESOLUTION
        const resolvedTransactions = await Promise.all(
          aiParsed.transactions.map(async tx => {
            const aiResolved = await resolveAccount({
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
