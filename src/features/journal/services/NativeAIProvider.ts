import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import type { LLMEngine } from '@/src/services/ai/types';
import { logger } from '@/src/utils/logger';
import {
  AIContext,
  ParserOutput,
  TransactionFallbackAIProvider,
  TransactionType,
} from '../types/ai-parsing';
import {
  createCompactSinglePassPrompt,
  createEntityResolutionPrompt,
  createTypeClassificationPrompt,
} from '../utils/ai-prompts';

export class NativeAIProvider implements TransactionFallbackAIProvider {
  private currentRequestId: number = 0;
  private transactionCount = 0;

  constructor(private engine: LLMEngine) {}

  async unload(): Promise<void> {
    await this.engine.dispose();
  }

  async parse(
    transcript: string,
    context: AIContext,
    options?: { mode?: 'single' | 'multi' },
  ): Promise<ParserOutput | null> {
    const requestId = ++this.currentRequestId;
    this.transactionCount++;
    const shouldReset = true; // Always reset context for a new transaction

    logger.info(
      `[NativeAIProvider] Parse called. TransactionCount: ${this.transactionCount}, shouldReset: ${shouldReset}`,
    );

    try {
      const mode = options?.mode || 'multi';

      const result = await (mode === 'single'
        ? this.parseSinglePass(transcript, context, requestId, shouldReset)
        : this.parseMultiPass(transcript, context, requestId, shouldReset));

      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));

