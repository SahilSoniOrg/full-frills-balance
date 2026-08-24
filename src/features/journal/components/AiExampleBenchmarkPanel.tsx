import {
  AiExampleStyles,
  AiExampleTokens,
  BenchmarkResult,
  TEST_TRANSCRIPTS,
  tryParseJSON,
} from '@/src/features/journal/components/aiExampleShared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { logger } from '@/src/utils/logger';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { GenerationStats, MultimodalPart } from 'react-native-litert-lm';

type ModelLike = {
  execute: (parts: MultimodalPart[]) => Promise<string>;
  resetConversation: () => void;
  getStats: () => GenerationStats;
};

function SummaryItem({
  label,
  value,
  color,
  s,
}: {
  label: string;
  value: string;
  color: string;
  s: AiExampleStyles;
}) {
  return (
    <View style={s.summaryItem}>
      <Text style={s.summaryItemLabel}>{label}</Text>
      <Text style={[s.summaryItemValue, { color }]}>{value}</Text>
    </View>
  );
}

export function AiExampleBenchmarkPanel({
  model,
  T,
  s,
}: {
  model: ModelLike | null;
  T: AiExampleTokens;
  s: AiExampleStyles;
}) {
  const [benchResults, setBenchResults] = useState<BenchmarkResult[]>([]);
  const [benchRunning, setBenchRunning] = useState(false);
  const benchCancelRef = useRef(false);

  const runBenchmark = useCallback(async () => {
    if (!model || benchRunning) return;
    setBenchResults([]);
    setBenchRunning(true);
    benchCancelRef.current = false;

    const results: BenchmarkResult[] = [];

    try {
      model.resetConversation();
      await new Promise(r => setTimeout(r, 200));
    } catch (e: unknown) {
      logger.warn('Initial resetConversation failed:', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    for (const transcript of TEST_TRANSCRIPTS) {
      if (benchCancelRef.current) break;

      const prompt = `Parse this transaction: "${transcript}". Return: {"type":"expense","amount":0,"account":"","description":""}`;
      const parts: MultimodalPart[] = [{ type: 'text', text: prompt }];
      const startTime = Date.now();

      try {
        const reply = await model.execute(parts);

        const duration = Date.now() - startTime;
        let stats: GenerationStats | null = null;
        try {
          stats = model.getStats();
        } catch {}

        const parsed = tryParseJSON(reply);

        results.push({
          transcript,
          success: !!parsed,
          duration,
          tokensPerSecond: stats?.tokensPerSecond ?? 0,
          completionTokens: stats?.completionTokens ?? 0,
          timeToFirstToken: stats?.timeToFirstToken ?? 0,
          rawResponse: reply,
          parsed,
        });

        model.resetConversation();
        await new Promise(r => setTimeout(r, 200));
      } catch (e: unknown) {
        results.push({
          transcript,
          success: false,
          duration: Date.now() - startTime,
          tokensPerSecond: 0,
          completionTokens: 0,
          timeToFirstToken: 0,
          rawResponse: `Error: ${e instanceof Error ? e.message : String(e)}`,
          parsed: null,
        });

        try {
          model.resetConversation();
          await new Promise(r => setTimeout(r, 500));
        } catch {}
      }

      setBenchResults([...results]);
    }

    setBenchRunning(false);
  }, [model, benchRunning]);

  const abortBenchmark = useCallback(() => {
    benchCancelRef.current = true;
    setBenchRunning(false);
  }, []);

  const benchSummary = useMemo(() => {
    if (benchResults.length === 0) return null;
    const successes = benchResults.filter(r => r.success);
    const avgDuration = benchResults.reduce((sum, r) => sum + r.duration, 0) / benchResults.length;
    const avgTPS =
      successes.length > 0
        ? successes.reduce((sum, r) => sum + r.tokensPerSecond, 0) / successes.length
        : 0;
    return {
      total: benchResults.length,
      passed: successes.length,
      avgDuration: Math.round(avgDuration),
      avgTPS: avgTPS.toFixed(1),
    };
  }, [benchResults]);

  return (
    <ScrollView style={s.chatArea} contentContainerStyle={s.chatContent}>
      <TouchableOpacity
        style={[s.benchBtn, benchRunning && { backgroundColor: T.error }]}
        onPress={benchRunning ? abortBenchmark : runBenchmark}
      >
        <Text style={s.benchBtnText}>
          {benchRunning ? '■ Stop Benchmark' : '▶ Run Transaction Parse Benchmark'}
        </Text>
      </TouchableOpacity>

      <Text style={s.benchDesc}>
        Sends {TEST_TRANSCRIPTS.length} voice transcripts through model.execute() directly.
        {'\n'}No service layer — raw LiteRT inference only.
      </Text>

      {benchSummary && (
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>Summary</Text>
          <View style={s.summaryRow}>
            <SummaryItem
              label="Pass Rate"
              value={`${benchSummary.passed}/${benchSummary.total}`}
              color={benchSummary.passed === benchSummary.total ? T.success : T.warning}
              s={s}
            />
            <SummaryItem
              label="Avg Duration"
              value={`${benchSummary.avgDuration}ms`}
              color={T.cyan}
              s={s}
            />
            <SummaryItem
              label="Avg Speed"
              value={`${benchSummary.avgTPS} t/s`}
              color={T.success}
              s={s}
            />
          </View>
        </View>
      )}

      {benchResults.map((res, i) => (
        <View key={i} style={s.resultCard}>
          <Text style={s.resultTranscript}>&quot;{res.transcript}&quot;</Text>

          <View style={s.resultMetaRow}>
            <Text style={[s.resultStatus, { color: res.success ? T.success : T.error }]}>
              {res.success ? '✓ Parsed' : '✗ Failed'}
            </Text>
            <Text style={[s.resultDuration, { color: T.cyan }]}>{res.duration}ms</Text>
          </View>

          {res.success && (
            <View style={s.resultStats}>
              <Text style={s.resultStatItem}>{res.tokensPerSecond.toFixed(1)} tok/s</Text>
              <Text style={s.resultStatItem}>{Math.round(res.completionTokens)} tokens</Text>
              <Text style={s.resultStatItem}>
                TTFT: {(res.timeToFirstToken * 1000).toFixed(0)}ms
              </Text>
            </View>
          )}

          {!!res.parsed && (
            <View style={s.jsonBlock}>
              <Text style={s.jsonText}>{JSON.stringify(res.parsed, null, 2)}</Text>
            </View>
          )}

          {!res.success && (
            <View style={s.jsonBlock}>
              <Text style={[s.jsonText, { color: T.error }]}>{res.rawResponse}</Text>
            </View>
          )}
        </View>
      ))}

      {benchResults.length === 0 && !benchRunning && (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>No results yet</Text>
          <Text style={s.emptySub}>
            Tap &quot;Run Benchmark&quot; to test transaction parsing{'\n'}
            directly through the LiteRT engine.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
