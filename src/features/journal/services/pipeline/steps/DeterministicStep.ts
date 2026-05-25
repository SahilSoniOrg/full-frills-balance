import { analytics } from '@/src/services/analytics-service';
import { accountResolutionService } from '@/src/services/ledger/AccountResolutionService';
import { transactionExtractorRegistry } from '@/src/services/ledger/TransactionExtractor';
import { TransactionSemanticTag } from '../../../types/ai-parsing';
import { PipelineContext, PipelineStep } from '../types';

export class DeterministicStep implements PipelineStep {
  async execute(context: PipelineContext): Promise<void> {
    const defaultCurrency = context.defaultCurrency!;

    const rawInput = {
      channel: 'voice' as const,
      id: `voice-${Date.now()}`,
      rawText: context.transcript,
      date: Date.now(),
      metadata: { defaultCurrencyCode: defaultCurrency },
    };

    const extractor = transactionExtractorRegistry.getExtractorFor(rawInput);
    const parsed = await extractor.extract(rawInput);

    if (parsed.isReversal) {
      analytics.logAiIngestion('reversal_detected');
    }

    context.parsed = parsed;

    // Amount Check Guardrail
    if (!parsed.amount && !context.forceAi) {
      analytics.logAiIngestion('amount_missing');
      context.result = {
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
        processTimeMs: Date.now() - context.startTime,
      };
      context.isHalted = true;
      return;
    }

    // Primary Entity Resolver
    const resolved = await accountResolutionService.resolve({
      sourceHint: parsed.sourceAccountHint,
      destinationHint: parsed.destinationCategoryHint,
      direction: parsed.direction,
      workplaceId: context.workplaceId,
      isReversal: parsed.isReversal,
      rawText: context.transcript,
    });

    context.resolved = resolved;

    // Confidence Evaluator - Pass 1
    if (resolved.confidence >= 0.9 && !context.forceAi) {
      const latency = Date.now() - context.startTime;
      analytics.logAiIngestion('deterministic_success', { latency_ms: latency });
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
        isHighConfidence: true,
        provider: 'deterministic',
        processTimeMs: latency,
      };
      context.isHalted = true;
      return;
    }
  }
}
