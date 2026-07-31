import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import type { AIModelMetadata, ModelDownloadStatus } from '@/src/services/ai/types';
import {
  AiBackendOverride,
  useAiModelManagement,
} from '@/src/features/journal/hooks/useAiModelManagement';
import { transactionExtractorRegistry } from '@/src/services/ledger/TransactionExtractor';
import { nativeAIProvider } from '@/src/services/transaction-ingestion';
import React, { useState } from 'react';

const TEST_TRANSCRIPTS = [
  'spent 250 rs for coffee at starbucks using hdfc card',
  'received 50000 salary from acme corp',
  'refund 1200 from amazon to sbi bank',
  'transfer 5000 from savings to wallet',
];

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
  const [benchmarkingId, setBenchmarkingId] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<AiBenchmarkResult[]>([]);
  const [inferenceMode, setInferenceMode] = useState<'single' | 'multi'>('multi');
  const [backendOverride, setBackendOverride] = useState<AiBackendOverride>('auto');
  const modelManagement = useAiModelManagement(backendOverride);

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
    modelManagement.syncLoadedModel();
  };

  const abortBenchmark = () => {
    isCancelledRef.current = true;
    setBenchmarkingId(null);
    nativeAIProvider.abort();
    modelManagement.syncLoadedModel();
  };

  const isBenchmarking = modelManagement.selectedModel
    ? benchmarkingId === modelManagement.selectedModel.id
    : false;

  return {
    ...modelManagement,
    benchmarkingId,
    benchmarkResults,
    inferenceMode,
    setInferenceMode,
    backendOverride,
    setBackendOverride,
    backendOptions,
    isBenchmarking,
    runBenchmark,
    abortBenchmark,
  };
}
