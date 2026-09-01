import { importRegistry } from '@/src/services/import';
import { resolveRestorePlugin } from '../pickRestoreSource';
import type { ImportFileContext, ImportPlugin } from '@/src/services/import/types';

jest.mock('@/src/services/import', () => ({
  importRegistry: {
    detect: jest.fn(),
    get: jest.fn(),
  },
}));

const native = { id: 'native' } as ImportPlugin;
const ivy = { id: 'ivy' } as ImportPlugin;
const context = {
  uri: 'file://backup.json',
  name: 'backup.json',
  rawBytes: new Uint8Array(),
} as ImportFileContext;

describe('resolveRestorePlugin', () => {
  const detect = importRegistry.detect as jest.Mock;

  beforeEach(() => {
    detect.mockReset();
  });

  it('returns the detected plugin when it matches the selection', () => {
    detect.mockReturnValue(native);
    expect(resolveRestorePlugin(context, 'native')).toBe(native);
  });

  it('rejects a selection that does not match the backup', () => {
    detect.mockReturnValue(ivy);
    expect(() => resolveRestorePlugin(context, 'native')).toThrow(
      'Selected restore format does not match this backup',
    );
  });

  it('fails closed when no plugin detects the file', () => {
    detect.mockReturnValue(undefined);
    expect(() => resolveRestorePlugin(context, 'native')).toThrow(
      'Could not determine restore file format',
    );
  });
});
