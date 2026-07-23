import { FormSelectorField } from '@/src/components/common/FormSelectorField';
import { SelectionPickerSheet } from '@/src/components/common/SelectionPickerSheet';
import {
  AppButton,
  AppIcon,
  AppSegmentedControl,
  AppText,
  IconButton,
} from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { modelManagementService } from '@/src/services/ai/ModelManagementService';
import { smallModelProvider } from '@/src/services/ai/SmallModelProvider';
import type { AIModelMetadata, ModelDownloadStatus } from '@/src/services/ai/types';
import { transactionExtractorRegistry } from '@/src/services/ledger/TransactionExtractor';
import { alert, confirm } from '@/src/utils/alerts';
import { MotiView } from 'moti';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { nativeAIProvider } from '@/src/services/transaction-ingestion';

const TEST_TRANSCRIPTS = [
  'spent 250 rs for coffee at starbucks using hdfc card',
  'received 50000 salary from acme corp',
  'refund 1200 from amazon to sbi bank',
  'transfer 5000 from savings to wallet',
];

export function AiBenchmarkView() {
  const { theme } = useTheme();
  const [availableModels, setAllModels] = useState<AIModelMetadata[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ModelDownloadStatus>>({});
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [benchmarkingId, setBenchmarkingId] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<any[]>([]);
  const [inferenceMode, setInferenceMode] = useState<'single' | 'multi'>('multi');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [backendOverride, setBackendOverride] = useState<'auto' | 'cpu' | 'gpu' | 'npu'>('auto');

  const backendOptions = React.useMemo(() => {
    return [
      { id: 'auto', label: 'Auto' },
      { id: 'cpu', label: 'CPU' },
      { id: 'gpu', label: 'GPU' },
      { id: 'npu', label: 'NPU' },
    ];
  }, []);

  const isCancelledRef = React.useRef(false);

  const lastUpdateRef = React.useRef<Record<string, number>>({});

  useEffect(() => {
    setTimeout(() => refreshData(), 0);

    // Subscribe to global download progress
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

    // Init loaded model state
    setTimeout(() => setLoadedModelId(smallModelProvider.getLoadedModelId()), 0);

    return () => modelManagementService.removeListener(handleProgress);
  }, []);

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

  const handleLoadModel = async (modelId: string) => {
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

  const runBenchmark = async (modelId: string) => {
    setBenchmarkingId(modelId);
    setBenchmarkResults([]);
    isCancelledRef.current = false;

    await smallModelProvider.switchModel(modelId, backendOverride);

    const results = [];
    for (const transcript of TEST_TRANSCRIPTS) {
      const startTime = Date.now();

      // Get real deterministic hints for the benchmark
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
  const status = selectedModel ? statuses[selectedModel.id] : null;
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

  return (
    <Screen title="AI Benchmarking" scrollable withPadding>
      <View style={styles.header}>
        <AppText variant="body" color="secondary">
          Test on-device LLM performance for transaction parsing.
        </AppText>
      </View>

      <View style={styles.section}>
        <FormSelectorField
          value={(() => {
            if (!selectedModel) return '';
            const tag = isLoaded ? '(Loaded)' : status?.isDownloaded ? '(Downloaded)' : '';
            return `${selectedModel.name} ${tag}`.trim();
          })()}
          placeholder="Select a model..."
          onPress={() => setIsDropdownOpen(true)}
        />

        {selectedModel && (
          <View style={{ marginTop: Spacing.lg, marginBottom: Spacing.xl }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="subheading" weight="bold">
                  {selectedModel.name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {selectedModel.parameters} • {selectedModel.quantization} • {sizeStr}
                </AppText>
              </View>
              {status?.isDownloaded && (
                <AppIcon name="checkCircle" color={theme.success} size={20} />
              )}
            </View>

            <AppText variant="body" style={{ marginVertical: Spacing.md }}>
              {selectedModel.description}
            </AppText>

            {isDownloading ? (
              <View style={{ gap: Spacing.sm }}>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: theme.primary, width: `${progress * 100}%` },
                      ]}
                    />
                  </View>
                  <AppText variant="caption" style={styles.progressText}>
                    {Math.round(progress * 100)}%
                  </AppText>
                </View>
                <AppButton
                  variant="secondary"
                  size="sm"
                  onPress={() => handleCancelDownload(selectedModel.id)}
                >
                  Cancel Download
                </AppButton>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: Spacing.sm,
                  alignItems: 'center',
                }}
              >
                {!status?.isDownloaded ? (
                  <AppButton
                    variant="secondary"
                    size="sm"
                    onPress={() => handleDownload(selectedModel.id)}
                  >
                    Download Model
                  </AppButton>
                ) : (
                  <>
                    <AppButton
                      variant={isLoaded ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={isLoadingMemory}
                      onPress={() =>
                        isLoaded ? handleUnloadModel() : handleLoadModel(selectedModel.id)
                      }
                    >
                      {isLoaded ? 'Unload Model' : 'Load in Memory'}
                    </AppButton>
                    <IconButton
                      name="delete"
                      onPress={() => {
                        modelManagementService.deleteModel(selectedModel.id).then(refreshData);
                      }}
                    />
                  </>
                )}
              </View>
            )}
          </View>
        )}

        <SelectionPickerSheet
          visible={isDropdownOpen}
          title="Select AI Model"
          options={availableModels.map(model => {
            const sizeStr =
              model.sizeBytes > 1024 * 1024 * 1024
                ? `${(model.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
                : `${(model.sizeBytes / 1024 / 1024).toFixed(0)} MB`;
            const isLoaded = loadedModelId === model.id;
            const isDownloaded = statuses[model.id]?.isDownloaded;
            let iconName = undefined;
            if (isLoaded) iconName = 'database';
            else if (isDownloaded) iconName = 'checkCircle';

            return {
              id: model.id,
              label: model.name,
              description: `${model.parameters} • ${model.quantization} • ${sizeStr}`,
              icon: iconName,
            };
          })}
          selectedValue={selectedModelId || ''}
          onClose={() => setIsDropdownOpen(false)}
          onSelect={val => setSelectedModelId(val)}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="subheading" weight="bold" style={styles.sectionTitle}>
          Configuration
        </AppText>

        <View style={{ marginBottom: Spacing.md }}>
          <AppText
            variant="caption"
            weight="bold"
            color="secondary"
            style={{ marginBottom: Spacing.xs }}
          >
            BENCHMARK MODE:
          </AppText>
          <AppSegmentedControl
            value={inferenceMode}
            onChange={setInferenceMode as (val: string) => void}
            options={[
              { id: 'single', label: 'Single-Pass' },
              { id: 'multi', label: 'Multi-Pass' },
            ]}
            size="sm"
            flex
          />
        </View>

        <View style={{ marginBottom: Spacing.xl }}>
          <AppText
            variant="caption"
            weight="bold"
            color="secondary"
            style={{ marginBottom: Spacing.xs }}
          >
            BACKEND CONFIGURATION:
          </AppText>
          <AppSegmentedControl
            value={backendOverride}
            onChange={setBackendOverride as (val: string) => void}
            options={backendOptions}
            size="sm"
            flex
          />
        </View>

        {isBenchmarking ? (
          <AppButton variant="primary" size="lg" onPress={abortBenchmark}>
            Stop Benchmark
          </AppButton>
        ) : (
          <AppButton
            variant="primary"
            size="lg"
            onPress={() => selectedModel && runBenchmark(selectedModel.id)}
            disabled={!selectedModel || !status?.isDownloaded}
          >
            Run Benchmark
          </AppButton>
        )}
      </View>

      {benchmarkResults.length > 0 && (
        <View style={styles.section}>
          <AppText variant="subheading" weight="bold" style={styles.sectionTitle}>
            Results
          </AppText>
          {benchmarkResults.map((res, i) => (
            <MotiView
              key={i}
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              style={[styles.resultCard, { backgroundColor: theme.surfaceSecondary }]}
            >
              <AppText variant="caption" color="secondary">
                Transcript: &quot;{res.transcript}&quot;
              </AppText>
              <View style={styles.resultMeta}>
                <AppText variant="body" weight="bold" color={res.success ? 'success' : 'error'}>
                  {res.success ? 'Success' : 'Failed'}
                </AppText>
                <AppText variant="body" weight="bold">
                  {res.duration}ms
                </AppText>
              </View>
              {res.success && res.output?.debugMetrics?.passTimings && (
                <View style={styles.timingsContainer}>
                  {Object.entries(res.output.debugMetrics.passTimings).map(([step, time]) => (
                    <View key={step} style={styles.timingRow}>
                      <AppText variant="caption" color="secondary">
                        {step}
                      </AppText>
                      <AppText variant="caption" weight="bold">
                        {String(time)}ms
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
              {res.success && res.output?.debugMetrics?.memorySummary && (
                <View style={[styles.timingsContainer, { marginTop: 4, borderTopWidth: 0 }]}>
                  <View style={styles.timingRow}>
                    <AppText variant="caption" color="secondary">
                      Peak Memory (RSS)
                    </AppText>
                    <AppText variant="caption" weight="bold">
                      {(
                        res.output.debugMetrics.memorySummary.peakResidentBytes /
                        1024 /
                        1024
                      ).toFixed(1)}{' '}
                      MB
                    </AppText>
                  </View>
                  <View style={styles.timingRow}>
                    <AppText variant="caption" color="secondary">
                      Current Memory (RSS)
                    </AppText>
                    <AppText variant="caption" weight="bold">
                      {(
                        res.output.debugMetrics.memorySummary.currentResidentBytes /
                        1024 /
                        1024
                      ).toFixed(1)}{' '}
                      MB
                    </AppText>
                  </View>
                </View>
              )}
              {res.success && res.output?.debugMetrics?.lastPassStats && (
                <View style={[styles.timingsContainer, { marginTop: 4, borderTopWidth: 0 }]}>
                  {res.output.debugMetrics.lastPassStats.tokensPerSecond > 0 && (
                    <View style={styles.timingRow}>
                      <AppText variant="caption" color="secondary">
                        Tokens/Sec
                      </AppText>
                      <AppText variant="caption" weight="bold">
                        {res.output.debugMetrics.lastPassStats.tokensPerSecond.toFixed(1)} t/s
                      </AppText>
                    </View>
                  )}
                  {res.output.debugMetrics.lastPassStats.timeToFirstTokenMs > 0 && (
                    <View style={styles.timingRow}>
                      <AppText variant="caption" color="secondary">
                        Time to First Token (TTFT)
                      </AppText>
                      <AppText variant="caption" weight="bold">
                        {res.output.debugMetrics.lastPassStats.timeToFirstTokenMs.toFixed(0)} ms
                      </AppText>
                    </View>
                  )}
                  {res.output.debugMetrics.lastPassStats.completionTokens > 0 && (
                    <View style={styles.timingRow}>
                      <AppText variant="caption" color="secondary">
                        Tokens Generated
                      </AppText>
                      <AppText variant="caption" weight="bold">
                        {res.output.debugMetrics.lastPassStats.completionTokens.toFixed(0)} tokens
                      </AppText>
                    </View>
                  )}
                </View>
              )}
              {res.success && (
                <AppText variant="caption" style={styles.jsonOutput}>
                  {JSON.stringify(res.output.transactions[0], null, 2)}
                </AppText>
              )}
            </MotiView>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: Spacing.xl,
    marginTop: Spacing.md,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  customForm: {
    padding: Spacing.md,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.md,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  description: {
    marginBottom: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  progressText: {
    width: 40,
    textAlign: 'right',
  },
  resultCard: {
    padding: Spacing.sm,
    borderRadius: Shape.radius.r1,
    marginBottom: Spacing.sm,
  },
  resultMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  timingsContainer: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
    gap: 2,
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  jsonOutput: {
    fontFamily: 'monospace',
    marginTop: Spacing.xs,
    fontSize: 10,
  },
});
