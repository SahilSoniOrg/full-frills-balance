import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import type { AIModelMetadata, ModelDownloadStatus } from '@/src/services/ai/types';
import { transactionExtractorRegistry } from '@/src/services/ledger/TransactionExtractor';
import { nativeAIProvider } from '@/src/services/transaction-ingestion';
import { alert, confirm } from '@/src/utils/alerts';
import React, { useEffect, useState } from 'react';

const TEST_TRANSCRIPTS = [
  'spent 250 rs for coffee at starbucks using hdfc card',
  'received 50000 salary from acme corp',
  'refund 1200 from amazon to sbi bank',
  'transfer 5000 from savings to wallet',
];

export type AiBackendOverride = 'auto' | 'cpu' | 'gpu' | 'npu';

export interface AiBenchmarkResult {
  transcript: string;
  success: boolean;
  duration: number;
  output: any;
}

export interface AiBenchmarkViewModel {
  availableModels: AIModelMetadata[];
  statuses: Record<string, ModelDownloadStatus>;
  loadedModelId: string | null;
  isLoadingMemory: boolean;
  benchmarkingId: string | null;
  benchmarkResults: AiBenchmarkResult[];
  inferenceMode: 'single' | 'multi';
  setInferenceMode: (mode: 'single' | 'multi') => void;
  selectedModelId: string | null;
  setSelectedModelId: (id: string) => void;
  backendOverride: AiBackendOverride;
  setBackendOverride: (backend: AiBackendOverride) => void;
  backendOptions: { id: AiBackendOverride; label: string }[];
  selectedModel: AIModelMetadata | undefined;
  status: ModelDownloadStatus | undefined;
  isDownloading: boolean;
  progress: number;
  isLoaded: boolean;
  isBenchmarking: boolean;
  sizeStr: string;
  handleDownload: (modelId: string) => Promise<void>;
  handleCancelDownload: (modelId: string) => Promise<void>;
  handleLoadModel: (modelId: string) => void;
  handleUnloadModel: () => Promise<void>;
  handleDeleteModel: (modelId: string) => Promise<void>;
  runBenchmark: (modelId: string) => Promise<void>;
  abortBenchmark: () => void;
}

