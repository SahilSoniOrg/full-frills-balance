import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';
import { Platform } from 'react-native';
import { ModelRegistry } from 'react-native-litert-lm';
import type { AIModelMetadata, ModelDownloadStatus } from './types';

const CUSTOM_MODELS_KEY = 'ai_custom_models';

/**
 * Supported model catalog.
 * Metadata aligned with Gallery allowlist schema and LiteRT-LM capabilities API.
 * See: gallery/model_allowlists/1_0_15.json, gallery/model_allowlists/ios_1_0_0.json
 *
 * Design intent: prefer small, gallery-verified models that run reliably on
 * mid-range edge devices (≤ 6 GB device RAM). Larger models (≥ 4B, > 12 GB)
 * are included only if they are present in the official gallery allowlist.
 */
export const SUPPORTED_MODELS: AIModelMetadata[] = [
  {
    id: 'qwen-2.5-1.5b',
    name: 'Qwen 2.5 1.5B Instruct',
    description:
      'Compact multilingual model from Alibaba. Reliable JSON output. Good for SMS/transaction parsing. Text only.',
    // Source: gallery/model_allowlists/1_0_15.json — litert-community/Qwen2.5-1.5B-Instruct (verified public)
    url: 'https://huggingface.co/litert-community/Qwen2.5-1.5B-Instruct/resolve/main/Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm',
    sizeBytes: 1597931520,
    parameters: '1.5B',
    quantization: 'Q8',
    filename: 'Qwen2.5-1.5B-Instruct_multi-prefill-seq_q8_ekv4096.litertlm',
    minDeviceMemoryGb: 6,
    defaultConfig: {
      topK: 20,
      topP: 0.8,
      temperature: 0.7,
      maxTokens: 2048,
      accelerators: 'gpu,npu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
  {
    id: 'gemma-3-1b-it',
    name: 'Gemma 3 1B Instruct',
    description:
      'Ultra-compact Google Gemma 3 model. Extremely fast execution. Requires Hugging Face authentication token to download.',
    // Source: gallery/model_allowlists/1_0_15.json — litert-community/Gemma3-1B-IT (gated repo)
    url: 'https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4.litertlm',
    sizeBytes: 584417280,
    parameters: '1B',
    quantization: 'INT4',
    filename: 'gemma3-1b-it-int4.litertlm',
    minDeviceMemoryGb: 3,
    defaultConfig: {
      topK: 64,
      topP: 0.95,
      temperature: 1.0,
      maxTokens: 2048,
      accelerators: 'gpu,npu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
  {
    id: 'gemma-3n-e2b-it-int4',
    name: 'Gemma 3n E2B IT INT4',
    description:
      'Highly optimized Gemma 3n 2B model quantized to INT4. Extremely fast execution on mobile devices, public hosting on litert.dev (no token required).',
    // Source: react-native-litert-lm index.ts GEMMA_3N_E2B_IT_INT4
    url: 'https://litert.dev/gemma-3n-E2B-it-int4.litertlm',
    sizeBytes: 1347012576,
    parameters: '2B',
    quantization: 'INT4',
    filename: 'gemma-3n-E2B-it-int4.litertlm',
    minDeviceMemoryGb: 4,
    capabilities: ['llm_thinking', 'speculative_decoding'],
    supportsImage: true,
    supportsAudio: true,
    defaultConfig: {
      topK: 64,
      topP: 0.95,
      temperature: 1.0,
      maxTokens: 2048,
      accelerators: 'gpu,npu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
  {
    id: 'deepseek-r1-distill-qwen-1.5b',
    name: 'DeepSeek R1 Distill 1.5B',
    description:
      'DeepSeek R1 reasoning distilled to 1.5B. Strong chain-of-thought reasoning at edge scale. Text only.',
    // Source: gallery/model_allowlists/1_0_15.json — litert-community/DeepSeek-R1-Distill-Qwen-1.5B (verified public)
    url: 'https://huggingface.co/litert-community/DeepSeek-R1-Distill-Qwen-1.5B/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B_multi-prefill-seq_q8_ekv4096.litertlm',
    sizeBytes: 1833451520,
    parameters: '1.5B',
    quantization: 'Q8',
    filename: 'DeepSeek-R1-Distill-Qwen-1.5B_multi-prefill-seq_q8_ekv4096.litertlm',
    minDeviceMemoryGb: 6,
    defaultConfig: {
      topK: 64,
      topP: 0.95,
      temperature: 1.0,
      maxTokens: 2048,
      accelerators: 'gpu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
  {
    id: 'phi-4-mini-instruct',
    name: 'Phi-4 Mini Instruct',
    description:
      'Microsoft Phi-4 Mini 3.8B — strong reasoning and structured-output quality. Text only.',
    // Source: gallery/model_allowlists/1_0_9.json — litert-community/Phi-4-mini-instruct (verified public)
    url: 'https://huggingface.co/litert-community/Phi-4-mini-instruct/resolve/main/Phi-4-mini-instruct_multi-prefill-seq_q8_ekv4096.litertlm',
    sizeBytes: 3910090752,
    parameters: '3.8B',
    quantization: 'Q8',
    filename: 'Phi-4-mini-instruct_multi-prefill-seq_q8_ekv4096.litertlm',
    minDeviceMemoryGb: 6,
    defaultConfig: {
      topK: 64,
      topP: 0.95,
      temperature: 1.0,
      maxTokens: 2048,
      accelerators: 'gpu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
  {
    id: 'gemma-4-e2b-it',
    name: 'Gemma 4 E2B Instruct',
    description:
      'Latest Gemma 4, 2B parameters with multimodal (image + audio) support and 32K context.',
    // Source: gallery/model_allowlists/1_0_15.json — litert-community/gemma-4-E2B-it-litert-lm (verified public)
    url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm',
    sizeBytes: 2588147712,
    parameters: '2B',
    quantization: 'INT8',
    filename: 'gemma-4-E2B-it.litertlm',
    minDeviceMemoryGb: 8,
    capabilities: ['llm_thinking', 'speculative_decoding'],
    supportsImage: true,
    supportsAudio: true,
    defaultConfig: {
      topK: 64,
      topP: 0.95,
      temperature: 1.0,
      maxTokens: 2048,
      accelerators: 'gpu,npu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
  {
    id: 'gemma-4-e4b-it',
    name: 'Gemma 4 E4B Instruct',
    description: '4B parameter Gemma 4, higher quality multimodal model. Needs 12 GB+ device RAM.',
    // Source: gallery/model_allowlists/1_0_15.json — litert-community/gemma-4-E4B-it-litert-lm (verified public)
    url: 'https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it.litertlm',
    sizeBytes: 3659530240,
    parameters: '4B',
    quantization: 'INT8',
    filename: 'gemma-4-E4B-it.litertlm',
    minDeviceMemoryGb: 12,
    capabilities: ['llm_thinking', 'speculative_decoding'],
    supportsImage: true,
    supportsAudio: true,
    defaultConfig: {
      topK: 64,
      topP: 0.95,
      temperature: 1.0,
      maxTokens: 2048,
      accelerators: 'gpu,npu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
];

export class ModelManagementService {
  private activeDownloads = new Map<string, boolean>();
  private progressListeners = new Set<
    (modelId: string, progress: number, isComplete: boolean) => void
  >();

  addListener(listener: (modelId: string, progress: number, isComplete: boolean) => void) {
    this.progressListeners.add(listener);
  }

  removeListener(listener: (modelId: string, progress: number, isComplete: boolean) => void) {
    this.progressListeners.delete(listener);
  }

  private emitProgress(modelId: string, progress: number, isComplete: boolean) {
    this.progressListeners.forEach(listener => listener(modelId, progress, isComplete));
  }

  isDownloading(modelId: string): boolean {
    return this.activeDownloads.has(modelId);
  }

  getCustomModels(): AIModelMetadata[] {
    const stored = storage.getString(CUSTOM_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  getAllModels(): AIModelMetadata[] {
    const models = [...SUPPORTED_MODELS, ...this.getCustomModels()];
    const supportedPlatform =
      Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
    return models.filter(
      m =>
        !m.supportedPlatforms ||
        (supportedPlatform !== null && m.supportedPlatforms.includes(supportedPlatform)),
    );
  }

  async getRecommendedModel(): Promise<AIModelMetadata> {
    const allModels = this.getAllModels();
    const defaultId = AppConfig.defaults.defaultAiModelId;

    const defaultModel = allModels.find(m => m.id === defaultId);
    if (defaultModel) {
      const status = await this.getDownloadStatus(defaultModel.id);
      if (status.isDownloaded) return defaultModel;
    }

    const sortedBySize = [...allModels].sort((a, b) => a.sizeBytes - b.sizeBytes);
    for (const model of sortedBySize) {
      const status = await this.getDownloadStatus(model.id);
      if (status.isDownloaded) return model;
    }

    return defaultModel ?? allModels[0];
  }

  async registerCustomModel(model: Omit<AIModelMetadata, 'isCustom'>): Promise<void> {
    const customModels = this.getCustomModels();
    const newModel = { ...model, isCustom: true };

    const index = customModels.findIndex(m => m.id === model.id);
    if (index !== -1) {
      customModels[index] = newModel;
    } else {
      customModels.push(newModel);
    }

    storage.set(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
  }

  async getDownloadStatus(modelId: string): Promise<ModelDownloadStatus> {
    const model = this.getAllModels().find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not supported`);

    const isDownloaded = ModelRegistry.isCached(model.url);

    return {
      modelId,
      isDownloaded,
      progress: isDownloaded ? 1 : 0,
    };
  }

  async downloadModel(modelId: string, onProgress?: (progress: number) => void): Promise<string> {
    const model = this.getAllModels().find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not supported`);

    if (ModelRegistry.isCached(model.url)) {
      return ModelRegistry.getFilePath(model.url);
    }

    if (this.activeDownloads.has(modelId)) {
      logger.info(`Download already in progress for ${modelId}`);
      return '';
    }

    const headers: Record<string, string> = {};
    const hfToken = process.env.HF_TOKEN ?? process.env.EXPO_PUBLIC_HF_TOKEN;
    if (hfToken && model.url.includes('huggingface.co')) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    this.activeDownloads.set(modelId, true);
    this.emitProgress(modelId, 0, false);

    try {
      const result = await ModelRegistry.resolveModel(model.url, {
        headers,
        onProgress: progress => {
          onProgress?.(progress);
          this.emitProgress(modelId, progress, false);
        },
      });

      this.activeDownloads.delete(modelId);
      this.emitProgress(modelId, 1, true);
      return result;
    } catch (e) {
      this.activeDownloads.delete(modelId);
      this.emitProgress(modelId, 0, false);
      logger.error(`Failed to download model ${modelId}`, e);
      throw e;
    }
  }

  async cancelDownload(modelId: string): Promise<void> {
    this.activeDownloads.delete(modelId);
    this.emitProgress(modelId, 0, false);
  }

  async deleteModel(modelId: string): Promise<void> {
    const model = this.getAllModels().find(m => m.id === modelId);
    if (!model) return;

    try {
      ModelRegistry.deleteFile(model.url);
    } catch (e) {
      logger.error(`Failed to delete model ${modelId}`, e);
    }

    if (model.isCustom) {
      const customModels = this.getCustomModels().filter(m => m.id !== modelId);
      storage.set(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
    }
  }
}

export const modelManagementService = new ModelManagementService();
