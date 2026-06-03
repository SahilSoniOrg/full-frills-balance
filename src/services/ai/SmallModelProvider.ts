import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import {
  checkBackendSupport,
  createLLM,
  type Backend,
  type LiteRTLMInstance,
} from 'react-native-litert-lm';
import { modelManagementService } from './ModelManagementService';
import type { AIGenerateOptions, DynamicLLMEngine, GenerateResult, InferenceStats } from './types';

export class SmallModelProvider implements DynamicLLMEngine {
  private llm: LiteRTLMInstance | null = null;
  private currentModelId: string | null = null;
  private currentSystemPrompt: string | null = null;
  private defaultModelId: string = AppConfig.defaults.defaultAiModelId;
  private lastTeardownTime = 0;
  private activeBackend: Backend = 'cpu';

  constructor(defaultModelId: string = AppConfig.defaults.defaultAiModelId) {
    this.defaultModelId = defaultModelId;
  }

  private executionQueue: Promise<any> = Promise.resolve();

  getLoadedModelId(): string | null {
    return this.currentModelId;
  }

  private async ensureModelLoaded(
    modelId: string,
    overrideBackend?: 'auto' | Backend,
    systemPromptOverride?: string,
  ): Promise<void> {
    const model = modelManagementService.getAllModels().find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in catalog.`);
    }

    const targetSystemPrompt =
      systemPromptOverride || model.defaultConfig?.systemPrompt || 'You are a helpful assistant.';

    // Force reload if backend override or system prompt changes
    if (
      this.currentModelId === modelId &&
      this.currentSystemPrompt === targetSystemPrompt &&
      this.llm &&
      (!overrideBackend || overrideBackend === 'auto' || this.activeBackend === overrideBackend)
    ) {
      return;
    }

    if (
      this.llm &&
      ((overrideBackend && overrideBackend !== 'auto' && this.activeBackend !== overrideBackend) ||
        this.currentSystemPrompt !== targetSystemPrompt)
    ) {
      await this.disposeInternal();
    }

    const timeSinceTeardown = Date.now() - this.lastTeardownTime;
    if (timeSinceTeardown < 3000) {
      const waitTime = 3000 - timeSinceTeardown;
      logger.info(`[SmallModelProvider] Waiting ${waitTime}ms for native teardown...`);
      await new Promise(r => setTimeout(r, waitTime));
    }

    const status = await modelManagementService.getDownloadStatus(modelId);
    if (!status.isDownloaded || !status.localPath) {
      throw new Error(`Model ${modelId} is not downloaded.`);
    }

    // OOM Prevention: Check if the device has enough RAM to load the model
    if (model.minDeviceMemoryGb && Device.totalMemory) {
      // OS often reports slightly less than advertised RAM (e.g., 5.7GB for 6GB). Round up to nearest GB.
      const totalMemoryGb = Math.round(Device.totalMemory / (1024 * 1024 * 1024));
      if (totalMemoryGb < model.minDeviceMemoryGb) {
        throw new Error(
          `Insufficient device memory. Model requires ${model.minDeviceMemoryGb}GB RAM, but device only has ${totalMemoryGb}GB. Loading this model would cause a crash.`,
        );
      }
    }

    logger.info(`[SmallModelProvider] Found model metadata: ${JSON.stringify(model)}`);

    const normalizedPath = status.localPath.replace(/^file:\/\//, '');

    // Select the best hardware accelerator supported by the model:
    // - On Android, we prefer 'npu' (Hexagon DSP) if supported by the model, then 'gpu', falling back to 'cpu'.
    // - On iOS, we prefer 'gpu' (Metal), falling back to 'cpu'.
    let requestedBackend: Backend = 'cpu';
    if (overrideBackend && overrideBackend !== 'auto') {
      requestedBackend = overrideBackend;
    } else if (Platform.OS === 'android') {
      // Prefer GPU over NPU in 'auto' mode to avoid missing QNN dispatch library errors on unsupported devices
      if (model.defaultConfig?.accelerators?.includes('gpu')) {
        requestedBackend = 'gpu';
      } else if (model.defaultConfig?.accelerators?.includes('npu')) {
        requestedBackend = 'npu';
      }
    } else {
      if (model.defaultConfig?.accelerators?.includes('gpu')) {
        requestedBackend = 'gpu';
      }
    }

    const backendWarning = checkBackendSupport(requestedBackend);
    if (backendWarning) {
      logger.info(
        `[SmallModelProvider] Backend warning for '${requestedBackend}': ${backendWarning}`,
      );
    }

    logger.info(
      `[SmallModelProvider] Initializing model ${modelId} at ${normalizedPath} (requested backend: ${requestedBackend})`,
    );

    // Ensure the LLM engine instance is created first
    if (!this.llm) {
      try {
        this.llm = createLLM({ enableMemoryTracking: true });
      } catch (creationError) {
        logger.error(`[SmallModelProvider] Failed to create LLM engine context:`, creationError);
        throw creationError;
      }
    }

    const enableSpeculativeDecoding = model.capabilities?.includes('speculative_decoding') ?? false;

    // Load the model in its own try-catch block for clean fallback handling
    try {
      await this.llm.loadModel(normalizedPath, {
        backend: requestedBackend,
        maxTokens: model.defaultConfig?.maxTokens ?? 1024,
        systemPrompt: targetSystemPrompt,
        temperature: model.defaultConfig?.temperature ?? 0.7,
        topK: model.defaultConfig?.topK ?? 40,
        topP: model.defaultConfig?.topP ?? 0.95,
        enableSpeculativeDecoding,
        multimodal: requestedBackend === 'cpu' ? false : undefined,
      });

      this.currentModelId = modelId;
      this.currentSystemPrompt = targetSystemPrompt;
      this.activeBackend = requestedBackend;
      logger.info(
        `[SmallModelProvider] Model ${modelId} initialized successfully with backend: ${requestedBackend}`,
      );
    } catch (e) {
      // Dynamic Hardware Fallback:
      // If we requested NPU or GPU and it failed to load natively, try falling back to CPU
      if (requestedBackend !== 'cpu' && this.llm) {
        logger.warn(
          `[SmallModelProvider] Native load failed for '${requestedBackend}'. Gracefully falling back to CPU...`,
          e as any,
        );
        try {
          // The previous llm instance is poisoned because loadModel failed.
          // We must dispose it and create a new one before attempting fallback.
          try {
            this.llm.close();
          } catch {}

          logger.info(
            `[SmallModelProvider] Waiting 3000ms for native C++ thread pool cooldown before CPU fallback...`,
          );
          await new Promise(r => setTimeout(r, 3000));
          this.llm = createLLM({ enableMemoryTracking: true });

          await this.llm.loadModel(normalizedPath, {
            backend: 'cpu',
            maxTokens: model.defaultConfig?.maxTokens ?? 1024,
            systemPrompt: targetSystemPrompt,
            temperature: model.defaultConfig?.temperature ?? 0.7,
            topK: model.defaultConfig?.topK ?? 40,
            topP: model.defaultConfig?.topP ?? 0.95,
            multimodal: false,
          });
          this.currentModelId = modelId;
          this.currentSystemPrompt = targetSystemPrompt;
          this.activeBackend = 'cpu';
          logger.info(
            `[SmallModelProvider] Model ${modelId} successfully initialized with CPU fallback`,
          );
          return;
        } catch (fallbackError) {
          try {
            if (this.llm) this.llm.close();
          } catch {}
          this.llm = null;
          this.currentModelId = null;
          this.currentSystemPrompt = null;
          this.activeBackend = 'cpu';
          logger.error(`[SmallModelProvider] CPU fallback failed:`, fallbackError);
          throw fallbackError;
        }
      }
      try {
        if (this.llm) this.llm.close();
      } catch {}
      this.llm = null;
      this.currentModelId = null;
      this.currentSystemPrompt = null;
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.error(`[SmallModelProvider] loadModel failed: ${errorMsg}`, e);
      throw e;
    }
  }

  async switchModel(
    modelId: string,
    overrideBackend?: 'auto' | Backend,
    systemPrompt?: string,
  ): Promise<void> {
    const nextInQueue = this.executionQueue.then(() =>
      this.switchModelInternal(modelId, overrideBackend, systemPrompt),
    );
    this.executionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  private async switchModelInternal(
    modelId: string,
    overrideBackend?: 'auto' | Backend,
    systemPrompt?: string,
  ): Promise<void> {
    const model = modelManagementService.getAllModels().find(m => m.id === modelId);
    const targetSystemPrompt =
      systemPrompt || model?.defaultConfig?.systemPrompt || 'You are a helpful assistant.';

    if (
      this.currentModelId === modelId &&
      this.currentSystemPrompt === targetSystemPrompt &&
      this.llm &&
      (!overrideBackend || overrideBackend === 'auto' || this.activeBackend === overrideBackend)
    ) {
      return;
    }
    if (this.llm) {
      await this.disposeInternal();
    }
    this.defaultModelId = modelId;
    await this.ensureModelLoaded(modelId, overrideBackend, systemPrompt);
  }

  async generate(prompt: string, options?: AIGenerateOptions): Promise<GenerateResult> {
    const nextInQueue = this.executionQueue.then(() => this.generateInternal(prompt, options));
    this.executionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  async generateStream(
    prompt: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    const nextInQueue = this.executionQueue.then(() =>
      this.generateStreamInternal(prompt, onToken, options),
    );
    this.executionQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  private async generateInternal(
    prompt: string,
    options?: AIGenerateOptions,
    retryCount = 0,
  ): Promise<GenerateResult> {
    const targetModelId = this.currentModelId || this.defaultModelId;
    await this.ensureModelLoaded(targetModelId, undefined, options?.systemPrompt);
    if (!this.llm) throw new Error('Provider not initialized');

    if (options?.resetContext !== false) {
      this.llm.resetConversation();
    }

    logger.info(`[SmallModelProvider] Generating completion for ${targetModelId}...`);

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
        return this.generateInternal(prompt, options, retryCount + 1);
      }

      // Dynamic Resiliency Fallback:
      // If prompt execution failed (e.g. LiteRT sendMessage throws due to Metal GPU/OpenCL driver bugs)
      // and we are currently loaded on a hardware accelerator (GPU/NPU), reload on CPU and retry.
      if (this.activeBackend !== 'cpu' && this.currentModelId) {
        logger.warn(
          `[SmallModelProvider] Inference failed on '${this.activeBackend}'. Gracefully reloading on CPU...`,
          e as any,
        );
        try {
          const modelIdToReload = this.currentModelId;
          await this.disposeInternal();

          // Wait for C++ thread pool teardown cooldown of 3000ms before re-creating engine
          logger.info(
            `[SmallModelProvider] Resiliency: waiting 3000ms for native C++ thread pool cooldown...`,
          );
          await new Promise(r => setTimeout(r, 3000));

          // Force load on CPU
          this.llm = createLLM({ enableMemoryTracking: true });
          const status = await modelManagementService.getDownloadStatus(modelIdToReload);
          const model = modelManagementService.getAllModels().find(m => m.id === modelIdToReload);
          if (status.localPath && model) {
            const normalizedPath = status.localPath.replace(/^file:\/\//, '');
            const targetSystemPrompt =
              options?.systemPrompt ||
              model.defaultConfig?.systemPrompt ||
              'You are a helpful assistant.';

            await this.llm.loadModel(normalizedPath, {
              backend: 'cpu',
              maxTokens: model.defaultConfig?.maxTokens ?? 1024,
              systemPrompt: targetSystemPrompt,
              temperature: model.defaultConfig?.temperature ?? 0.7,
              topK: model.defaultConfig?.topK ?? 40,
              topP: model.defaultConfig?.topP ?? 0.95,
              multimodal: false,
            });
            this.currentModelId = modelIdToReload;
            this.currentSystemPrompt = targetSystemPrompt;
            this.activeBackend = 'cpu';
            logger.info(
              `[SmallModelProvider] Resiliency CPU reload successful. Retrying inference...`,
            );

            // Re-attempt inference on CPU
            if (options?.resetContext !== false) {
              this.llm.resetConversation();
            }
            const formattedPrompt = `Output valid JSON only. No explanations. Do not use <think> tags.\n\n${prompt}`;
            let result = await this.llm.sendMessage(formattedPrompt);
            logger.info('[SmallModelProvider] Resiliency CPU response received:', { text: result });

            if (result.includes('</think>')) {
              result = result.substring(result.indexOf('</think>') + 8);
            }
            result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            const stats = this.captureStats();
            return { text: result, stats: stats || undefined };
          }
        } catch (fallbackError) {
          try {
            if (this.llm) this.llm.close();
          } catch {}
          this.llm = null;
          this.currentModelId = null;
          this.currentSystemPrompt = null;
          this.activeBackend = 'cpu';
          logger.error(`[SmallModelProvider] Resiliency CPU fallback failed:`, fallbackError);
        }
      }

      throw e;
    }
  }

  private async generateStreamInternal(
    prompt: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    const targetModelId = this.currentModelId || this.defaultModelId;
    await this.ensureModelLoaded(targetModelId, undefined, options?.systemPrompt);
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
      this.currentSystemPrompt = null;
      this.activeBackend = 'cpu';
      this.lastTeardownTime = Date.now();
    }
  }

  async dispose(): Promise<void> {
    this.executionQueue = this.executionQueue.then(() => this.disposeInternal());
    return this.executionQueue;
  }
}

export const smallModelProvider = new SmallModelProvider();