export function useAiBenchmarkViewModel(): AiBenchmarkViewModel {
  const [availableModels, setAllModels] = useState<AIModelMetadata[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ModelDownloadStatus>>({});
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [benchmarkingId, setBenchmarkingId] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<AiBenchmarkResult[]>([]);
  const [inferenceMode, setInferenceMode] = useState<'single' | 'multi'>('multi');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [backendOverride, setBackendOverride] = useState<AiBackendOverride>('auto');

  const backendOptions = React.useMemo(
    () => [
      { id: 'auto' as const, label: 'Auto' },
      { id: 'cpu' as const, label: 'CPU' },
      { id: 'gpu' as const, label: 'GPU' },
      { id: 'npu' as const, label: 'NPU' },
    ],
    [],
  );

  const isCancelledRef = React.useRef(false);
  const lastUpdateRef = React.useRef<Record<string, number>>({});

  async function refreshData() {
    const allModels = modelManagementService.getAllModels();
    setAllModels(allModels);

    if (allModels.length > 0) {
      setSelectedModelId(prev =>
        prev && allModels.some(m => m.id === prev) ? prev : allModels[0].id,
      );
    }

    const newStatuses: Record<string, ModelDownloadStatus> = {};
    for (const model of allModels) {
      newStatuses[model.id] = await modelManagementService.getDownloadStatus(model.id);
    }
    setStatuses(newStatuses);
  }

  useEffect(() => {
    setTimeout(() => refreshData(), 0);

    const handleProgress = (modelId: string, progress: number, isComplete: boolean) => {
      const now = Date.now();
      const lastUpdate = lastUpdateRef.current[modelId] || 0;

      // Throttle updates to ~10fps (every 100ms) to prevent UI thread/Skia overload
      if (now - lastUpdate > 100 || isComplete || progress === 0) {
        lastUpdateRef.current[modelId] = now;
        setStatuses(prev => ({
          ...prev,
          [modelId]: {
            ...prev[modelId],
            progress,
            isDownloaded: isComplete,
          },
        }));
        if (isComplete) refreshData();
      }
    };
    modelManagementService.addListener(handleProgress);

    setTimeout(() => setLoadedModelId(smallModelProvider.getLoadedModelId()), 0);

    return () => modelManagementService.removeListener(handleProgress);
  }, []);

  const handleDownload = async (modelId: string) => {
    try {
      await modelManagementService.downloadModel(modelId);
      await refreshData();
    } catch (e) {
      alert.show({ title: 'Download Failed', message: String(e), type: 'error' });
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    await modelManagementService.cancelDownload(modelId);
    await refreshData();
  };

  const performLoadModel = async (modelId: string) => {
    setIsLoadingMemory(true);
    try {
      await smallModelProvider.switchModel(modelId, backendOverride);
      setTimeout(() => setLoadedModelId(smallModelProvider.getLoadedModelId()), 0);
    } catch (e) {
      alert.show({ title: 'Load Failed', message: String(e), type: 'error' });
    } finally {
      setIsLoadingMemory(false);
    }
  };

  const handleLoadModel = (modelId: string) => {
    if (loadedModelId && loadedModelId !== modelId) {
      confirm.show({
        title: 'Switch Model',
        message:
          'Loading this model will unload the currently loaded model. Are you sure you want to proceed?',
        confirmText: 'Switch',
        destructive: true,
        onConfirm: () => performLoadModel(modelId),
      });
    } else {
      performLoadModel(modelId);
    }
  };

  const handleUnloadModel = async () => {
    setIsLoadingMemory(true);
    try {
      await nativeAIProvider.unload();
      setLoadedModelId(null);
    } catch (e) {
      alert.show({ title: 'Unload Failed', message: String(e), type: 'error' });
    } finally {
      setIsLoadingMemory(false);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    await modelManagementService.deleteModel(modelId);
    await refreshData();
  };

  const runBenchmark = async (modelId: string) => {
    setBenchmarkingId(modelId);
    setBenchmarkResults([]);
    isCancelledRef.current = false;

    await smallModelProvider.switchModel(modelId, backendOverride);

    const results: AiBenchmarkResult[] = [];
    for (const transcript of TEST_TRANSCRIPTS) {
      const startTime = Date.now();

      const rawInput = {
        channel: 'voice' as const,
        id: `bench-${Date.now()}`,
        rawText: transcript,
        date: Date.now(),
        metadata: { defaultCurrencyCode: 'INR' },
      };
      const extractor = transactionExtractorRegistry.getExtractorFor(rawInput);
      const parsed = await extractor.extract(rawInput);

      const output = await nativeAIProvider.parse(
        transcript,
        {
          accounts: ['Cash', 'HDFC Card', 'SBI Bank', 'Savings', 'Wallet', 'HSBC Premier Credit'],
          categories: [
            'Food & Drinks (INR)',
            'Salary (INR)',
            'Groceries (INR)',
            'Transport (INR)',
            'Rent (INR)',
          ],
          parserHints: {
            amount: parsed.amount,
            rawAccount: parsed.sourceAccountHint,
            rawItem: parsed.destinationCategoryHint,
          },
        },
        { mode: inferenceMode },
      );
      if (isCancelledRef.current) break;
      const duration = Date.now() - startTime;

      results.push({
        transcript,
        success: !!output,
        duration,
        output,
      });
      setBenchmarkResults([...results]);
      if (!isCancelledRef.current) {
        setBenchmarkingId(null);
      }
    }
    setTimeout(() => setLoadedModelId(smallModelProvider.getLoadedModelId()), 0);
  };

  const abortBenchmark = () => {
    isCancelledRef.current = true;
    setBenchmarkingId(null);
    nativeAIProvider.abort();
    setTimeout(() => setLoadedModelId(smallModelProvider.getLoadedModelId()), 0);
  };

  const selectedModel = availableModels.find(m => m.id === selectedModelId);
  const status = selectedModel ? statuses[selectedModel.id] : undefined;
  const isDownloading = selectedModel
    ? modelManagementService.isDownloading(selectedModel.id)
    : false;
  const progress = status?.progress || 0;
  const isLoaded = selectedModel ? loadedModelId === selectedModel.id : false;
  const isBenchmarking = selectedModel ? benchmarkingId === selectedModel.id : false;
  const sizeStr = selectedModel
    ? selectedModel.sizeBytes > 1024 * 1024 * 1024
      ? `${(selectedModel.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
      : `${(selectedModel.sizeBytes / 1024 / 1024).toFixed(0)} MB`
    : '';

  return {
    availableModels,
    statuses,
    loadedModelId,
    isLoadingMemory,
    benchmarkingId,
    benchmarkResults,
    inferenceMode,
    setInferenceMode,
    selectedModelId,
    setSelectedModelId,
    backendOverride,
    setBackendOverride,
    backendOptions,
    selectedModel,
    status,
    isDownloading,
    progress,
    isLoaded,
    isBenchmarking,
    sizeStr,
    handleDownload,
    handleCancelDownload,
    handleLoadModel,
    handleUnloadModel,
    handleDeleteModel,
    runBenchmark,
    abortBenchmark,
  };
}
