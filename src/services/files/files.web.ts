import type { FileOperations } from '@/src/services/files/fileContracts';

function unsupported(): never {
  throw new Error(
    'Local filesystem access is unavailable in the browser. Use browser file selection or downloads.',
  );
}

/** Browser imports/downloads use bytes and blobs, never fabricated native paths. */
export const files: FileOperations = {
  async writeContent() {
    return unsupported();
  },
  async readBase64() {
    return unsupported();
  },
  async readBytes() {
    return unsupported();
  },
  async listDirectory() {
    return unsupported();
  },
  async directoryExists() {
    return false;
  },
  async deleteFile() {
    return unsupported();
  },
  async deleteDirectory() {
    return unsupported();
  },
  async ensureDirectory() {
    return unsupported();
  },
  async exists() {
    return false;
  },
  async copy() {
    return unsupported();
  },
  async getInfo(uri) {
    return { exists: false, uri };
  },
  get cache(): string {
    return unsupported();
  },
  get document(): string {
    return unsupported();
  },
  get bundle(): string {
    return unsupported();
  },
};
