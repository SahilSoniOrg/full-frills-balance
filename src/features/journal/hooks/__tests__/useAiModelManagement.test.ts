import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAiModelManagement } from '../useAiModelManagement';
import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';

jest.mock('@/src/services/ai/ModelManagementService', () => ({
  modelManagementService: {
    getAllModels: jest.fn(),
    getDownloadStatus: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    isDownloading: jest.fn(),
    downloadModel: jest.fn(),
    cancelDownload: jest.fn(),
    deleteModel: jest.fn(),
  },
}));

jest.mock('@/src/services/ai/SmallModelProvider', () => ({
  smallModelProvider: {
    getLoadedModelId: jest.fn(),
    switchModel: jest.fn(),
  },
}));

jest.mock('@/src/services/transaction-ingestion', () => ({
  nativeAIProvider: { unload: jest.fn() },
}));

jest.mock('@/src/utils/alerts', () => ({
  alert: { show: jest.fn() },
  confirm: { show: jest.fn() },
}));

describe('useAiModelManagement', () => {
  const model = {
    id: 'small-model',
    name: 'Small Model',
    description: 'Test model',
    url: 'file:///model',
    sizeBytes: 2 * 1024 * 1024,
    parameters: '1B',
    quantization: 'Q4',
    filename: 'model.bin',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (modelManagementService.getAllModels as jest.Mock).mockReturnValue([model]);
    (modelManagementService.getDownloadStatus as jest.Mock).mockResolvedValue({
      modelId: model.id,
      isDownloaded: true,
      progress: 1,
    });
    (modelManagementService.isDownloading as jest.Mock).mockReturnValue(false);
    (smallModelProvider.getLoadedModelId as jest.Mock).mockReturnValue(null);
    (smallModelProvider.switchModel as jest.Mock).mockResolvedValue(undefined);
  });

  it('refreshes the catalog and delegates model lifecycle actions', async () => {
    const { result, unmount } = renderHook(() => useAiModelManagement('cpu'));

    await waitFor(() => expect(result.current.selectedModelId).toBe(model.id));
    expect(result.current.selectedModel?.name).toBe(model.name);
    expect(result.current.status?.isDownloaded).toBe(true);
    expect(result.current.sizeStr).toBe('2 MB');

    await act(async () => {
      result.current.handleLoadModel(model.id);
      await Promise.resolve();
    });
    expect(smallModelProvider.switchModel).toHaveBeenCalledWith(model.id, 'cpu');

    await act(async () => {
      await result.current.handleDownload(model.id);
    });
    expect(modelManagementService.downloadModel).toHaveBeenCalledWith(model.id);
    expect(modelManagementService.getDownloadStatus).toHaveBeenCalled();

    unmount();
    expect(modelManagementService.removeListener).toHaveBeenCalled();
  });
});
