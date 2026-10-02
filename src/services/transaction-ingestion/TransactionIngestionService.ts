import { analytics } from '@/src/services/analytics';
import { resolveAccount } from '@/src/services/ledger/resolution';
import { VoiceExtractor } from '@/src/services/ledger/VoiceExtractor';
import { workplaceService } from '@/src/services/WorkplaceService';
import type { WorkplaceId } from '@/src/types/ids';
import type { ParserOutput, TransactionSemanticTag } from './types/ai-parsing';

const voiceExtractor = new VoiceExtractor();

export async function ingestTransaction(
  transcript: string,
  workplaceId: WorkplaceId,
): Promise<ParserOutput> {
  const startTime = Date.now();
  const defaultCurrency = await workplaceService.getCurrency(workplaceId);
  const parsed = await voiceExtractor.extract({
    channel: 'voice',
    id: `voice-${Date.now()}`,
    rawText: transcript,
    date: Date.now(),
    metadata: { defaultCurrencyCode: defaultCurrency },
  });

  if (parsed.isReversal) analytics.logAiIngestion('reversal_detected');

  if (!parsed.amount) {
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

  const resolved = await resolveAccount({
    sourceHint: parsed.sourceAccountHint,
    destinationHint: parsed.destinationCategoryHint,
    direction: parsed.direction,
    workplaceId,
    isReversal: parsed.isReversal,
    rawText: transcript,
  });
  const processTimeMs = Date.now() - startTime;
  const isHighConfidence = resolved.confidence >= 0.9;
  if (isHighConfidence) {
    analytics.logAiIngestion('deterministic_success', { latency_ms: processTimeMs });
  }

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
    isHighConfidence,
    provider: 'deterministic',
    processTimeMs,
  };
}
