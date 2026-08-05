/**
 * AiExampleView — 100% replica of the react-native-litert-lm example app
 * PLUS benchmark flows for transaction parsing.
 *
 * Uses useModel hook directly, same config, same execute() call.
 * No SmallModelProvider, no NativeAIProvider, no service layer.
 */

import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  GEMMA_3N_E2B_IT_INT4,
  GEMMA_4_E2B_IT,
  checkBackendSupport,
  useModel,
  type GenerationStats,
  type MultimodalPart,
} from 'react-native-litert-lm';

// Theme colors are now resolved dynamically from the active global theme.

// ─── Types ───────────────────────────────────────────────────────────────────
type ChatMsg = { role: 'user' | 'model'; text: string };
type ModelKey = 'gemma4' | 'gemma3n';
type TabKey = 'chat' | 'benchmark';

interface BenchmarkResult {
  transcript: string;
  success: boolean;
  duration: number;
  tokensPerSecond: number;
  completionTokens: number;
  timeToFirstToken: number;
  rawResponse: string;
  parsed: any;
}

const MODELS: Record<ModelKey, { label: string; url: string }> = {
  gemma4: { label: 'Gemma 4 E2B', url: GEMMA_4_E2B_IT },
  gemma3n: { label: 'Gemma 3n E2B', url: GEMMA_3N_E2B_IT_INT4 },
};

// Same test transcripts from AiBenchmarkView
const TEST_TRANSCRIPTS = [
  'spent 250 rs for coffee at starbucks using hdfc card',
  'received 50000 salary from acme corp',
  'refund 1200 from amazon to sbi bank',
  'transfer 5000 from savings to wallet',
];

