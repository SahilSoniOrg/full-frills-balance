import { zipSync } from 'fflate';
import { toByteArray } from 'base64-js';
import { compression } from '@/src/services/files/compression.web';

describe('web compression', () => {
  it('round-trips a generated backup and releases its download URL', async () => {
    const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const revoke = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:backup',
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    try {
      const payload = '{"workplace":"日常","amount":1.001}';
      const archive = await compression.createZipArchive('backup', { 'backup.json': payload });
      const extracted = await compression.extractFirstFile(toByteArray(archive.base64));
      expect(extracted?.name).toBe('backup.json');
      expect(Buffer.from(extracted!.bytes).toString('utf8')).toBe(payload);
      await archive.cleanup();
      expect(revoke).toHaveBeenCalledWith('blob:backup');
    } finally {
      if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('extracts a compressed backup entry', async () => {
    const backup = new Uint8Array(Buffer.from('{"version":"1.4.0"}'));
    const archive = zipSync({ 'backup.json': backup });

    await expect(compression.extractFirstFile(archive)).resolves.toEqual({
      name: 'backup.json',
      bytes: backup,
    });
  });

  it('skips macOS metadata and directories', async () => {
    const backup = new Uint8Array(Buffer.from('{}'));
    const archive = zipSync({
      '__MACOSX/._backup.json': new Uint8Array([1]),
      'folder/': new Uint8Array(),
      'backup.json': backup,
    });

    await expect(compression.extractFirstFile(archive)).resolves.toEqual({
      name: 'backup.json',
      bytes: backup,
    });
  });

  it('prefers a JSON payload over other archive files', async () => {
    const payload = new Uint8Array(Buffer.from('{"version":"1.4.0"}'));
    const archive = zipSync({
      'README.txt': new Uint8Array(Buffer.from('notes')),
      'backup.json': payload,
    });

    await expect(compression.extractFirstFile(archive)).resolves.toEqual({
      name: 'backup.json',
      bytes: payload,
    });
  });

  it('returns null when the archive has no importable files', async () => {
    const archive = zipSync({
      '__MACOSX/._backup.json': new Uint8Array([1]),
      'folder/': new Uint8Array(),
    });

    await expect(compression.extractFirstFile(archive)).resolves.toBeNull();
  });
});
