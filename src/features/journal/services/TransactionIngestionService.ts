import { database } from '@/src/data/database/Database';
import Account, { AccountType } from '@/src/data/models/Account';
import { AppConfig } from '@/src/constants/app-config';
import { workplaceService } from '@/src/services/WorkplaceService';
import { analytics } from '@/src/services/analytics-service';
import { accountResolutionService } from '@/src/services/ledger/AccountResolutionService';
import { transactionExtractorRegistry } from '@/src/services/ledger/TransactionExtractor';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Q } from '@nozbe/watermelondb';
import {
  AIContext,
  ParserOutput,
  TransactionFallbackAIProvider,
  TransactionSemanticTag,
} from '../types/ai-parsing';
import { nativeAIProvider } from './NativeAIProvider';
import { mockAIProvider } from './TransactionFallbackAIProvider';

export class TransactionIngestionService {
  private customAiProvider: TransactionFallbackAIProvider | null = null;

  setAiProvider(provider: TransactionFallbackAIProvider) {
    this.customAiProvider = provider;
  }

  private getEffectiveAiProvider(): TransactionFallbackAIProvider {
    if (this.customAiProvider) return this.customAiProvider;

    if (preferences.isNativeAiEnabled) {
      nativeAIProvider.setModel(
        preferences.preferredAiModelId || AppConfig.defaults.defaultAiModelId,
      );
      return nativeAIProvider;
    }

    return mockAIProvider;
  }

  async ingest(
    transcript: string,
    workplaceId: WorkplaceId,
    forceAi: boolean = false,
  ): Promise<ParserOutput> {
    const startTime = Date.now();
    const defaultCurrency = await workplaceService.getCurrency(workplaceId);
    const aiProvider = this.getEffectiveAiProvider();

    // 1. Fetch current workspace accounts for context
    const allAccounts = await database.collections
      .get<Account>('accounts')
      .query(Q.where('workplace_id', workplaceId), Q.where('deleted_at', Q.eq(null)))
      .fetch();

    // 2. Deterministic Parser (Deterministic Parser in plan)
    const rawInput = {
      channel: 'voice' as const,
      id: `voice-${Date.now()}`,
      rawText: transcript,
      date: Date.now(),
      metadata: { defaultCurrencyCode: defaultCurrency },
    };
    const extractor = transactionExtractorRegistry.getExtractorFor(rawInput);
    const parsed = await extractor.extract(rawInput);

    if (parsed.isReversal) {
      analytics.logAiIngestion('reversal_detected');
    }

    // 3. Amount Check (Guardrail in plan)
    if (!parsed.amount && !forceAi) {
      analytics.logAiIngestion('amount_missing');
      return {
        transactions: [
          {
            type: parsed.direction === 'credit' ? 'income' : 'expense',
            amount: undefined,
            currencyCode: parsed.currencyCode || defaultCurrency,
            accountNameHint: parsed.sourceAccountHint,
            categoryNameHint: parsed.destinationCategoryHint,
            isReversal: parsed.isReversal,
          },
        ],
        confidenceScore: 0.1,
        isHighConfidence: false,
        provider: 'deterministic',
        processTimeMs: Date.now() - startTime,
      };
    }

    // 4. Primary Entity Resolver (Primary Entity Resolver in plan)
    const resolved = await accountResolutionService.resolve({
      sourceHint: parsed.sourceAccountHint,
      destinationHint: parsed.destinationCategoryHint,
      direction: parsed.direction,
      workplaceId,
      isReversal: parsed.isReversal,
      rawText: transcript,
    });

    // 5. Confidence Evaluator - Pass 1
    // If confidence is very high, we can stop here - UNLESS forced
    if (resolved.confidence >= 0.9 && !forceAi) {
      const latency = Date.now() - startTime;
      analytics.logAiIngestion('deterministic_success', { latency_ms: latency });
      return {
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
        isHighConfidence: true,
        provider: 'deterministic',
        processTimeMs: Date.now() - startTime,
      };
    }

    // 6. Fallback AI (Fallback AI in plan)
    analytics.logAiIngestion(forceAi ? 'ai_forced' : 'ai_fallback_triggered');

    const assetAccountNames = allAccounts
      .filter(a => a.accountType === AccountType.ASSET || a.accountType === AccountType.LIABILITY)
      .map(a => a.name);
    const categoryAccountNames = allAccounts
      .filter(a => a.accountType === AccountType.INCOME || a.accountType === AccountType.EXPENSE)
      .map(a => a.name);

    const aiContext: AIContext = {
      accounts: assetAccountNames,
      categories: categoryAccountNames,
      parserHints: {
        amount: parsed.amount,
        rawAccount: parsed.sourceAccountHint,
        rawItem: parsed.destinationCategoryHint,
      },
    };

    try {
      let timeoutOccurred = false;
      const aiParsed = await Promise.race([
        aiProvider.parse(transcript, aiContext, { mode: preferences.aiInferenceMode }),
        new Promise<null>(resolve =>
          setTimeout(() => {
            timeoutOccurred = true;
            resolve(null);
          }, 20000),
        ), // Increased budget to 20000ms for multi-pass stability
      ]);

      const latency = Date.now() - startTime;
      if (timeoutOccurred) {
        analytics.logAiIngestion('ai_timeout', { latency_ms: latency });
      } else if (aiParsed) {
        analytics.logAiIngestion('ai_success', { latency_ms: latency });

        // SECOND PASS RESOLUTION: Resolve AI hints into actual IDs
        const resolvedTransactions = await Promise.all(
          aiParsed.transactions.map(async tx => {
            const aiResolved = await accountResolutionService.resolve({
              sourceHint: tx.accountNameHint,
              destinationHint: tx.categoryNameHint,
              direction: tx.type === 'income' ? 'credit' : 'debit',
              workplaceId,
              isReversal: tx.isReversal,
              unconstrained: true, // Allow AI hints to match ANY account type
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

        return {
          ...aiParsed,
          transactions: resolvedTransactions,
          provider: 'ai',
          processTimeMs: Date.now() - startTime,
        };
      } else {
        analytics.logAiIngestion('ai_failure', { latency_ms: latency });
      }
    } catch (error) {
      analytics.logAiIngestion('ai_failure', {
        latency_ms: Date.now() - startTime,
        error: String(error),
      });
      logger.error('[IngestionService] AI Fallback failed', error);
    }

    // 7. Still Low Confidence - Return deterministic output for Confirmation UI
    return {
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
      processTimeMs: Date.now() - startTime,
    };
  }
}

export const transactionIngestionService = new TransactionIngestionService();
