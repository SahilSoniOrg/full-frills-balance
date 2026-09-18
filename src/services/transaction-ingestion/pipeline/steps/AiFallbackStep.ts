import { AccountType } from '@/src/types/enums';

import { analytics } from '@/src/services/analytics';
import { logger } from '@/src/utils/logger';
import { AIContext, TransactionSemanticTag } from '../../types/ai-parsing';
import { PipelineContext, PipelineStep } from '../types';

export class AiFallbackStep implements PipelineStep {
  async execute(context: PipelineContext): Promise<void> {
    analytics.logAiIngestion(context.forceAi ? 'ai_forced' : 'ai_fallback_triggered');

    const allAccounts = context.allAccounts || [];
    const parsed = context.parsed!;
    const defaultCurrency = context.defaultCurrency!;
    const resolved = context.resolved!;

    const assetAccounts = allAccounts
      .filter(a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY)
      .map(a => ({ id: a.id, name: a.name }));
    const categoryAccounts = allAccounts
      .filter(a => a.accountType === AccountType.INCOME || a.accountType === AccountType.EXPENSE)
      .map(a => ({ id: a.id, name: a.name }));

    const aiContext: AIContext = {
      accounts: assetAccounts,
      categories: categoryAccounts,
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
        context.aiProvider.parse(context.transcript, aiContext),
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

        const validSourceIds = new Set<string>(assetAccounts.map(account => account.id));
        const validCategoryIds = new Set<string>(categoryAccounts.map(account => account.id));
        const categoryTypeById = new Map<string, AccountType>(
          allAccounts
            .filter(
              a => a.accountType === AccountType.INCOME || a.accountType === AccountType.EXPENSE,
            )
            .map(account => [account.id, account.accountType]),
        );
        const resolvedTransactions = aiParsed.transactions.filter(tx => {
          if (
            !tx.accountId ||
            !tx.categoryId ||
            !validSourceIds.has(tx.accountId) ||
            !validCategoryIds.has(tx.categoryId)
          ) {
            return false;
          }

          const categoryType = categoryTypeById.get(tx.categoryId);
          return (
            tx.type === 'transfer' ||
            (tx.type === 'income' && categoryType === AccountType.INCOME) ||
            (tx.type === 'expense' && categoryType === AccountType.EXPENSE)
          );
        });

        if (resolvedTransactions.length !== aiParsed.transactions.length) {
          analytics.logAiIngestion('ai_failure', {
            latency_ms: latency,
            error: 'TypeSafe returned an account outside the supplied candidate set',
          });
        } else {
          context.result = {
            ...aiParsed,
            transactions: resolvedTransactions,
            provider: aiParsed.provider,
            processTimeMs: Date.now() - context.startTime,
          };
          context.isHalted = true;
          return;
        }
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
