import { GEMMA_3N_E2B_IT_INT4, GEMMA_4_E2B_IT } from 'react-native-litert-lm';
import { Platform, StyleSheet } from 'react-native';

export type ChatMsg = { role: 'user' | 'model'; text: string };
export type ModelKey = 'gemma4' | 'gemma3n';
export type TabKey = 'chat' | 'benchmark';

export interface BenchmarkResult {
  transcript: string;
  success: boolean;
  duration: number;
  tokensPerSecond: number;
  completionTokens: number;
  timeToFirstToken: number;
  rawResponse: string;
  parsed: unknown;
}

export const MODELS: Record<ModelKey, { label: string; url: string }> = {
  gemma4: { label: 'Gemma 4 E2B', url: GEMMA_4_E2B_IT },
  gemma3n: { label: 'Gemma 3n E2B', url: GEMMA_3N_E2B_IT_INT4 },
};

export const TEST_TRANSCRIPTS = [
  'spent 250 rs for coffee at starbucks using hdfc card',
  'received 50000 salary from acme corp',
  'refund 1200 from amazon to sbi bank',
  'transfer 5000 from savings to wallet',
];

export function tryParseJSON(text: string): unknown {
  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export type AiExampleTokens = {
  bg: string;
  surface: string;
  card: string;
  elevated: string;
  accent: string;
  accentGlow: string;
  success: string;
  warning: string;
  error: string;
  cyan: string;
  text: string;
  dim: string;
  border: string;
  onPrimary: string;
};

export type AiExampleStyles = ReturnType<typeof getAiExampleStyles>;

export const getAiExampleStyles = (T: AiExampleTokens) =>
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
