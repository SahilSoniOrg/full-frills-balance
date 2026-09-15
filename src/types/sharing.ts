export enum ShareFormat {
  TEXT = 'TEXT',
  CSV = 'CSV',
  MARKDOWN = 'MARKDOWN',
  ZIP = 'ZIP',
}

export interface ShareProvider {
  id: string;
  title: string;
  filename: string;
  mimeType?: string;
  fileExtension?: string;
  supportedFormats?: ShareFormat[];
  getContent(format: ShareFormat): string | Uint8Array | Promise<string | Uint8Array>;
}
