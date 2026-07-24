import { SmallModelProvider } from '../SmallModelProvider';
import { modelManagementService } from '../ModelManagementService';
import { createLLM } from 'react-native-litert-lm';

jest.mock('react-native-litert-lm', () => ({
  createLLM: jest.fn(),
}));

jest.mock('../ModelManagementService', () => ({
  modelManagementService: {
    getAllModels: jest.fn(),
    getDownloadStatus: jest.fn(),
  },
}));

jest.mock('expo-device', () => ({
  totalMemory: 8 * 1024 * 1024 * 1024,
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('SmallModelProvider', () => {
  let provider: SmallModelProvider;
  let mockLLM: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLLM = {
      loadModel: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue('{"success": true}'),
      resetConversation: jest.fn(),
      getStats: jest.fn().mockReturnValue({
        tokensPerSecond: 25,
        timeToFirstToken: 0.1,
        completionTokens: 50,
      }),
      close: jest.fn(),
    };
    (createLLM as jest.Mock).mockReturnValue(mockLLM);

    (modelManagementService.getAllModels as jest.Mock).mockReturnValue([
      {
        id: 'test-model',
        name: 'Test Model',
        url: 'file:///models/test.bin',
        minDeviceMemoryGb: 4,
        defaultConfig: {
          systemPrompt: 'System Test',
          maxContextTokens: 2048,
          maxOutputTokens: 512,
          temperature: 0.5,
        },
      },
    ]);

    (modelManagementService.getDownloadStatus as jest.Mock).mockResolvedValue({
      isDownloaded: true,
    });

    provider = new SmallModelProvider('test-model');
  });

  it('passes maxContextTokens and maxOutputTokens to LLM loadModel configuration', async () => {
    const result = await provider.generate('Hello world');

    expect(createLLM).toHaveBeenCalledWith({ enableMemoryTracking: true });
    expect(mockLLM.loadModel).toHaveBeenCalledWith(
      'file:///models/test.bin',
      expect.objectContaining({
        maxContextTokens: 2048,
        maxOutputTokens: 512,
        systemPrompt: 'System Test',
      }),
    );
    expect(result.text).toBe('{"success": true}');
  });

  it('uses default fallback limits when model config token bounds are omitted', async () => {
    (modelManagementService.getAllModels as jest.Mock).mockReturnValue([
      {
        id: 'test-model-fallback',
        name: 'Fallback Model',
        url: 'file:///models/fallback.bin',
      },
    ]);

    const fallbackProvider = new SmallModelProvider('test-model-fallback');
    await fallbackProvider.generate('Test prompt');

    expect(mockLLM.loadModel).toHaveBeenCalledWith(
      'file:///models/fallback.bin',
      expect.objectContaining({
        maxContextTokens: 4096,
        maxOutputTokens: 1024,
      }),
    );
  });
});
