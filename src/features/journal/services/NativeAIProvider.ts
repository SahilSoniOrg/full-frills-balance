import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import type { LLMEngine } from '@/src/services/ai/types';
import { logger } from '@/src/utils/logger';
import {
  AIContext,
  ParserOutput,
  TransactionFallbackAIProvider,
  TransactionType,
} from '../types/ai-parsing';
import { createEntityResolutionPrompt, createTypeClassificationPrompt } from '../utils/ai-prompts';

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
    const prompt = `
Role: High-precision financial transaction parser.
Task: Convert speech into a structured JSON transaction object.

USER INPUT: "${transcript}"

CANONICAL ASSET ACCOUNTS: ${context.accounts.join(', ')}
CANONICAL CATEGORIES: ${context.categories.join(', ')}

EXAMPLES:
1. Input: "spent 500 on dinner using hdfc card"
   Output: {"transactions":[{"type":"expense","amount":500,"currencyCode":"INR","accountNameHint":"HDFC Infinia","categoryNameHint":"Food & Drinks","description":"Dinner at restaurant","isReversal":false}],"confidenceScore":0.95,"isHighConfidence":true}

RULES:
1. Pick the EXACT NAME from the CANONICAL lists.
2. For expenses, type is "expense". For salary/income, type is "income".
3. Output valid minified JSON ONLY. No markdown.

Format: {"transactions":[{"type":"expense","amount":0,"currencyCode":"INR","accountNameHint":"","categoryNameHint":"","description":"","isReversal":false}],"confidenceScore":0.8,"isHighConfidence":false}
`.trim();

    logger.info('[NativeAIProvider] Single-pass parse starting...');
    if (requestId !== this.currentRequestId) return null;

    logger.info(`[NativeAIProvider] Single-pass Prompt: ${prompt}`);
    const response = await this.engine.generate(prompt, {
      resetContext: shouldReset,
    });

    if (requestId !== this.currentRequestId) return null;

    return this.cleanAndParseJSON(response.text);
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

        const parsedType = this.safeParseJSON(typeResponse.text) || {};
        type = String(parsedType.type || 'expense')
          .toLowerCase()
          .trim();
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

      const parsedSource = this.safeParseJSON(sourceResponse.text) || {};
      const source = typeof parsedSource.name === 'string' ? parsedSource.name : 'unknown';
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

      const parsedTarget = this.safeParseJSON(targetResponse.text) || {};
      const target = typeof parsedTarget.name === 'string' ? parsedTarget.name : 'unknown';
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

  private safeParseJSON(text: string): Record<string, unknown> | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }

  private cleanAndParseJSON(text: string): ParserOutput | null {
    const parsed = this.safeParseJSON(text);
    return parsed && Array.isArray(parsed.transactions)
      ? (parsed as unknown as ParserOutput)
      : null;
  }

  async abort() {
    logger.info('[NativeAIProvider] Explicitly aborting ongoing requests...');
    this.currentRequestId++;
  }
}

export const nativeAIProvider = new NativeAIProvider(smallModelProvider);
