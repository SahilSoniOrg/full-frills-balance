import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import type { AIModelMetadata, ModelDownloadStatus } from '@/src/services/ai/types';
import { nativeAIProvider } from '@/src/services/transaction-ingestion';
import { alert, confirm } from '@/src/utils/alerts';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AiBackendOverride = 'auto' | 'cpu' | 'gpu' | 'npu';

export interface AiModelManagementViewModel {
  availableModels: AIModelMetadata[];
  statuses: Record<string, ModelDownloadStatus>;
  loadedModelId: string | null;
  syncLoadedModel: () => void;
  isLoadingMemory: boolean;
  selectedModelId: string | null;
  setSelectedModelId: (id: string) => void;
  selectedModel: AIModelMetadata | undefined;
  status: ModelDownloadStatus | undefined;
  isDownloading: boolean;
  progress: number;
  isLoaded: boolean;
  sizeStr: string;
  handleDownload: (modelId: string) => Promise<void>;
  handleCancelDownload: (modelId: string) => Promise<void>;
  handleLoadModel: (modelId: string) => void;
  handleUnloadModel: () => Promise<void>;
  handleDeleteModel: (modelId: string) => Promise<void>;
}

export function useAiModelManagement(
  backendOverride: AiBackendOverride,
): AiModelManagementViewModel {
  const [availableModels, setAvailableModels] = useState<AIModelMetadata[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ModelDownloadStatus>>({});
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(null);
  const lastUpdateRef = useRef<Record<string, number>>({});

  const refreshData = useCallback(async () => {
    const allModels = modelManagementService.getAllModels();
    setAvailableModels(allModels);
    setSelectedModelIdState(previous =>
      previous && allModels.some(model => model.id === previous)
        ? previous
        : allModels[0]?.id || null,
    );

    const nextStatuses: Record<string, ModelDownloadStatus> = {};
    for (const model of allModels) {
      nextStatuses[model.id] = await modelManagementService.getDownloadStatus(model.id);
    }
    setStatuses(nextStatuses);
  }, []);

  useEffect(() => {
    const refreshTimer = setTimeout(() => void refreshData(), 0);

    const handleProgress = (modelId: string, progress: number, isComplete: boolean) => {
      const now = Date.now();
      const lastUpdate = lastUpdateRef.current[modelId] || 0;
      if (now - lastUpdate > 100 || isComplete || progress === 0) {
        lastUpdateRef.current[modelId] = now;
        setStatuses(previous => ({
          ...previous,
          [modelId]: {
            ...previous[modelId],
            progress,
            isDownloaded: isComplete,
          },
        }));
        if (isComplete) void refreshData();
      }
    };

    modelManagementService.addListener(handleProgress);
    const loadedTimer = setTimeout(
      () => setLoadedModelId(smallModelProvider.getLoadedModelId()),
      0,
    );
    return () => {
      clearTimeout(refreshTimer);
      clearTimeout(loadedTimer);
      modelManagementService.removeListener(handleProgress);
    };
  }, [refreshData]);

  const handleDownload = useCallback(
    async (modelId: string) => {
      try {
        await modelManagementService.downloadModel(modelId);
        await refreshData();
      } catch (error) {
        alert.show({ title: 'Download Failed', message: String(error), type: 'error' });
      }
    },
    [refreshData],
  );

  const handleCancelDownload = useCallback(
    async (modelId: string) => {
      await modelManagementService.cancelDownload(modelId);
      await refreshData();
    },
    [refreshData],
  );

  const performLoadModel = useCallback(
    async (modelId: string) => {
      setIsLoadingMemory(true);
      try {
        await smallModelProvider.switchModel(modelId, backendOverride);
        setLoadedModelId(smallModelProvider.getLoadedModelId());
      } catch (error) {
        alert.show({ title: 'Load Failed', message: String(error), type: 'error' });
      } finally {
        setIsLoadingMemory(false);
      }
    },
    [backendOverride],
  );

  const handleLoadModel = useCallback(
    (modelId: string) => {
      if (loadedModelId && loadedModelId !== modelId) {
        confirm.show({
          title: 'Switch Model',
          message:
            'Loading this model will unload the currently loaded model. Are you sure you want to proceed?',
          confirmText: 'Switch',
          destructive: true,
          onConfirm: () => void performLoadModel(modelId),
        });
      } else {
        void performLoadModel(modelId);
      }
    },
    [loadedModelId, performLoadModel],
  );

  const handleUnloadModel = useCallback(async () => {
    setIsLoadingMemory(true);
    try {
      await nativeAIProvider.unload();
      setLoadedModelId(null);
    } catch (error) {
      alert.show({ title: 'Unload Failed', message: String(error), type: 'error' });
    } finally {
      setIsLoadingMemory(false);
    }
  }, []);

  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      await modelManagementService.deleteModel(modelId);
      await refreshData();
    },
    [refreshData],
  );

  const syncLoadedModel = useCallback(() => {
    setLoadedModelId(smallModelProvider.getLoadedModelId());
  }, []);

  const selectedModel = availableModels.find(model => model.id === selectedModelId);
  const status = selectedModel ? statuses[selectedModel.id] : undefined;
  const sizeStr = selectedModel
    ? selectedModel.sizeBytes > 1024 * 1024 * 1024
      ? `${(selectedModel.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
      : `${(selectedModel.sizeBytes / 1024 / 1024).toFixed(0)} MB`
    : '';

  return {
    availableModels,
    statuses,
    loadedModelId,
    syncLoadedModel,
    isLoadingMemory,
    selectedModelId,
    setSelectedModelId: setSelectedModelIdState,
    selectedModel,
    status,
    isDownloading: selectedModel ? modelManagementService.isDownloading(selectedModel.id) : false,
    progress: status?.progress || 0,
    isLoaded: selectedModel ? loadedModelId === selectedModel.id : false,
    sizeStr,
    handleDownload,
    handleCancelDownload,
    handleLoadModel,
    handleUnloadModel,
    handleDeleteModel,
  };
}
