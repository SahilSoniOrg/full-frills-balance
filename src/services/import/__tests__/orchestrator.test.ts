import { extractIfZip } from '../orchestrator';
import { compression } from '@/src/utils/compression';
import { logger } from '@/src/utils/logger';

jest.mock('@/src/utils/compression', () => ({
  compression: {
    extractFirstFile: jest.fn(),
  },
}));

jest.mock('@/src/utils/logger');

describe('ImportOrchestrator - extractIfZip', () => {
  const zipMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const normalJson = new Uint8Array(Buffer.from('{"test":true}'));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return raw bytes if not a ZIP file', async () => {
    const result = await extractIfZip(normalJson);
    expect(result).toBe(normalJson);
    expect(compression.extractFirstFile).not.toHaveBeenCalled();
  });

  it('should extract first file if valid ZIP', async () => {
    const extractedContent = new Uint8Array([1, 2, 3]);
    (compression.extractFirstFile as jest.Mock).mockResolvedValue({
      name: 'backup.json',
      bytes: extractedContent,
    });

    const result = await extractIfZip(zipMagic);
    expect(result).toBe(extractedContent);
    expect(compression.extractFirstFile).toHaveBeenCalledWith(zipMagic);
  });

  it('should fall back to raw bytes if extraction returns null', async () => {
    (compression.extractFirstFile as jest.Mock).mockResolvedValue(null);

    const result = await extractIfZip(zipMagic);
    expect(result).toBe(zipMagic);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No valid files in ZIP'));
  });

  it('should fall back to raw bytes if extraction fails', async () => {
    (compression.extractFirstFile as jest.Mock).mockRejectedValue(new Error('Zip fail'));

    const result = await extractIfZip(zipMagic);
    expect(result).toBe(zipMagic);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ZIP extraction failed'),
      expect.any(Error),
    );
  });
});
