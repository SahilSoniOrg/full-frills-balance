import { logger } from '@/src/utils/logger';
import { Platform } from 'react-native';
import {
  checkBackendSupport,
  createLLM,
  type Backend,
  type LiteRTLMInstance,
} from 'react-native-litert-lm';
import type { AIGenerateOptions, LLMEngine, GenerateResult, InferenceStats } from './types';
import { modelManagementService } from './ModelManagementService';

export class SmallModelProvider implements LLMEngine {
  private llm: LiteRTLMInstance | null = null;
  private currentModelId: string | null = null;

  private executionQueue: Promise<any> = Promise.resolve();

  private async ensureModelLoaded(modelId: string): Promise<void> {
    if (this.currentModelId === modelId && this.llm) {
      return;
    }

    const status = await modelManagementService.getDownloadStatus(modelId);
    if (!status.isDownloaded || !status.localPath) {
      throw new Error(`Model ${modelId} is not downloaded.`);
    }

    const model = modelManagementService.getAllModels().find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in catalog.`);
    }

    const normalizedPath = status.localPath.replace(/^file:\/\//, '');

    const preferredBackend = (model.defaultConfig?.accelerators?.split(',')[0] as Backend) || 'cpu';
    const requestedBackend: Backend =
      preferredBackend === 'gpu' || preferredBackend === 'cpu' || preferredBackend === 'npu'
        ? preferredBackend
        : Platform.OS === 'ios'
          ? 'gpu'
          : 'cpu';

    const backendWarning = checkBackendSupport(requestedBackend);
    const backend: Backend = backendWarning ? 'cpu' : requestedBackend;

    if (backendWarning) {
      logger.warn(
        `[SmallModelProvider] Backend '${requestedBackend}' unsupported: ${backendWarning}. Falling back to CPU.`,
      );
    }

    logger.info(
      `[SmallModelProvider] Initializing model ${modelId} at ${normalizedPath} (backend: ${backend})`,
    );

    try {
      if (!this.llm) {
        this.llm = createLLM({ enableMemoryTracking: true });
      }

      await this.llm.loadModel(normalizedPath, {
        backend,
        maxTokens: model.defaultConfig?.maxTokens ?? 1024,
        systemPrompt:
          'You are a high-precision financial transaction parser. Output valid JSON only.',
        temperature: model.defaultConfig?.temperature ?? 0.7,
        topK: model.defaultConfig?.topK ?? 40,
        topP: model.defaultConfig?.topP ?? 0.95,
      });

      this.currentModelId = modelId;
      logger.info(`[SmallModelProvider] Model ${modelId} initialized`);
    } catch (e) {
      this.currentModelId = null;
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.error(`[SmallModelProvider] loadModel failed: ${errorMsg}`, e);
      throw e;
    }
  }

  async generate(
    prompt: string,
    modelId: string,
    options?: AIGenerateOptions,
  ): Promise<GenerateResult> {
    const nextInQueue = this.executionQueue.then(() =>
      this.generateInternal(prompt, modelId, options),
    );
    this.executionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  async generateStream(
    prompt: string,
    modelId: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    const nextInQueue = this.executionQueue.then(() =>
      this.generateStreamInternal(prompt, modelId, onToken, options),
    );
    this.executionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  private async generateInternal(
    prompt: string,
    modelId: string,
    options?: AIGenerateOptions,
    retryCount = 0,
  ): Promise<GenerateResult> {
    await this.ensureModelLoaded(modelId);
    if (!this.llm) throw new Error('Provider not initialized');

    if (options?.resetContext !== false) {
      this.llm.resetConversation();
    }

    logger.info(`[SmallModelProvider] Generating completion for ${modelId}...`);

    try {
      const formattedPrompt = `Output valid JSON only. No explanations. Do not use <think> tags.\n\n${prompt}`;

      let result = await this.llm.sendMessage(formattedPrompt);

      logger.info('[SmallModelProvider] Raw response received:', { text: result });

      if (result.includes('</think>')) {
        result = result.substring(result.indexOf('</think>') + 8);
      }
      result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

      const stats = this.captureStats();

      return { text: result, stats: stats || undefined };
    } catch (e) {
      const errorMsg = String(e);
      if (errorMsg.includes('busy') && retryCount < 3) {
        const backoff = (retryCount + 1) * 300;
        logger.warn(`[SmallModelProvider] Native busy, retrying in ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
        return this.generateInternal(prompt, modelId, options, retryCount + 1);
      }

      throw e;
    }
  }

  private async generateStreamInternal(
    prompt: string,
    modelId: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    await this.ensureModelLoaded(modelId);
    if (!this.llm) throw new Error('Provider not initialized');

    if (options?.resetContext !== false) {
      this.llm.resetConversation();
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.llm!.sendMessageAsync(prompt, (token: string, done: boolean) => {
          onToken(token, done);
          if (done) {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  private captureStats(): InferenceStats | null {
    if (!this.llm) return null;
    try {
      const stats = this.llm.getStats();
      return {
        tokensPerSecond: stats.tokensPerSecond,
        timeToFirstTokenMs: stats.timeToFirstToken,
        completionTokens: stats.completionTokens,
        totalDurationMs:
          stats.tokensPerSecond > 0 ? (stats.completionTokens / stats.tokensPerSecond) * 1000 : 0,
      };
    } catch {
      return null;
    }
  }

  private async disposeInternal(): Promise<void> {
    if (this.llm) {
      logger.info('[SmallModelProvider] Disposing LLM context');
      try {
        this.llm.close();
      } catch {}
      this.llm = null;
      this.currentModelId = null;
    }
  }

  async dispose(): Promise<void> {
    this.executionQueue = this.executionQueue.then(() => this.disposeInternal());
    return this.executionQueue;
  }
}

export const smallModelProvider = new SmallModelProvider();
