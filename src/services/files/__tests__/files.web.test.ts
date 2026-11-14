import { files } from '../files.web';

describe('browser filesystem limitations', () => {
  it('rejects local reads and writes instead of succeeding with empty data', async () => {
    await expect(files.writeContent('backup.json', 'important data')).rejects.toThrow(
      'unavailable in the browser',
    );
    await expect(files.readBytes('backup.json')).rejects.toThrow('unavailable in the browser');
    await expect(files.readBase64('backup.json')).rejects.toThrow('unavailable in the browser');
  });
});
