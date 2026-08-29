import {
  isLiteRtModelArtifact,
  joinFsUri,
  purgeLocalAiCaches,
  purgeLocalAiCachesOnce,
  resetLocalAiCachePurgeForTests,
  type LocalAiCacheFileOps,
} from '@/src/features/app/purgeLocalAiCaches';

function createOps(overrides: Partial<LocalAiCacheFileOps> = {}): LocalAiCacheFileOps {
  return {
    cache: 'file:///cache/',
    document: 'file:///documents/',
    listDirectory: jest.fn().mockResolvedValue([]),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    deleteDirectory: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('purgeLocalAiCaches', () => {
  afterEach(() => {
    resetLocalAiCachePurgeForTests();
  });

  it('joins cache and document URIs without duplicating slashes', () => {
    expect(joinFsUri('file:///cache/', 'litert_models')).toBe('file:///cache/litert_models');
    expect(joinFsUri('file:///documents', 'models', 'qwen.litertlm')).toBe(
      'file:///documents/models/qwen.litertlm',
    );
  });

  it('recognizes LiteRT weights and in-progress downloads', () => {
    expect(isLiteRtModelArtifact('Qwen2.5-1.5B.litertlm')).toBe(true);
    expect(isLiteRtModelArtifact('Qwen2.5-1.5B.litertlm.tmp')).toBe(true);
    expect(isLiteRtModelArtifact('notes.txt')).toBe(false);
  });

  it('removes the iOS litert_models directory and loose cache artifacts', async () => {
    const ops = createOps({
      listDirectory: jest.fn(async (uri: string) => {
        if (uri === 'file:///cache/') {
          return [
            { name: 'Qwen.litertlm', uri: 'file:///cache/Qwen.litertlm' },
            { name: 'other.bin', uri: 'file:///cache/other.bin' },
          ];
        }
        return [];
      }),
    });

    await purgeLocalAiCaches(ops);

    expect(ops.deleteDirectory).toHaveBeenCalledWith('file:///cache/litert_models');
    expect(ops.deleteFile).toHaveBeenCalledWith('file:///cache/Qwen.litertlm');
    expect(ops.deleteFile).not.toHaveBeenCalledWith('file:///cache/other.bin');
  });

  it('deletes only LiteRT files under Android files/models', async () => {
    const androidModels = 'file:///documents/models';
    const ops = createOps({
      listDirectory: jest.fn(async (uri: string) => {
        if (uri === androidModels) {
          return [
            { name: 'gemma.litertlm' },
            { name: 'gemma.litertlm.tmp' },
            { name: 'keep-me.json' },
          ];
        }
        return [];
      }),
    });

    await purgeLocalAiCaches(ops);

    expect(ops.deleteFile).toHaveBeenCalledWith(`${androidModels}/gemma.litertlm`);
    expect(ops.deleteFile).toHaveBeenCalledWith(`${androidModels}/gemma.litertlm.tmp`);
    expect(ops.deleteFile).not.toHaveBeenCalledWith(`${androidModels}/keep-me.json`);
    expect(ops.deleteDirectory).not.toHaveBeenCalledWith(androidModels);
  });

  it('drops an empty Android models directory after LiteRT files are gone', async () => {
    const androidModels = 'file:///documents/models';
    const ops = createOps({
      listDirectory: jest.fn().mockResolvedValue([]),
    });

    await purgeLocalAiCaches(ops);

    expect(ops.deleteDirectory).toHaveBeenCalledWith(androidModels);
  });

  it('runs the purge only once per JS runtime', async () => {
    const ops = createOps();
    await purgeLocalAiCachesOnce(ops);
    const afterFirst = (ops.deleteDirectory as jest.Mock).mock.calls.length;
    await purgeLocalAiCachesOnce(ops);
    expect(ops.deleteDirectory).toHaveBeenCalledTimes(afterFirst);
  });
});
