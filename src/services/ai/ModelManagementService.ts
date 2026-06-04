import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type { AIModelMetadata, ModelDownloadStatus } from './types';

const MODEL_DIR = `${Paths.document.uri}models/`;
const STORAGE_PREFIX = 'ai_model_status_';
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
      maxTokens: 1024,
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
      maxTokens: 1024,
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
      maxTokens: 1024,
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
      maxTokens: 1024,
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
      maxTokens: 1024,
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
      maxTokens: 1024,
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
      maxTokens: 1024,
      accelerators: 'gpu,npu,cpu',
      systemPrompt:
        'You are a high-precision financial transaction parser. Output valid JSON only.',
    },
  },
];

export class ModelManagementService {
  private activeDownloads = new Map<string, FileSystemLegacy.DownloadResumable>();
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

  async ensureModelDirectory(): Promise<void> {
    const dir = new Directory(MODEL_DIR);
    if (!dir.exists) {
      dir.create();
    } else {
      // Background cleanup of orphaned/partial download files
      this.cleanupOrphanedFiles().catch(() => {});
    }
  }

  async cleanupOrphanedFiles(): Promise<void> {
    try {
      const allModels = this.getAllModels();
      const activeDownloadIds = Array.from(this.activeDownloads.keys());
      const activeFilenames = new Set(
        activeDownloadIds
          .map(id => allModels.find(m => m.id === id)?.filename)
          .filter((f): f is string => !!f),
      );

      const files = await FileSystemLegacy.readDirectoryAsync(MODEL_DIR);
      for (const f of files) {
        // Find if this file is associated with any supported or custom model
        const isAssociated = allModels.some(m => f.startsWith(m.filename));
        // Find if this file belongs to an active download
        const isActive = allModels.some(
          m => f.startsWith(m.filename) && activeFilenames.has(m.filename),
        );

        if (!isAssociated && !isActive) {
          logger.info(`[ModelManagementService] Cleaning up orphaned file: ${f}`);
          await FileSystemLegacy.deleteAsync(`${MODEL_DIR}${f}`, { idempotent: true });
        }
      }
    } catch (e) {
      logger.warn('[ModelManagementService] Failed to clean up orphaned files:', e as any);
    }
  }