      const errorDetails = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        raw: JSON.stringify(e, Object.getOwnPropertyNames(e), 2),
        transcriptLength: transcript?.length,
        timestamp: new Date().toISOString(),
      };

      logger.error(`[NativeAIProvider] Parse failed`, error, errorDetails);

      if (error.message.includes('LiteRT-LM')) {
        logger.error(`[NativeAIProvider] LiteRT runtime failure detected`, undefined, {
          likelyCauses: [
            'context overflow',
            'OOM / memory pressure',
            'invalid session state',
            'concurrent inference',
          ],
        });
      }

      return null;
    }
  }

  private async parseSinglePass(
    transcript: string,
    context: AIContext,
    requestId: number,
    shouldReset: boolean,
  ): Promise<ParserOutput | null> {
    const startTime = Date.now();
    const prompt = createCompactSinglePassPrompt(transcript, context.accounts, context.categories);

    logger.info('[NativeAIProvider] Compact single-pass parse starting...');
    if (requestId !== this.currentRequestId) return null;

    logger.info(`[NativeAIProvider] Compact single-pass Prompt: ${prompt}`);
    const response = await this.engine.generate(prompt, {
      resetContext: shouldReset,
    });

    if (requestId !== this.currentRequestId) return null;

    const parsedCompact = this.safeParseJSON(response.text);
    if (!Array.isArray(parsedCompact) || parsedCompact.length < 3) {
      logger.warn(`[NativeAIProvider] Failed to parse compact array from: "${response.text}"`);
      return null;
    }

    const t = typeof parsedCompact[0] === 'number' ? parsedCompact[0] : 0;
    const s = typeof parsedCompact[1] === 'number' ? parsedCompact[1] : -1;
    const g = typeof parsedCompact[2] === 'number' ? parsedCompact[2] : -1;

    let type = 'expense';
    if (t === 1) type = 'income';
    else if (t === 2) type = 'transfer';

    let source = 'unknown';
    let target = 'unknown';

    if (type === 'income') {
      if (s >= 0 && s < context.categories.length) {
        source = context.categories[s];
      }
      if (g >= 0 && g < context.accounts.length) {
        target = context.accounts[g];
      }
    } else {
      if (s >= 0 && s < context.accounts.length) {
        source = context.accounts[s];
      }
      const targetList = type === 'expense' ? context.categories : context.accounts;
      if (g >= 0 && g < targetList.length) {
        target = targetList[g];
      }
    }

    const resolvedSource =
      source !== 'unknown' && source !== 'null' ? source : context.parserHints.rawAccount;
    const resolvedTarget =
      target !== 'unknown' && target !== 'null' ? target : context.parserHints.rawItem;

    let finalAssetHint = resolvedSource;
    let finalCategoryHint = resolvedTarget;

    if (type === 'income') {
      finalAssetHint = resolvedTarget;
      finalCategoryHint = resolvedSource;
    } else if (type === 'transfer') {
      finalAssetHint = resolvedSource;
      finalCategoryHint = resolvedTarget;
    }

    return {
      transactions: [
        {
          type: type as TransactionType,
          amount: context.parserHints.amount,
          currencyCode: 'INR',
          accountNameHint: finalAssetHint,
          categoryNameHint: finalCategoryHint,
          description: transcript,
          isReversal:
            transcript.toLowerCase().includes('refund') ||
            transcript.toLowerCase().includes('cashback'),
        },
      ],
      confidenceScore: 0.9,
      isHighConfidence: true,
      provider: 'ai',
      debugMetrics: {
        totalInferenceMs: Date.now() - startTime,
        lastPassStats: response.stats,
        memorySummary: this.engine.getMemorySummary?.() || undefined,
      },
    };
  }

  private async parseMultiPass(
    transcript: string,
    context: AIContext,
    requestId: number,
    shouldReset: boolean,
  ): Promise<ParserOutput | null> {
    const timings: Record<string, number> = {};
    const startTime = Date.now();

    const checkCancellation = () => {
      if (requestId !== this.currentRequestId) {
        throw new Error('REQUEST_CANCELLED');
      }
    };

    try {
      let resetRequired = shouldReset;
      let type = 'expense';

      // PASS 1: Type Classification (Skip if direction is deterministically known)
      const direction = context.parserHints.direction;
      if (direction && direction !== 'unknown') {
        type = direction === 'credit' ? 'income' : 'expense';
        logger.info(
          `[NativeAIProvider] Bypassing Pass 1 Type Classification. Resolved from context: ${type}`,
        );
        timings['Pass 1: Type (Bypassed)'] = 0;
      } else {
        checkCancellation();
        const p1Start = Date.now();
        const typePrompt = createTypeClassificationPrompt(transcript);
        logger.info(`[NativeAIProvider] Pass 1 Prompt: ${typePrompt}`);

        const typeResponse = await this.engine.generate(typePrompt, {
          resetContext: resetRequired,
        });
        resetRequired = false;
        if (typeResponse.stats)
          logger.info(`[NativeAIProvider] Pass 1 Stats: ${JSON.stringify(typeResponse.stats)}`);

        const parsedType = this.safeParseJSON(typeResponse.text);
        const t = typeof parsedType === 'number' ? parsedType : 0;
        type = 'expense';
        if (t === 1) type = 'income';
        else if (t === 2) type = 'transfer';
        timings['Pass 1: Type'] = Date.now() - p1Start;
      }

      // PASS 2: Source Resolution
      checkCancellation();
      const p2Start = Date.now();
      const p2Entities = type === 'income' ? context.categories : context.accounts;
      const sourcePrompt = createEntityResolutionPrompt(
        transcript,
        type,
        'SOURCE_ACCOUNT',
        p2Entities,
      );
      logger.info(`[NativeAIProvider] Pass 2 Prompt: ${sourcePrompt}`);

      const sourceResponse = await this.engine.generate(sourcePrompt, {
        resetContext: resetRequired,
      });
      resetRequired = false;
      if (sourceResponse.stats)
        logger.info(`[NativeAIProvider] Pass 2 Stats: ${JSON.stringify(sourceResponse.stats)}`);

      const parsedSource = this.safeParseJSON(sourceResponse.text);
      const idx2 = typeof parsedSource === 'number' ? parsedSource : -1;
      const source = idx2 >= 0 && idx2 < p2Entities.length ? p2Entities[idx2] : 'unknown';
      timings['Pass 2: Source'] = Date.now() - p2Start;

      // PASS 3: Target Resolution
      checkCancellation();
      const p3Start = Date.now();
      let p3Entities =
        type === 'income' || type === 'transfer' ? context.accounts : context.categories;

      if (type === 'transfer' && source !== 'unknown') {
        p3Entities = p3Entities.filter(e => e !== source);
      }

      const targetPrompt = createEntityResolutionPrompt(
        transcript,
        type,
        'TARGET_CATEGORY',
        p3Entities,
      );
      logger.info(`[NativeAIProvider] Pass 3 Prompt: ${targetPrompt}`);

      const targetResponse = await this.engine.generate(targetPrompt, {
        resetContext: false,
      });
      if (targetResponse.stats)
        logger.info(`[NativeAIProvider] Pass 3 Stats: ${JSON.stringify(targetResponse.stats)}`);

      const parsedTarget = this.safeParseJSON(targetResponse.text);
      const idx3 = typeof parsedTarget === 'number' ? parsedTarget : -1;
      const target = idx3 >= 0 && idx3 < p3Entities.length ? p3Entities[idx3] : 'unknown';
      timings['Pass 3: Target'] = Date.now() - p3Start;

      // STEP 4: Code-based Synthesis
      checkCancellation();
      const finalInferenceTime = Date.now() - startTime;

      const resolvedSource =
        source !== 'unknown' && source !== 'null' ? source : context.parserHints.rawAccount;
      const resolvedTarget =
        target !== 'unknown' && target !== 'null' ? target : context.parserHints.rawItem;

      let finalAssetHint = resolvedSource;
      let finalCategoryHint = resolvedTarget;

      if (type === 'income') {
        finalAssetHint = resolvedTarget;
        finalCategoryHint = resolvedSource;
      } else if (type === 'transfer') {
        finalAssetHint = resolvedSource;
        finalCategoryHint = resolvedTarget;
      }

      return {
        transactions: [
          {
            type: type as TransactionType,
            amount: context.parserHints.amount,
            currencyCode: 'INR',
            accountNameHint: finalAssetHint,
            categoryNameHint: finalCategoryHint,
            description: transcript,
            isReversal:
              transcript.toLowerCase().includes('refund') ||
              transcript.toLowerCase().includes('cashback'),
          },
        ],
        confidenceScore: 0.9,
        isHighConfidence: true,
        provider: 'ai',
        debugMetrics: {
          passTimings: timings,
          totalInferenceMs: finalInferenceTime,
          lastPassStats: targetResponse.stats,
          memorySummary: this.engine.getMemorySummary?.() || undefined,
        },
      };
    } catch (e) {
      if (e instanceof Error && e.message === 'REQUEST_CANCELLED') {
        logger.info(`[NativeAIProvider] Multi-pass cancelled for request ${requestId}`);
      } else {
        throw e;
      }
      return null;
    }
  }

  private safeParseJSON(text: string): any {
    try {
      const cleaned = text.trim();
      return JSON.parse(cleaned);
    } catch {
      try {
        const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
          return JSON.parse(match[0]);
        }
      } catch {}

      const numMatch = text.match(/-?\d+/);
      if (numMatch) {
        return parseInt(numMatch[0], 10);
      }
      return null;
    }
  }

  async abort() {
    logger.info('[NativeAIProvider] Explicitly aborting ongoing requests...');
    this.currentRequestId++;
  }
}

export const nativeAIProvider = new NativeAIProvider(smallModelProvider);
