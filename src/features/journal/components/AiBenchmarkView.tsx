import {
  AppButton,
  AppIcon,
  AppInput,
  AppSegmentedControl,
  AppText,
  IconButton,
} from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { transactionExtractorRegistry } from '@/src/services/ledger/TransactionExtractor';
import { MotiView } from 'moti';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { modelManagementService } from '../../../services/ai/ModelManagementService';
import { AIModelMetadata, ModelDownloadStatus } from '../../../services/ai/types';
import { nativeAIProvider } from '../services/NativeAIProvider';
import { mockAIProvider } from '../services/TransactionFallbackAIProvider';
import { transactionIngestionService } from '../services/TransactionIngestionService';

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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [benchmarkingId, setBenchmarkingId] = useState<string | null>(null);
  const [benchmarkResults, setBenchmarkResults] = useState<any[]>([]);
  const [isNativeEnabled, setIsNativeEnabled] = useState(false);
  const [inferenceMode, setInferenceMode] = useState<'single' | 'multi'>('multi');
  const [benchmarkTimeout, setBenchmarkTimeout] = useState(15000);

  // Custom Model Form State
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    const allModels = modelManagementService.getAllModels();
    setAllModels(allModels);

    const newStatuses: Record<string, ModelDownloadStatus> = {};
    for (const model of allModels) {
      newStatuses[model.id] = await modelManagementService.getDownloadStatus(model.id);
    }
    setStatuses(newStatuses);
  };

  const toggleGlobalNative = () => {
    const nextValue = !isNativeEnabled;
    setIsNativeEnabled(nextValue);
    transactionIngestionService.setAiProvider(nextValue ? nativeAIProvider : mockAIProvider);
  };

  const handleDownload = async (modelId: string) => {
    try {
      setDownloadingId(modelId);
      setDownloadProgress(0);
      await modelManagementService.downloadModel(modelId, progress => {
        setDownloadProgress(progress);
      });
      await refreshData();
    } catch (e) {
      Alert.alert('Download Failed', String(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleAddCustom = async () => {
    if (!customName || !customUrl) {
      Alert.alert('Missing Info', 'Please provide both name and URL.');
      return;
    }

    try {
      const filename = customUrl.split('/').pop()?.split('?')[0] || 'custom-model.gguf';
      await modelManagementService.registerCustomModel({
        id: `custom-${Date.now()}`,
        name: customName,
        description: 'User-provided custom model.',
        url: customUrl,
        sizeBytes: 0,
        parameters: 'Custom',
        quantization: 'Unknown',
        filename,
      });
      setCustomName('');
      setCustomUrl('');
      setIsAddingCustom(false);
      await refreshData();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const runBenchmark = async (modelId: string) => {
    setBenchmarkingId(modelId);
    setBenchmarkResults([]);
    nativeAIProvider.setModel(modelId);

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
        { mode: inferenceMode, timeout: benchmarkTimeout },
      );
      const duration = Date.now() - startTime;

      results.push({
        transcript,
        success: !!output,
        duration,
        output,
      });
      setBenchmarkResults([...results]);
    }
    setBenchmarkingId(null);
  };

  const renderModelCard = (model: AIModelMetadata) => {
    const status = statuses[model.id];
    const isDownloading = downloadingId === model.id;
    const isBenchmarking = benchmarkingId === model.id;

    return (
      <View
        key={model.id}
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <View style={styles.cardHeader}>
          <View>
            <AppText variant="subheading" weight="bold">
              {model.name}
            </AppText>
            <AppText variant="caption" color="secondary">
              {model.parameters} • {model.quantization}
            </AppText>
          </View>
          {status?.isDownloaded ? (
            <AppIcon name="checkCircle" color={theme.success} size={20} />
          ) : null}
        </View>

        <AppText variant="body" style={styles.description}>
          {model.description}
        </AppText>

        {isDownloading ? (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: theme.primary, width: `${downloadProgress * 100}%` },
                ]}
              />
            </View>
            <AppText variant="caption" style={styles.progressText}>
              {Math.round(downloadProgress * 100)}%
            </AppText>
          </View>
        ) : (
          <View style={styles.actions}>
            {!status?.isDownloaded ? (
              <AppButton
                variant="secondary"
                size="sm"
                onPress={() => handleDownload(model.id)}
                disabled={!!downloadingId}
              >
                {`Download (~${(model.sizeBytes / 1024 / 1024).toFixed(0)}MB)`}
              </AppButton>
            ) : (
              <AppButton
                variant="primary"
                size="sm"
                onPress={() => runBenchmark(model.id)}
                disabled={!!benchmarkingId || !!downloadingId}
                loading={isBenchmarking}
              >
                Run Benchmark
              </AppButton>
            )}
            {status?.isDownloaded && (
              <IconButton
                name="delete"
                onPress={() => {
                  modelManagementService.deleteModel(model.id).then(refreshData);
                }}
              />
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <AppText variant="title" weight="bold">
          AI Benchmarking
        </AppText>
        <AppText variant="body" color="secondary">
          Test on-device LLM performance for transaction parsing.
        </AppText>
        <View style={styles.globalToggle}>
          <AppButton
            variant={isNativeEnabled ? 'primary' : 'secondary'}
            size="sm"
            onPress={toggleGlobalNative}
          >
            {isNativeEnabled
              ? 'Native AI Enabled Globally'
              : 'Using Mock AI (Tap to Enable Native)'}
          </AppButton>
        </View>

        <View style={styles.modeSelector}>
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
            onChange={setInferenceMode}
            options={[
              { id: 'single', label: 'Fast (Single-Pass)' },
              { id: 'multi', label: 'Accurate (Multi-Pass)' },
            ]}
            size="sm"
            itemWidth={150}
          />
        </View>

        <View style={styles.modeSelector}>
          <AppText
            variant="caption"
            weight="bold"
            color="secondary"
            style={{ marginBottom: Spacing.xs }}
          >
            BENCHMARK TIMEOUT:
          </AppText>
          <AppSegmentedControl
            value={benchmarkTimeout}
            onChange={setBenchmarkTimeout}
            options={[
              { id: 5000, label: '5s' },
              { id: 15000, label: '15s' },
              { id: 30000, label: '30s' },
              { id: 60000, label: '60s' },
            ]}
            size="sm"
            itemWidth={60}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: Spacing.md,
          }}
        >
          <AppText variant="subheading" weight="bold">
            Available Models
          </AppText>
          <AppButton
            variant="secondary"
            size="sm"
            onPress={() => setIsAddingCustom(!isAddingCustom)}
          >
            {isAddingCustom ? 'Cancel' : 'Add Custom'}
          </AppButton>
        </View>

        {isAddingCustom && (
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={[
              styles.customForm,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <AppText variant="body" weight="bold" style={{ marginBottom: Spacing.sm }}>
              Register Custom Model
            </AppText>
            <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.xs }}>
              MODEL NAME
            </AppText>
            <AppInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="e.g. My Llama 1B"
              style={{ marginBottom: Spacing.sm }}
            />
            <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.xs }}>
              GGUF DOWNLOAD URL
            </AppText>
            <AppInput
              value={customUrl}
              onChangeText={setCustomUrl}
              placeholder="https://huggingface.co/..."
              multiline
              style={{ marginBottom: Spacing.md }}
            />
            <AppButton variant="primary" size="sm" onPress={handleAddCustom}>
              Register Model
            </AppButton>
          </MotiView>
        )}

        {availableModels.map(renderModelCard)}
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
              {res.success && (
                <AppText variant="caption" style={styles.jsonOutput}>
                  {JSON.stringify(res.output.transactions[0], null, 2)}
                </AppText>
              )}
            </MotiView>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  globalToggle: {
    marginTop: Spacing.md,
    flexDirection: 'row',
  },
  modeSelector: {
    marginTop: Spacing.lg,
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
    marginBottom: Spacing.md,
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