  getCustomModels(): AIModelMetadata[] {
    const stored = storage.getString(CUSTOM_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  getAllModels(): AIModelMetadata[] {
    const models = [...SUPPORTED_MODELS, ...this.getCustomModels()];
    return models.filter(
      m => !m.supportedPlatforms || m.supportedPlatforms.includes(Platform.OS as any),
    );
  }

  /**
   * Returns the recommended model for the device.
   * Prefers qwen-2.5-1.5b (smallest confirmed-public model at 1.5 GB, 6 GB RAM).
   * Falls back to any other downloaded model (smallest first), or the default for download prompt.
   */
  async getRecommendedModel(): Promise<AIModelMetadata> {
    const allModels = this.getAllModels();
    const defaultId = AppConfig.defaults.defaultAiModelId;

    // Prefer default if downloaded
    const defaultModel = allModels.find(m => m.id === defaultId);
    if (defaultModel) {
      const status = await this.getDownloadStatus(defaultModel.id);
      if (status.isDownloaded) return defaultModel;
    }

    // Otherwise return any downloaded model, preferring smallest
    const sortedBySize = [...allModels].sort((a, b) => a.sizeBytes - b.sizeBytes);
    for (const model of sortedBySize) {
      const status = await this.getDownloadStatus(model.id);
      if (status.isDownloaded) return model;
    }

    // No model downloaded — return the default anyway for download prompt
    return defaultModel ?? allModels[0];
  }

  async registerCustomModel(model: Omit<AIModelMetadata, 'isCustom'>): Promise<void> {
    const customModels = this.getCustomModels();
    const newModel = { ...model, isCustom: true };

    // Replace if exists, otherwise add
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

    const localPath = `${MODEL_DIR}${model.filename}`;
    const file = new File(localPath);

    const statusStr = storage.getString(`${STORAGE_PREFIX}${modelId}`);
    const persistedStatus = statusStr ? JSON.parse(statusStr) : null;

    return {
      modelId,
      isDownloaded: file.exists,
      progress: file.exists ? 1 : persistedStatus?.progress || 0,
      localPath: file.exists ? localPath : undefined,
      bytesWritten: persistedStatus?.bytesWritten,
    };
  }

  async downloadModel(modelId: string, onProgress?: (progress: number) => void): Promise<string> {
    await this.ensureModelDirectory();
    const model = this.getAllModels().find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not supported`);

    const localPath = `${MODEL_DIR}${model.filename}`;
    const file = new File(localPath);

    if (file.exists) {
      return localPath;
    }

    if (this.activeDownloads.has(modelId)) {
      logger.info(`Download already in progress for ${modelId}`);
      // If there's an ongoing request, we don't return the path immediately,
      // but the caller might just want to wait for it. We'll just return undefined
      // or we could return a stored Promise. For now, we return empty string.
      return '';
    }

    const headers: Record<string, string> = {};
    const hfToken = process.env.EXPO_PUBLIC_HF_TOKEN;
    if (hfToken && model.url.includes('huggingface.co')) {
      headers['Authorization'] = `Bearer ${hfToken}`;
    }

    // Downloading still uses legacy API for resumable downloads
    const downloadResumable = FileSystemLegacy.createDownloadResumable(
      model.url,
      localPath,
      { headers },
      downloadProgress => {
        const progress =
          downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
        this.emitProgress(modelId, progress, false);
        this.saveStatus(modelId, {
          isDownloaded: false,
          progress,
          bytesWritten: downloadProgress.totalBytesWritten,
        });
      },
    );

    this.activeDownloads.set(modelId, downloadResumable);

    try {
      const result = await downloadResumable.downloadAsync();
      if (!result) throw new Error('Download failed');

      this.saveStatus(modelId, { isDownloaded: true, progress: 1 });
      this.activeDownloads.delete(modelId);
      this.emitProgress(modelId, 1, true);
      return result.uri;
    } catch (e) {
      this.activeDownloads.delete(modelId);
      logger.error(`Failed to download model ${modelId}`, e);
      throw e;
    }
  }

  async cancelDownload(modelId: string): Promise<void> {
    const resumable = this.activeDownloads.get(modelId);
    if (resumable) {
      try {
        await resumable.pauseAsync();
      } catch (e) {
        logger.warn(`Failed to pause download for ${modelId}:`, e as unknown as any);
      }
      this.activeDownloads.delete(modelId);
    }

    // Cleanup partial file and status
    const model = this.getAllModels().find(m => m.id === modelId);
    if (model) {
      const localPath = `${MODEL_DIR}${model.filename}`;
      const file = new File(localPath);
      if (file.exists) {
        file.delete();
      }
    }
    storage.remove(`${STORAGE_PREFIX}${modelId}`);
    this.emitProgress(modelId, 0, false);
  }

  private saveStatus(modelId: string, status: Partial<ModelDownloadStatus>): void {
    const currentStatus = storage.getString(`${STORAGE_PREFIX}${modelId}`);
    const updated = {
      ...(currentStatus ? JSON.parse(currentStatus) : {}),
      ...status,
    };
    storage.set(`${STORAGE_PREFIX}${modelId}`, JSON.stringify(updated));
  }

  async deleteModel(modelId: string): Promise<void> {
    const model = this.getAllModels().find(m => m.id === modelId);
    if (!model) return;

    try {
      // Find all files that start with the model's filename to clean up compilation caches
      const files = await FileSystemLegacy.readDirectoryAsync(MODEL_DIR);
      const associatedFiles = files.filter(f => f.startsWith(model.filename));

      for (const f of associatedFiles) {
        await FileSystemLegacy.deleteAsync(`${MODEL_DIR}${f}`, { idempotent: true });
      }
    } catch (e) {
      logger.error(`Failed to clean up cache files for ${modelId}`, e as any);
      // Fallback to deleting just the main file if directory read fails
      const localPath = `${MODEL_DIR}${model.filename}`;
      const file = new File(localPath);
      if (file.exists) {
        file.delete();
      }
    }

    storage.remove(`${STORAGE_PREFIX}${modelId}`);

    if (model.isCustom) {
      const customModels = this.getCustomModels().filter(m => m.id !== modelId);
      storage.set(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
    }
  }
}

export const modelManagementService = new ModelManagementService();
