export interface AIModelMetadata {
  id: string;
  name: string;
  description: string;
  url: string;
  sizeBytes: number;
  parameters: string; // e.g., "2B", "1B"
  quantization: string; // e.g., "INT8", "Q4"
  filename: string;
  isCustom?: boolean;
  /** Minimum device RAM in GB required to load this model */
  minDeviceMemoryGb?: number;
  /** Model capabilities: e.g., 'speculative_decoding', 'llm_thinking' */
  capabilities?: string[];
  /** Whether this model supports image input */
  supportsImage?: boolean;
  /** Whether this model supports audio input */
  supportsAudio?: boolean;
  /** Supported platforms for this model */
  supportedPlatforms?: ('ios' | 'android')[];
  /** Default inference config recommended for this model */
  defaultConfig?: ModelDefaultConfig;
}

export interface ModelDefaultConfig {
  topK?: number;
  topP?: number;
  temperature?: number;
  maxTokens?: number;
  /** Preferred backend order, e.g. 'gpu,cpu' */
  accelerators?: string;
  systemPrompt?: string;
}

export interface ModelDownloadStatus {
  modelId: string;
  isDownloaded: boolean;
  progress: number;
}

/** Performance stats from the last inference call */
export interface InferenceStats {
  tokensPerSecond: number;
  timeToFirstTokenMs: number;
  completionTokens: number;
  totalDurationMs: number;
}

export interface AIGenerateOptions {
  timeout?: number;
  /** If true, reset conversation context before this prompt (default: true) */
  resetContext?: boolean;
  /** Optional system prompt override to customize engine behavior */
  systemPrompt?: string;
}

export interface GenerateResult {
  text: string;
  stats?: InferenceStats;
}

export interface LLMEngine {
  generate(prompt: string, options?: AIGenerateOptions): Promise<GenerateResult>;
  generateStream?(
    prompt: string,
    onToken: (token: string, done: boolean) => void,
    options?: AIGenerateOptions,
  ): Promise<void>;
  dispose(): Promise<void>;
  getMemorySummary?(): any;
}

export interface DynamicLLMEngine extends LLMEngine {
  switchModel(modelId: string): Promise<void>;
  getLoadedModelId(): string | null;
}
