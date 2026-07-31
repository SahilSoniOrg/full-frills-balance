import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import {
  createLLM,
  type Backend,
  type LiteRTLMInstance,
  type MemoryTrackerSummary,
  type MultimodalPart,
} from 'react-native-litert-lm';
import { modelManagementService } from './ModelManagementService';
import type { AIGenerateOptions, DynamicLLMEngine, GenerateResult, InferenceStats } from './types';

function isBackend(value: unknown): value is Backend {
  return value === 'cpu' || value === 'gpu' || value === 'npu';
}

export class SmallModelProvider implements DynamicLLMEngine {
  private llm: LiteRTLMInstance | null = null;
  private currentModelId: string | null = null;
  private currentSystemPrompt: string | null = null;
  private defaultModelId: string = AppConfig.defaults.defaultAiModelId;
  private activeBackend: Backend = 'cpu';
  private busy = false;

  constructor(defaultModelId: string = AppConfig.defaults.defaultAiModelId) {
    this.defaultModelId = defaultModelId;
  }

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

    // Check if the model with same configurations is already loaded
    if (
      this.currentModelId === modelId &&
      this.currentSystemPrompt === targetSystemPrompt &&
      this.llm &&
      (!overrideBackend || overrideBackend === 'auto' || this.activeBackend === overrideBackend)
    ) {
      return;
    }

    // Unload existing model if loading configuration changes
    if (this.llm) {
      await this.disposeInternal();
    }

    // OOM Prevention check
    if (model.minDeviceMemoryGb && Device.totalMemory) {
      const totalMemoryGb = Math.round(Device.totalMemory / (1024 * 1024 * 1024));
      if (totalMemoryGb < model.minDeviceMemoryGb) {
        throw new Error(
          `Insufficient device memory. Model requires ${model.minDeviceMemoryGb}GB RAM, but device only has ${totalMemoryGb}GB.`,
        );
      }
    }

    const status = await modelManagementService.getDownloadStatus(modelId);
    if (!status.isDownloaded) {
      throw new Error(`Model ${modelId} is not downloaded.`);
    }

    // Select the best hardware accelerator supported
    // iOS: always use 'cpu' — the C engine uses Metal internally regardless.
    // Explicitly requesting 'gpu' causes execute failures on iOS.
    // Android: prefer 'gpu' if available for the model.
    let requestedBackend: Backend = 'cpu';
    if (overrideBackend && overrideBackend !== 'auto') {
      requestedBackend = overrideBackend;
    } else if (Platform.OS === 'android') {
      if (model.defaultConfig?.accelerators?.includes('gpu')) {
        requestedBackend = 'gpu';
      } else if (model.defaultConfig?.accelerators?.includes('npu')) {
        requestedBackend = 'npu';
      }
    }

    logger.info(
      `[SmallModelProvider] Initializing model ${modelId} with URL ${model.url} (backend: ${requestedBackend})`,
    );

    this.llm = createLLM({ enableMemoryTracking: true });

    const enableSpeculativeDecoding = model.capabilities?.includes('speculative_decoding') ?? false;

    await this.llm.loadModel(model.url, {
      backend: requestedBackend,
      maxContextTokens: model.defaultConfig?.maxContextTokens ?? 4096,
      maxOutputTokens:
        model.defaultConfig?.maxOutputTokens ?? model.defaultConfig?.maxTokens ?? 1024,
      systemPrompt: targetSystemPrompt,
      temperature: model.defaultConfig?.temperature ?? 0.7,
      topK: model.defaultConfig?.topK ?? 40,
      topP: model.defaultConfig?.topP ?? 0.95,
      enableSpeculativeDecoding,
      multimodal: !!(model.supportsImage || model.supportsAudio),
    });

    this.currentModelId = modelId;
    this.currentSystemPrompt = targetSystemPrompt;
    // Synchronize activeBackend with what was actually initialized (falls back natively to cpu if gpu fails)
    try {
      const nativeBackend = Reflect.get(this.llm, 'backend');
      this.activeBackend = isBackend(nativeBackend) ? nativeBackend : requestedBackend;
    } catch {
      this.activeBackend = requestedBackend;
    }

    logger.info(
      `[SmallModelProvider] Model ${modelId} initialized successfully with active backend: ${this.activeBackend}`,
    );
  }

  async switchModel(
    modelId: string,
    overrideBackend?: 'auto' | Backend,
    systemPrompt?: string,
  ): Promise<void> {
    if (this.busy) throw new Error('Cannot switch model while inference is active');
    await this.switchModelInternal(modelId, overrideBackend, systemPrompt);
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
    if (this.busy) throw new Error('Inference engine is busy');
    this.busy = true;

    try {
      const targetModelId = this.currentModelId || this.defaultModelId;
      await this.ensureModelLoaded(targetModelId, undefined, options?.systemPrompt);
      if (!this.llm) throw new Error('Provider not initialized');

      if (options?.resetContext !== false) {
        this.llm.resetConversation();
      }

      logger.info(`[SmallModelProvider] Generating completion for ${targetModelId}...`);
      const formattedPrompt = `Output valid JSON only. No explanations. Do not use <think> tags.\n\n${prompt}`;

      const parts: MultimodalPart[] = [{ type: 'text', text: formattedPrompt }];
      const result = await this.llm.execute(parts);
      logger.info('[SmallModelProvider] Raw response received:', { text: result });

      // Clean think tags if any reasoning model was used
      let cleaned = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (cleaned.includes('</think>')) {
        cleaned = cleaned.substring(cleaned.indexOf('</think>') + 8).trim();
      }

      const stats = this.captureStats();
      return { text: cleaned, stats: stats || undefined };
    } finally {
      this.busy = false;
    }
  }

  async generateStream(
    prompt: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void> {
    if (this.busy) throw new Error('Inference engine is busy');
    this.busy = true;

    try {
      const targetModelId = this.currentModelId || this.defaultModelId;
      await this.ensureModelLoaded(targetModelId, undefined, options?.systemPrompt);
      if (!this.llm) throw new Error('Provider not initialized');

      if (options?.resetContext !== false) {
        this.llm.resetConversation();
      }

      const parts: MultimodalPart[] = [{ type: 'text', text: prompt }];
      await this.llm.execute(parts, (token: string, done: boolean) => {
        onToken(token, done);
      });
      this.busy = false;
    } catch (e) {
      this.busy = false;
      throw e;
    }
  }

  private captureStats(): InferenceStats | null {
    if (!this.llm) return null;
    try {
      const stats = this.llm.getStats();
      return {
        tokensPerSecond: stats.tokensPerSecond,
        timeToFirstTokenMs: stats.timeToFirstToken * 1000,
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
    }
  }

  getMemorySummary(): MemoryTrackerSummary | null {
    if (!this.llm) return null;
    return this.llm.memoryTracker?.getSummary() || null;
  }

  async dispose(): Promise<void> {
    await this.disposeInternal();
  }
}

export const smallModelProvider = new SmallModelProvider();
