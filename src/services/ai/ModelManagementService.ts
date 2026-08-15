import { Platform } from 'react-native';
import { ModelRegistry } from 'react-native-litert-lm';
import type { AIModelMetadata, ModelDownloadStatus } from './types';

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

/**
 * Catalog + cache status for on-device models.
 * Model files are acquired via LiteRT (`ModelRegistry` / provider load), not this service.
 */
export class ModelManagementService {
  getAllModels(): AIModelMetadata[] {
    const supportedPlatform =
      Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
    return SUPPORTED_MODELS.filter(
      m =>
        !m.supportedPlatforms ||
        (supportedPlatform !== null && m.supportedPlatforms.includes(supportedPlatform)),
    );
  }

  async getDownloadStatus(modelId: string): Promise<ModelDownloadStatus> {
    const model = this.getAllModels().find(m => m.id === modelId);
    if (!model) throw new Error(`Model ${modelId} not supported`);

    let isDownloaded = false;
    try {
      isDownloaded = ModelRegistry.isCached(model.url);
    } catch {
      isDownloaded = false;
    }

    return {
      modelId,
      isDownloaded,
      progress: isDownloaded ? 1 : 0,
    };
  }
}

export const modelManagementService = new ModelManagementService();
