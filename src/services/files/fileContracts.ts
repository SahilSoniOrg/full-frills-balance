export interface FileEntry {
  uri: string;
  name: string;
  isDirectory: boolean;
}

export interface FileInfo {
  exists: boolean;
  uri: string;
  isDirectory?: boolean;
  size?: number;
}

export interface FileOperations {
  writeContent(
    uri: string,
    content: string | Uint8Array,
    encoding?: 'utf8' | 'base64',
  ): Promise<string>;
  readBase64(uri: string): Promise<string>;
  readBytes(uri: string): Promise<Uint8Array>;
  listDirectory(uri: string): Promise<FileEntry[]>;
  directoryExists(uri: string): Promise<boolean>;
  deleteFile(uri: string): Promise<void>;
  deleteDirectory(uri: string): Promise<void>;
  ensureDirectory(uri: string): Promise<void>;
  exists(uri: string): Promise<boolean>;
  copy(from: string, to: string): Promise<void>;
  getInfo(uri: string): Promise<FileInfo>;
  readonly cache: string;
  readonly document: string;
  readonly bundle: string;
}
