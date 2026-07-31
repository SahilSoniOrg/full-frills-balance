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
import { useAiBenchmarkViewModel } from '@/src/features/journal/hooks/useAiBenchmarkViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { MotiView } from 'moti';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export function AiBenchmarkView() {
  const { theme } = useTheme();
  const vm = useAiBenchmarkViewModel();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
            if (!vm.selectedModel) return '';
            const tag = vm.isLoaded ? '(Loaded)' : vm.status?.isDownloaded ? '(Downloaded)' : '';
            return `${vm.selectedModel.name} ${tag}`.trim();
          })()}
          placeholder="Select a model..."
          onPress={() => setIsDropdownOpen(true)}
        />

        {vm.selectedModel && (
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
                  {vm.selectedModel.name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {vm.selectedModel.parameters} • {vm.selectedModel.quantization} • {vm.sizeStr}
                </AppText>
              </View>
              {vm.status?.isDownloaded && (
                <AppIcon name="checkCircle" color={theme.success} size={20} />
              )}
            </View>

            <AppText variant="body" style={{ marginVertical: Spacing.md }}>
              {vm.selectedModel.description}
            </AppText>

            {vm.isDownloading ? (
              <View style={{ gap: Spacing.sm }}>
                <View style={styles.progressContainer}>
                  <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: theme.primary, width: `${vm.progress * 100}%` },
                      ]}
                    />
                  </View>
                  <AppText variant="caption" style={styles.progressText}>
                    {Math.round(vm.progress * 100)}%
                  </AppText>
                </View>
                <AppButton
                  variant="secondary"
                  size="sm"
                  onPress={() => vm.handleCancelDownload(vm.selectedModel!.id)}
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
                {!vm.status?.isDownloaded ? (
                  <AppButton
                    variant="secondary"
                    size="sm"
                    onPress={() => vm.handleDownload(vm.selectedModel!.id)}
                  >
                    Download Model
                  </AppButton>
                ) : (
                  <>
                    <AppButton
                      variant={vm.isLoaded ? 'secondary' : 'primary'}
                      size="sm"
                      disabled={vm.isLoadingMemory}
                      onPress={() =>
                        vm.isLoaded
                          ? vm.handleUnloadModel()
                          : vm.handleLoadModel(vm.selectedModel!.id)
                      }
                    >
                      {vm.isLoaded ? 'Unload Model' : 'Load in Memory'}
                    </AppButton>
                    <IconButton
                      name="delete"
                      onPress={() => {
                        vm.handleDeleteModel(vm.selectedModel!.id);
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
          options={vm.availableModels.map(model => {
            const sizeStr =
              model.sizeBytes > 1024 * 1024 * 1024
                ? `${(model.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB`
                : `${(model.sizeBytes / 1024 / 1024).toFixed(0)} MB`;
            const isLoaded = vm.loadedModelId === model.id;
            const isDownloaded = vm.statuses[model.id]?.isDownloaded;
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
          selectedValue={vm.selectedModelId || ''}
          onClose={() => setIsDropdownOpen(false)}
          onSelect={val => vm.setSelectedModelId(val)}
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
            value={vm.inferenceMode}
            onChange={vm.setInferenceMode as (val: string) => void}
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
            value={vm.backendOverride}
            onChange={vm.setBackendOverride as (val: string) => void}
            options={vm.backendOptions}
            size="sm"
            flex
          />
        </View>

        {vm.isBenchmarking ? (
          <AppButton variant="primary" size="lg" onPress={vm.abortBenchmark}>
            Stop Benchmark
          </AppButton>
        ) : (
          <AppButton
            variant="primary"
            size="lg"
            onPress={() => vm.selectedModel && vm.runBenchmark(vm.selectedModel.id)}
            disabled={!vm.selectedModel || !vm.status?.isDownloaded}
          >
            Run Benchmark
          </AppButton>
        )}
      </View>

      {vm.benchmarkResults.length > 0 && (
        <View style={styles.section}>
          <AppText variant="subheading" weight="bold" style={styles.sectionTitle}>
            Results
          </AppText>
          {vm.benchmarkResults.map((res, i) => (
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
