/**
 * AiExampleView — DEV shell for litert-lm chat + transaction parse benchmark.
 * Chat and benchmark panels own their local state; this file owns model session chrome.
 */

import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import { AiExampleBenchmarkPanel } from '@/src/features/journal/components/AiExampleBenchmarkPanel';
import { AiExampleChatPanel } from '@/src/features/journal/components/AiExampleChatPanel';
import {
  getAiExampleStyles,
  MODELS,
  ModelKey,
  TabKey,
} from '@/src/features/journal/components/aiExampleShared';
import { useTheme } from '@/src/hooks/use-theme';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { checkBackendSupport, useModel } from 'react-native-litert-lm';

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

  const s = useMemo(() => getAiExampleStyles(T), [T]);

  const [sel, setSel] = useState<ModelKey>('gemma4');
  const [backend, setBackend] = useState<'cpu' | 'gpu'>('cpu');
  const [tab, setTab] = useState<TabKey>('chat');

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

  const stats = model && isReady ? model.getStats() : null;
  const isDownloading = downloadProgress > 0 && downloadProgress < 1;
  const isLoading = downloadProgress === 1 && !isReady;
  const canInteract = !isReady && !isDownloading && !isLoading;
  const gpuWarning = useMemo(() => checkBackendSupport('gpu'), []);

  return (
    <ScreenWithChrome chrome={chrome} style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.title}>
          Example <Text style={{ color: T.accent }}>Replica</Text>
        </Text>
        <Text style={s.subtitle}>
          Direct litert-lm • {Platform.OS === 'ios' ? 'Metal' : backend.toUpperCase()}
        </Text>
      </View>

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
        {(['cpu', 'gpu'] as const).map(b => (
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
        ))}
      </View>
      {backend === 'gpu' && !!gpuWarning && (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: T.warning, lineHeight: 16 }}>⚠️ {gpuWarning}</Text>
        </View>
      )}

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

      {tab === 'chat' && (
        <AiExampleChatPanel model={model} isReady={isReady} selectedModel={sel} T={T} s={s} />
      )}

      {tab === 'benchmark' && isReady && <AiExampleBenchmarkPanel model={model} T={T} s={s} />}
    </ScreenWithChrome>
  );
}