function tryParseJSON(text: string): any {
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function AiExampleView({ chrome }: { chrome: ScreenNavChrome }) {
  const { theme } = useTheme();
  const T = useMemo(
    () => ({
      bg: theme.background,
      surface: theme.surface,
      card: theme.surfaceSecondary,
      elevated: theme.border,
      accent: theme.primary,
      accentGlow: theme.primary,
      success: theme.success,
      warning: theme.warning,
      error: theme.error,
      cyan: theme.asset,
      text: theme.text,
      dim: theme.textSecondary,
      border: theme.border,
      onPrimary: theme.onPrimary,
    }),
    [theme],
  );

  const s = useMemo(() => getStyles(T), [T]);

  const [sel, setSel] = useState<ModelKey>('gemma4');
  const [backend, setBackend] = useState<'cpu' | 'gpu'>('cpu');
  const [tab, setTab] = useState<TabKey>('chat');

  // Chat state
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Benchmark state
  const [benchResults, setBenchResults] = useState<BenchmarkResult[]>([]);
  const [benchRunning, setBenchRunning] = useState(false);
  const benchCancelRef = useRef(false);

  // Exact same config as example app
  const config = useMemo(
    () => ({
      backend,
      systemPrompt: 'You are a helpful assistant. Keep responses concise.',
      maxTokens: 2048,
      autoLoad: false,
      enableMemoryTracking: true,
      maxMemorySnapshots: 100,
      enableSpeculativeDecoding: false,
    }),
    [backend],
  );

  const { model, isReady, downloadProgress, error, load } = useModel(MODELS[sel].url, config);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chat, streaming]);

  // ── Chat send (exact same as example app) ──────────────────────────────────
  const send = useCallback(async () => {
    if (!model || busy) return;
    const msg = input.trim();
    if (!msg) return;

    setInput('');
    setBusy(true);
    setChat(prev => [...prev, { role: 'user', text: msg }]);
    setStreaming('');

    try {
      const parts: MultimodalPart[] = [{ type: 'text', text: msg }];
      let full = '';
      const reply = await model.execute(parts, (token: string) => {
        full += token;
        setStreaming(full);
      });

      setChat(prev => [...prev, { role: 'model', text: reply }]);
      setStreaming('');
    } catch (e: any) {
      setChat(prev => [...prev, { role: 'model', text: `Error: ${e.message}` }]);
      setStreaming('');
    } finally {
      setBusy(false);
    }
  }, [model, input, busy]);

  // ── Benchmark: run transaction parsing ─────────────────────────────────────
  const runBenchmark = useCallback(async () => {
    if (!model || benchRunning) return;
    setBenchResults([]);
    setBenchRunning(true);
    benchCancelRef.current = false;

    const results: BenchmarkResult[] = [];

    // Reset the conversation context initially
    try {
      model.resetConversation();
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      console.warn('Initial resetConversation failed:', e.message);
    }

    for (const transcript of TEST_TRANSCRIPTS) {
      if (benchCancelRef.current) break;

      // Use a short, simple prompt — matching what works in chat
      const prompt = `Parse this transaction: "${transcript}". Return: {"type":"expense","amount":0,"account":"","description":""}`;
      const parts: MultimodalPart[] = [{ type: 'text', text: prompt }];
      const startTime = Date.now();

      try {
        // Use blocking execute (NO streaming callback) to prevent race conditions
        // on the C engine background threads when we reset or run loops.
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

        // Reset conversation context synchronously between iterations to keep it clean
        model.resetConversation();
        await new Promise(r => setTimeout(r, 200));
      } catch (e: any) {
        results.push({
          transcript,
          success: false,
          duration: Date.now() - startTime,
          tokensPerSecond: 0,
          completionTokens: 0,
          timeToFirstToken: 0,
          rawResponse: `Error: ${e.message}`,
          parsed: null,
        });

        // Try to recover state by resetting
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

  const stats = model && isReady ? model.getStats() : null;
  const isDownloading = downloadProgress > 0 && downloadProgress < 1;
  const isLoading = downloadProgress === 1 && !isReady;
  const canInteract = !isReady && !isDownloading && !isLoading;
  const gpuWarning = useMemo(() => checkBackendSupport('gpu'), []);

  // Benchmark summary
  const benchSummary = useMemo(() => {
    if (benchResults.length === 0) return null;
    const successes = benchResults.filter(r => r.success);
    const avgDuration = benchResults.reduce((s, r) => s + r.duration, 0) / benchResults.length;
    const avgTPS =
      successes.length > 0
        ? successes.reduce((s, r) => s + r.tokensPerSecond, 0) / successes.length
        : 0;
    return {
      total: benchResults.length,
      passed: successes.length,
      avgDuration: Math.round(avgDuration),
      avgTPS: avgTPS.toFixed(1),
    };
  }, [benchResults]);

  return (
    <ScreenWithChrome chrome={chrome} style={s.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>
          Example <Text style={{ color: T.accent }}>Replica</Text>
        </Text>
        <Text style={s.subtitle}>
          Direct litert-lm • {Platform.OS === 'ios' ? 'Metal' : backend.toUpperCase()}
        </Text>
      </View>

      {/* Model + Backend selector */}
      <View style={s.row}>
        {(Object.keys(MODELS) as ModelKey[]).map(k => (
          <TouchableOpacity
            key={k}
            disabled={!canInteract}
            onPress={() => setSel(k)}
            style={[s.pill, sel === k && s.pillActive, !canInteract && { opacity: 0.5 }]}
          >
            <Text style={[s.pillText, sel === k && { color: T.accentGlow }]}>
              {MODELS[k].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.row}>
        {(['cpu', 'gpu'] as const).map(b => {
          return (
            <TouchableOpacity
              key={b}
              disabled={!canInteract}
              onPress={() => setBackend(b)}
              style={[s.pill, backend === b && s.pillActive, !canInteract && { opacity: 0.4 }]}
            >
              <Text style={[s.pillText, backend === b && { color: T.accentGlow }]}>
                {b.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {backend === 'gpu' && !!gpuWarning && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: T.warning, lineHeight: 16 }}>⚠️ {gpuWarning}</Text>
        </View>
      )}

      {/* Status / Load */}
      {!isReady && (
        <View style={s.statusCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.statusTitle}>
              {isDownloading
                ? `Downloading ${(downloadProgress * 100).toFixed(0)}%`
                : isLoading
                  ? 'Loading engine…'
                  : 'Model not loaded'}
            </Text>
            {error && <Text style={{ fontSize: 12, color: T.error, marginTop: 4 }}>{error}</Text>}
          </View>
          {canInteract && (
            <TouchableOpacity style={s.loadBtn} onPress={load}>
              <Text style={s.loadBtnText}>Load</Text>
            </TouchableOpacity>
          )}
          {(isDownloading || isLoading) && <ActivityIndicator color={T.accent} />}
        </View>
      )}

      {/* Stats bar */}
      {isReady && (
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statLabel}>SPEED</Text>
            <Text style={[s.statValue, { color: T.success }]}>
              {stats?.tokensPerSecond ? `${stats.tokensPerSecond.toFixed(1)}` : '—'}
              <Text style={s.statUnit}> tok/s</Text>
            </Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>LATENCY</Text>
            <Text style={[s.statValue, { color: T.cyan }]}>
              {stats?.totalTime ? `${stats.totalTime.toFixed(0)}` : '—'}
              <Text style={s.statUnit}> ms</Text>
            </Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statLabel}>TOKENS</Text>
            <Text style={[s.statValue, { color: T.warning }]}>
              {stats?.completionTokens ? `${Math.round(stats.completionTokens)}` : '—'}
            </Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      {isReady && (
        <View style={s.tabRow}>
          {(['chat', 'benchmark'] as TabKey[]).map(t => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={[s.tabBtn, tab === t && s.tabBtnActive]}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'chat' ? '💬 Chat' : '⚡ Benchmark'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Chat Tab ──────────────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <>
          <ScrollView
            ref={scrollRef}
            style={s.chatArea}
            contentContainerStyle={s.chatContent}
            keyboardShouldPersistTaps="handled"
          >
            {isReady && chat.length === 0 && (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>Ready to chat</Text>
                <Text style={s.emptySub}>{MODELS[sel].label} loaded. Send a message to begin.</Text>
                <View style={s.suggestRow}>
                  {['Tell me a joke', 'What is React Native?', 'Explain gravity'].map(q => (
                    <TouchableOpacity key={q} style={s.suggestChip} onPress={() => setInput(q)}>
                      <Text style={s.suggestText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {chat.map((m, i) => (
              <View
                key={i}
                style={[s.bubbleRow, m.role === 'user' && { justifyContent: 'flex-end' }]}
              >
                <View
                  style={[
                    s.bubble,
                    m.role === 'user' ? { backgroundColor: T.accent } : { backgroundColor: T.card },
                  ]}
                >
                  <Text style={[s.bubbleText, m.role === 'user' && { color: T.onPrimary }]}>
                    {m.text}
                  </Text>
                </View>
              </View>
            ))}

            {streaming !== '' && (
              <View style={s.bubbleRow}>
                <View style={[s.bubble, { backgroundColor: T.card }]}>
                  <Text style={s.bubbleText}>
                    {streaming}
                    <Text style={{ color: T.accent }}>▊</Text>
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {isReady && (
            <View style={s.inputBar}>
              <TextInput
                style={s.input}
                placeholder="Message…"
                placeholderTextColor={T.dim}
                value={input}
                onChangeText={setInput}
                editable={!busy}
                onSubmitEditing={send}
                returnKeyType="send"
                multiline
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
                onPress={send}
                disabled={!input.trim() || busy}
              >
                {busy ? (
                  <ActivityIndicator color={T.onPrimary} size="small" />
                ) : (
                  <Text style={s.sendIcon}>↑</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* ── Benchmark Tab ─────────────────────────────────────────────────── */}
      {tab === 'benchmark' && isReady && (
        <ScrollView style={s.chatArea} contentContainerStyle={s.chatContent}>
          {/* Run/Stop button */}
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

          {/* Summary */}
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

          {/* Individual results */}
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

              {res.parsed && (
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
      )}
    </ScreenWithChrome>
  );
}

function SummaryItem({
  label,
  value,
  color,
  s,
}: {
  label: string;
  value: string;
  color: string;
  s: any;
}) {
  return (
    <View style={s.summaryItem}>
      <Text style={s.summaryItemLabel}>{label}</Text>
      <Text style={[s.summaryItemValue, { color }]}>{value}</Text>
    </View>
  );
}

const getStyles = (T: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: 24, fontWeight: '900', color: T.text },
    subtitle: { fontSize: 12, color: T.dim, marginTop: 2 },
    row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
    pill: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: T.card,
      borderWidth: 1,
      borderColor: T.border,
      alignItems: 'center',
    },
    pillActive: { borderColor: T.accent, backgroundColor: 'rgba(99,102,241,0.12)' },
    pillText: { fontSize: 13, fontWeight: '700', color: T.dim },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 16,
      backgroundColor: T.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: T.border,
    },
    statusTitle: { fontSize: 14, fontWeight: '600', color: T.text },
    loadBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: T.accent,
      marginLeft: 12,
    },
    loadBtnText: { color: T.onPrimary, fontWeight: '700', fontSize: 14 },
    statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
    stat: {
      flex: 1,
      backgroundColor: T.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: T.border,
    },
    statLabel: { fontSize: 10, fontWeight: '700', color: T.dim, letterSpacing: 1 },
    statValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
    statUnit: { fontSize: 12, fontWeight: '500' },

    // Tabs
    tabRow: {
      flexDirection: 'row',
      gap: 0,
      marginHorizontal: 16,
      marginBottom: 8,
      backgroundColor: T.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: T.border,
      overflow: 'hidden',
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
    },
    tabBtnActive: {
      backgroundColor: 'rgba(99,102,241,0.15)',
    },
    tabText: { fontSize: 13, fontWeight: '700', color: T.dim },
    tabTextActive: { color: T.accentGlow },

    // Chat
    chatArea: { flex: 1 },
    chatContent: { paddingHorizontal: 16, paddingBottom: 20 },
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: T.text },
    emptySub: { fontSize: 13, color: T.dim, marginTop: 4, textAlign: 'center', lineHeight: 20 },
    suggestRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    suggestChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: T.card,
      borderWidth: 1,
      borderColor: T.border,
    },
    suggestText: { fontSize: 12, color: T.accentGlow },
    bubbleRow: { flexDirection: 'row', marginTop: 12 },
    bubble: {
      maxWidth: '80%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 16,
    },
    bubbleText: { fontSize: 14, color: T.text, lineHeight: 20 },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: T.bg,
      borderTopWidth: 1,
      borderTopColor: T.border,
    },
    input: {
      flex: 1,
      backgroundColor: T.card,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      color: T.text,
      fontSize: 14,
      maxHeight: 100,
      borderWidth: 1,
      borderColor: T.border,
    },
    sendBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: T.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    sendIcon: { color: T.onPrimary, fontSize: 18, fontWeight: '700' },

    // Benchmark
    benchBtn: {
      backgroundColor: T.accent,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    benchBtnText: { color: T.onPrimary, fontSize: 15, fontWeight: '800' },
    benchDesc: {
      fontSize: 12,
      color: T.dim,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 18,
    },

    // Summary
    summaryCard: {
      backgroundColor: T.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: T.border,
      marginBottom: 12,
    },
    summaryTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: T.dim,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 10,
    },
    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryItem: {
      flex: 1,
      backgroundColor: T.card,
      borderRadius: 10,
      padding: 10,
      alignItems: 'center',
    },
    summaryItemLabel: { fontSize: 10, color: T.dim, fontWeight: '600' },
    summaryItemValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },

    // Results
    resultCard: {
      backgroundColor: T.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: T.border,
    },
    resultTranscript: {
      fontSize: 12,
      color: T.dim,
      fontStyle: 'italic',
      marginBottom: 6,
    },
    resultMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    resultStatus: { fontSize: 14, fontWeight: '700' },
    resultDuration: { fontSize: 14, fontWeight: '700' },
    resultStats: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 8,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.08)',
    },
    resultStatItem: { fontSize: 11, color: T.dim, fontWeight: '600' },
    jsonBlock: {
      backgroundColor: T.bg,
      borderRadius: 8,
      padding: 10,
      marginTop: 4,
    },
    jsonText: {
      fontSize: 11,
      color: T.accentGlow,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      lineHeight: 16,
    },
  });
