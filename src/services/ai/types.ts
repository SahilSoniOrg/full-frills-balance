export interface AIModelMetadata {
  id: string;
  name: string;
  description: string;
  url: string; // URL to download the GGUF file
  sizeBytes: number;
  parameters: string; // e.g., "0.5B", "1B"
  quantization: string; // e.g., "Q4_K_M"
  filename: string;
  isCustom?: boolean;
}

export interface ModelDownloadStatus {
  modelId: string;
  isDownloaded: boolean;
  progress: number;
  localPath?: string;
}

export interface AIProvider {
  initialize(modelPath: string): Promise<void>;
  generate(prompt: string, options?: { timeout?: number }): Promise<string>;
  dispose(): Promise<void>;
}
