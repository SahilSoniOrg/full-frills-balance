import {
  AIContext,
  ParserOutput,
  TransactionFallbackAIProvider,
  TransactionType,
} from '../types/ai-parsing';
import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { createTypeClassificationPrompt, createEntityResolutionPrompt } from '../utils/ai-prompts';
import { logger } from '@/src/utils/logger';

export class NativeAIProvider implements TransactionFallbackAIProvider {
  private currentModelId: string = 'qwen-2.5-0.5b';
  private initializedModelId: string | null = null;
  private currentRequestId: number = 0;

  async parse(
    transcript: string,
    context: AIContext,
    options?: { mode?: 'single' | 'multi'; timeout?: number },
  ): Promise<ParserOutput | null> {
    const requestId = ++this.currentRequestId;

    try {
      const status = await modelManagementService.getDownloadStatus(this.currentModelId);
      if (!status.isDownloaded || !status.localPath) return null;

      if (this.initializedModelId !== this.currentModelId) {
        await smallModelProvider.initialize(status.localPath);
        this.initializedModelId = this.currentModelId;
      }

      const mode = options?.mode || 'multi';
      const timeout = options?.timeout || (mode === 'single' ? 5000 : 15000);

      // Wrap the entire parsing process in a global timeout
      let timeoutId: any;
      const timeoutPromise = new Promise<null>(resolve => {
        timeoutId = setTimeout(() => resolve(null), timeout);
      });

      const parsePromise =
        mode === 'single'
          ? this.parseSinglePass(transcript, context, requestId)
          : this.parseMultiPass(transcript, context, requestId);

      const result = await Promise.race([parsePromise, timeoutPromise]);

      if (!result) {
        logger.warn(
          `[NativeAIProvider] Global timeout reached (${timeout}ms) for request ${requestId}`,
        );
        // If timeout reached, we must ensure any background tasks stop before returning
        // to prevent the loop from starting a new request while the context is busy.
        if (requestId === this.currentRequestId) {
          logger.info('[NativeAIProvider] Forcing context reset after timeout...');
          await smallModelProvider.dispose();
          this.initializedModelId = null;
        }
      }

      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.error(`[NativeAIProvider] Parse failed: ${errorMsg}`, e);
      return null;
    }
  }

  private async parseSinglePass(
    transcript: string,
    context: AIContext,
    requestId: number,
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
    const response = await smallModelProvider.generate(prompt, { timeout: 8000 });

    // Check cancellation again after native call
    if (requestId !== this.currentRequestId) return null;

    return this.cleanAndParseJSON(response);
  }

  private async parseMultiPass(
    transcript: string,
    context: AIContext,
    requestId: number,
  ): Promise<ParserOutput | null> {
    const timings: Record<string, number> = {};
    const startTime = Date.now();

    const checkCancellation = () => {
      if (requestId !== this.currentRequestId) {
        throw new Error('REQUEST_CANCELLED');
      }
    };

    try {
      // PASS 1: Type Classification
      checkCancellation();
      const p1Start = Date.now();
      const typePrompt = createTypeClassificationPrompt(transcript);
      logger.info(`[NativeAIProvider] Pass 1 Prompt: ${typePrompt}`);
      const typeResponse = await smallModelProvider.generate(typePrompt, { timeout: 4000 });
      const parsedType = this.safeParseJSON(typeResponse) || {};
      let type = String(parsedType.type || 'expense')
        .toLowerCase()
        .trim();
      timings['Pass 1: Type'] = Date.now() - p1Start;

      // PASS 2: Source Resolution
      checkCancellation();
      const p2Start = Date.now();
      // For Income: Source is a Category. For Expense/Transfer: Source is an Asset.
      const p2Entities = type === 'income' ? context.categories : context.accounts;
      const sourcePrompt = createEntityResolutionPrompt(
        transcript,
        type,
        'SOURCE_ACCOUNT',
        p2Entities,
      );
      logger.info(`[NativeAIProvider] Pass 2 Prompt: ${sourcePrompt}`);
      const sourceResponse = await smallModelProvider.generate(sourcePrompt, { timeout: 4000 });
      const parsedSource = this.safeParseJSON(sourceResponse) || {};
      const source = typeof parsedSource.name === 'string' ? parsedSource.name : 'unknown';
      timings['Pass 2: Source'] = Date.now() - p2Start;

      // PASS 3: Target Resolution
      checkCancellation();
      const p3Start = Date.now();
      // For Income: Target is an Asset. For Expense: Target is a Category. For Transfer: Target is an Asset.
      const p3Entities =
        type === 'income' || type === 'transfer' ? context.accounts : context.categories;
      const targetPrompt = createEntityResolutionPrompt(
        transcript,
        type,
        'TARGET_CATEGORY',
        p3Entities,
      );
      logger.info(`[NativeAIProvider] Pass 3 Prompt: ${targetPrompt}`);
      const targetResponse = await smallModelProvider.generate(targetPrompt, { timeout: 4000 });
      const parsedTarget = this.safeParseJSON(targetResponse) || {};
      const target = typeof parsedTarget.name === 'string' ? parsedTarget.name : 'unknown';
      timings['Pass 3: Target'] = Date.now() - p3Start;

      // STEP 4: Code-based Synthesis
      checkCancellation();
      const finalInferenceTime = Date.now() - startTime;

      // Use deterministic hints if AI didn't find anything better
      const resolvedSource =
        source !== 'unknown' && source !== 'null' ? source : context.parserHints.rawAccount;
      const resolvedTarget =
        target !== 'unknown' && target !== 'null' ? target : context.parserHints.rawItem;

      // Role Mapping: accountNameHint is always the ASSET side, categoryNameHint is always the CATEGORY side.
      let finalAssetHint = resolvedSource;
      let finalCategoryHint = resolvedTarget;

      if (type === 'income') {
        // Income: Pass 2 was Category (Source), Pass 3 was Asset (Target)
        finalAssetHint = resolvedTarget;
        finalCategoryHint = resolvedSource;
      } else if (type === 'transfer') {
        // Transfer: Pass 2 was Asset (From), Pass 3 was Asset (To)
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

  setModel(modelId: string) {
    this.currentModelId = modelId;
  }
}

export const nativeAIProvider = new NativeAIProvider();
