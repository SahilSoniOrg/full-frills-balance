import { AppConfig } from '@/src/constants/app-config';
import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import { logger } from '@/src/utils/logger';
import {
  AIContext,
  ParserOutput,
  TransactionFallbackAIProvider,
  TransactionType,
} from '../types/ai-parsing';
import { createEntityResolutionPrompt, createTypeClassificationPrompt } from '../utils/ai-prompts';

export class NativeAIProvider implements TransactionFallbackAIProvider {
  private currentModelId: string = AppConfig.defaults.defaultAiModelId;
  private initializedModelId: string | null = null;
  private currentRequestId: number = 0;
  private transactionCount = 0;

  getLoadedModelId(): string | null {
    return this.initializedModelId;
  }

  async preload(modelId: string): Promise<void> {
    const status = await modelManagementService.getDownloadStatus(modelId);
    if (!status.isDownloaded || !status.localPath) return;

    const model = modelManagementService.getAllModels().find(m => m.id === modelId);
    const preferredBackend =
      (model?.defaultConfig?.accelerators?.split(',')[0] as 'cpu' | 'gpu' | 'npu') || 'cpu';

    await smallModelProvider.initialize(status.localPath, {
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
      maxTokens: model?.defaultConfig?.maxTokens ?? 1024,
      temperature: model?.defaultConfig?.temperature ?? 0.7,
      topK: model?.defaultConfig?.topK ?? 40,
      topP: model?.defaultConfig?.topP ?? 0.95,
      backend: preferredBackend,
    });
    this.currentModelId = modelId;
    this.initializedModelId = modelId;
  }

  async unload(): Promise<void> {
    await smallModelProvider.dispose();
    this.initializedModelId = null;
  }

  async parse(
    transcript: string,
    context: AIContext,
    options?: { mode?: 'single' | 'multi' },
  ): Promise<ParserOutput | null> {
    const requestId = ++this.currentRequestId;
    this.transactionCount++;
    const shouldReset = this.transactionCount % 5 === 1;

    logger.info(
      `[NativeAIProvider] Parse called. TransactionCount: ${this.transactionCount}, shouldReset: ${shouldReset}`,
    );

    try {
      const status = await modelManagementService.getDownloadStatus(this.currentModelId);
      if (!status.isDownloaded || !status.localPath) return null;

      if (this.initializedModelId !== this.currentModelId) {
        // Forward model-specific config for optimal inference parameters
        const model = modelManagementService.getAllModels().find(m => m.id === this.currentModelId);
        const preferredBackend =
          (model?.defaultConfig?.accelerators?.split(',')[0] as 'cpu' | 'gpu' | 'npu') || 'cpu';
        await smallModelProvider.initialize(status.localPath, {
          systemPrompt:
            'You are a high-precision financial transaction parser. Output valid JSON only.',
          maxTokens: model?.defaultConfig?.maxTokens ?? 1024,
          temperature: model?.defaultConfig?.temperature ?? 0.7,
          topK: model?.defaultConfig?.topK ?? 40,
          topP: model?.defaultConfig?.topP ?? 0.95,
          backend: preferredBackend,
        });
        this.initializedModelId = this.currentModelId;
      }

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

        // useful local LLM debugging
        transcriptLength: transcript?.length,
        timestamp: new Date().toISOString(),
      };

      logger.error(`[NativeAIProvider] Parse failed`, errorDetails);

      // specifically detect LiteRT failures
      if (error.message.includes('LiteRT-LM')) {
        logger.error(`[NativeAIProvider] LiteRT runtime failure detected`, {
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
    const response = await smallModelProvider.generate(prompt, { resetContext: shouldReset });

    // Check cancellation again after native call
    if (requestId !== this.currentRequestId) return null;

    return this.cleanAndParseJSON(response);
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
      // PASS 1: Type Classification
      checkCancellation();
      const p1Start = Date.now();
      const typePrompt = createTypeClassificationPrompt(transcript);
      logger.info(`[NativeAIProvider] Pass 1 Prompt: ${typePrompt}`);
      const typeResponse = await smallModelProvider.generate(typePrompt, {
        resetContext: shouldReset,
      });
      const p1Stats = smallModelProvider.getStats();
      if (p1Stats) logger.info(`[NativeAIProvider] Pass 1 Stats: ${JSON.stringify(p1Stats)}`);

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
      const sourceResponse = await smallModelProvider.generate(sourcePrompt, {
        resetContext: false,
      });
      const p2Stats = smallModelProvider.getStats();
      if (p2Stats) logger.info(`[NativeAIProvider] Pass 2 Stats: ${JSON.stringify(p2Stats)}`);

      const parsedSource = this.safeParseJSON(sourceResponse) || {};
      const source = typeof parsedSource.name === 'string' ? parsedSource.name : 'unknown';
      timings['Pass 2: Source'] = Date.now() - p2Start;

      // PASS 3: Target Resolution
      checkCancellation();
      const p3Start = Date.now();
      // For Income: Target is an Asset. For Expense: Target is a Category. For Transfer: Target is an Asset.
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
      const targetResponse = await smallModelProvider.generate(targetPrompt, {
        resetContext: false,
      });
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

      // Capture final pass inference stats for diagnostics
      const lastStats = smallModelProvider.getStats();
      if (lastStats) {
        logger.info(`[NativeAIProvider] Pass 3 Stats: ${JSON.stringify(lastStats)}`);
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
          lastPassStats: lastStats ?? undefined,
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

  async abort() {
    logger.info('[NativeAIProvider] Explicitly aborting ongoing requests...');
    this.currentRequestId++; // Cancel any multipass tasks
  }
}

export const nativeAIProvider = new NativeAIProvider();
