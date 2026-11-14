export interface ZipResult {
  uri: string;
  base64: string;
  cleanup(): Promise<void>;
}

export interface CompressionOperations {
  createZipArchive(name: string, files: Record<string, string | Uint8Array>): Promise<ZipResult>;
  extractFirstFile(
    bytes: Uint8Array,
    options?: { filterMac?: boolean },
  ): Promise<{ bytes: Uint8Array; name: string } | null>;
}
