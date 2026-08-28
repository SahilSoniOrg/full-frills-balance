import { zipSync } from 'fflate';
import { compression } from '../compression.web';

describe('web compression', () => {
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

  it('returns null when the archive has no importable files', async () => {
    const archive = zipSync({
      '__MACOSX/._backup.json': new Uint8Array([1]),
      'folder/': new Uint8Array(),
    });

    await expect(compression.extractFirstFile(archive)).resolves.toBeNull();
  });
});
