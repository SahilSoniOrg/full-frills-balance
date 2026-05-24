import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { storage } from '@/src/utils/storage';
import { AIModelMetadata, ModelDownloadStatus } from './types';
import { logger } from '@/src/utils/logger';

const MODEL_DIR = `${Paths.document.uri}models/`;
const STORAGE_PREFIX = 'ai_model_status_';
const CUSTOM_MODELS_KEY = 'ai_custom_models';

export const SUPPORTED_MODELS: AIModelMetadata[] = [
  {
    id: 'qwen-2.5-0.5b',
    name: 'Qwen 2.5 0.5B',
    description: 'Ultra-lightweight from Alibaba. Extremely fast, decent accuracy.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    sizeBytes: 398000000,
    parameters: '0.5B',
    quantization: 'Q4_K_M',
    filename: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen-2.5-1.5b',
    name: 'Qwen 2.5 1.5B',
    description: 'Bigger brother of 0.5B. Significantly smarter, still fast.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 980000000,
    parameters: '1.5B',
    quantization: 'Q4_K_M',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'deepseek-r1-1.5b',
    name: 'DeepSeek R1 Distill 1.5B',
    description: 'Reasoning model distilled from DeepSeek-R1. High logical accuracy.',
    url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    sizeBytes: 1100000000,
    parameters: '1.5B',
    quantization: 'Q4_K_M',
    filename: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
  },
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M IT',
    description: 'Ultra-tiny but capable model from Hugging Face. Very fast on low-end hardware.',
    url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf',
    sizeBytes: 210000000,
    parameters: '360M',
    quantization: 'Q4_K_M',
    filename: 'smollm2-360m-instruct-q4_k_m.gguf',
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    description: "Meta's mobile-optimized model. Excellent reasoning.",
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeBytes: 750000000,
    parameters: '1B',
    quantization: 'Q4_K_M',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    description: 'High-performance Meta model. Needs 4GB+ RAM.',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2000000000,
    parameters: '3B',
    quantization: 'Q4_K_M',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'gemma-3-1b',
    name: 'Gemma 3 1B IT (Unsloth)',
    description: "Google's brand new lightweight model, optimized by Unsloth for high performance.",
    url: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-UD-Q4_K_XL.gguf',
    sizeBytes: 807000000,
    parameters: '1B',
    quantization: 'UD-Q4_K_XL',
    filename: 'gemma-3-1b-it-UD-Q4_K_XL.gguf',
  },
  {
    id: 'gemma-2-2b',
    name: 'Gemma 2 2B',
    description: "Google's best small model. Very high accuracy.",
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1600000000,
    parameters: '2B',
    quantization: 'Q4_K_M',
    filename: 'gemma-2-2b-it-Q4_K_M.gguf',
  },
  {
    id: 'gemma-2-9b',
    name: 'Gemma 2 9B',
    description: 'Powerhouse. Desktop-class accuracy. Needs 8GB+ RAM.',
    url: 'https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf',
    sizeBytes: 5400000000,
    parameters: '9B',
    quantization: 'Q4_K_M',
    filename: 'gemma-2-9b-it-Q4_K_M.gguf',
  },
];

export class ModelManagementService {
  async ensureModelDirectory(): Promise<void> {
    const dir = new Directory(MODEL_DIR);
    if (!dir.exists) {
      dir.create();
    }
  }

  getCustomModels(): AIModelMetadata[] {
    const stored = storage.getString(CUSTOM_MODELS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  getAllModels(): AIModelMetadata[] {
    return [...SUPPORTED_MODELS, ...this.getCustomModels()];
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

    // Downloading still uses legacy API for resumable downloads
    const downloadResumable = FileSystemLegacy.createDownloadResumable(
      model.url,
      localPath,
      {},
      downloadProgress => {
        const progress =
          downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
        this.saveStatus(modelId, { isDownloaded: false, progress });
      },
    );

    try {
      const result = await downloadResumable.downloadAsync();
      if (!result) throw new Error('Download failed');

      this.saveStatus(modelId, { isDownloaded: true, progress: 1 });
      return result.uri;
    } catch (e) {
      logger.error(`Failed to download model ${modelId}`, e);
      throw e;
    }
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

    const localPath = `${MODEL_DIR}${model.filename}`;
    const file = new File(localPath);
    if (file.exists) {
      file.delete();
    }
    storage.remove(`${STORAGE_PREFIX}${modelId}`);

    if (model.isCustom) {
      const customModels = this.getCustomModels().filter(m => m.id !== modelId);
      storage.set(CUSTOM_MODELS_KEY, JSON.stringify(customModels));
    }
  }
}

export const modelManagementService = new ModelManagementService();
