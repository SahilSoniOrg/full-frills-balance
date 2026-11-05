import { AppText, PressScaleTouchable } from '@/src/components/core';
import { AppConfig, MatcherPhraseColors, Opacity, Size, Spacing } from '@/src/constants';
import type { Theme } from '@/src/constants/design-tokens';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import type { SmsTextSpan } from '@/src/services/journal/smsTextSpans';
import {
  mergeSelectedSmsWordSpans,
  selectedSmsWordIndexes,
  splitSmsTextBySpans,
  tokenizeSmsWords,
} from '@/src/services/journal/smsTextSpans';
import { useTheme } from '@/src/hooks/use-theme';
import { blendColors, getReadableColor } from '@/src/utils/color-math';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

function phraseHighlight(theme: Theme, index: number) {
  const accent = MatcherPhraseColors[index] ?? theme.error;
  const backgroundColor = blendColors(accent, theme.surfaceSecondary, Opacity.active);
  return { backgroundColor, color: getReadableColor(accent, backgroundColor) };
}

export function SelectableSmsText({
  body,
  selectedSpans,
  onChange,
  privateMode = false,
}: {
  body: string;
  selectedSpans: readonly SmsTextSpan[];
  onChange: (spans: SmsTextSpan[]) => void;
  privateMode?: boolean;
}) {
  const { theme } = useTheme();
  const [originalBody, setOriginalBody] = useState<string | null>(null);
  const tokens = tokenizeSmsWords(body);
  const selectedIndexes = selectedSmsWordIndexes(tokens, selectedSpans);
  const hasSelection = selectedSpans.length > 0;
  const showPattern = hasSelection && originalBody !== body;
  const maxPhrases = AppConfig.input.sms.maxAccountMatcherFragments;
  const isOverLimit = selectedSpans.length > maxPhrases;

  if (privateMode) {
    return <AppText testID="selectable-sms-private">{copy.privateMessage}</AppText>;
  }

  const wordChunks = splitSmsTextBySpans(body, tokens);
  const wordsByStart = new Map(tokens.map(token => [token.start, token]));
  const renderWords = (start: number, end: number, highlighted: boolean, color?: string) =>
    wordChunks
      .filter(chunk => chunk.start < end && chunk.end > start)
      .map(chunk => {
        const text = body.slice(Math.max(start, chunk.start), Math.min(end, chunk.end));
        const token = wordsByStart.get(chunk.start);
        if (!token) return text; // Spaces and punctuation inherit the phrase's continuous fill.
        const selected = highlighted || selectedIndexes.has(token.index);
        return (
          <AppText
            key={`word-${token.index}`}
            onPress={() => {
              if (!hasSelection) setOriginalBody(body);
              const next = new Set(selectedIndexes);
              if (selected) next.delete(token.index);
              else next.add(token.index);
              onChange(mergeSelectedSmsWordSpans(tokens, next));
            }}
            accessibilityRole="button"
            accessibilityLabel={
              selected ? copy.deselectWord(token.text) : copy.selectWord(token.text)
            }
            accessibilityState={{ selected }}
            testID={
              chunk.start >= start ? `sms-word-${token.index}` : `sms-word-${token.index}-suffix`
            }
            style={highlighted ? { color } : undefined}
            weight={highlighted ? 'semibold' : 'regular'}
          >
            {text}
          </AppText>
        );
      });
  // Render the actual required fragments, not a second set of per-word rectangles.
  // This preserves visible phrase boundaries, including spaces and punctuation.
  const phraseChunks = splitSmsTextBySpans(body, selectedSpans);
  const phraseIndices = new Map(selectedSpans.map((span, index) => [span.start, index]));

  return (
    <View>
      <AppText variant="body" testID="selectable-sms-text">
        {phraseChunks.map(chunk => {
          if (showPattern && !chunk.highlighted && tokenizeSmsWords(chunk.text).length) {
            return (
              <AppText
                key={`variable-${chunk.start}`}
                onPress={() => setOriginalBody(body)}
                accessibilityRole="button"
                accessibilityLabel={copy.revealVariableText}
                accessibilityHint={copy.variableText}
                testID={`sms-variable-${chunk.start}`}
                color="secondary"
                weight="medium"
              >
                {' XXX '}
              </AppText>
            );
          }
          const highlight = chunk.highlighted
            ? phraseHighlight(theme, phraseIndices.get(chunk.start) ?? 0)
            : undefined;
          return (
            <AppText
              key={`phrase-${chunk.start}`}
              testID={chunk.highlighted ? `sms-phrase-${chunk.start}` : undefined}
              style={highlight}
              weight={chunk.highlighted ? 'semibold' : 'regular'}
            >
              {renderWords(chunk.start, chunk.end, chunk.highlighted, highlight?.color)}
            </AppText>
          );
        })}
      </AppText>
      {hasSelection ? (
        <PressScaleTouchable
          onPress={() => setOriginalBody(showPattern ? body : null)}
          accessibilityRole="button"
          accessibilityLabel={showPattern ? copy.showOriginalMessage : copy.showPattern}
          style={styles.modeButton}
          testID="toggle-sms-pattern"
        >
          <AppText variant="bodySmall" color="primary" weight="medium">
            {showPattern ? copy.showOriginalMessage : copy.showPattern}
          </AppText>
        </PressScaleTouchable>
      ) : null}
      <View style={styles.selectionTools}>
        <AppText
          variant="caption"
          color={isOverLimit ? 'error' : 'secondary'}
          style={styles.selectionHint}
          accessibilityLabel={copy.selectedPhrases(selectedSpans.length)}
          accessibilityLiveRegion="polite"
        >
          {hasSelection
            ? copy.phraseLimitCount(selectedSpans.length, maxPhrases)
            : copy.selectWordsHint}
        </AppText>
        {hasSelection ? (
          <PressScaleTouchable
            onPress={() => {
              setOriginalBody(body);
              onChange([]);
            }}
            accessibilityRole="button"
            accessibilityLabel={copy.clearSelection}
            style={styles.clearButton}
            testID="clear-sms-word-selection"
          >
            <AppText variant="caption" color="primary" weight="medium">
              {copy.clearSelection}
            </AppText>
          </PressScaleTouchable>
        ) : null}
      </View>
      {isOverLimit ? (
        <AppText
          variant="caption"
          color="error"
          accessibilityRole="alert"
          testID="sms-phrase-limit-error"
        >
          {copy.phraseLimitError(maxPhrases)}
        </AppText>
      ) : null}
      {showPattern ? (
        <AppText variant="caption" color="secondary">
          {copy.patternHint}
        </AppText>
      ) : null}
    </View>
  );
}

export function SmsPhraseList({
  phrases,
  privateMode,
}: {
  phrases: readonly string[];
  privateMode: boolean;
}) {
  const { theme } = useTheme();
  if (privateMode) return <AppText variant="bodySmall">{copy.privateMessage}</AppText>;
  return (
    <View style={styles.phrases}>
      {phrases.map((phrase, index) => (
        <View key={index} style={styles.phrase}>
          <AppText variant="caption" color="secondary" tabular style={styles.phraseNumber}>
            {index + 1}
          </AppText>
          <AppText variant="bodySmall" style={styles.phraseText}>
            <AppText variant="bodySmall" weight="semibold" style={phraseHighlight(theme, index)}>
              {phrase}
            </AppText>
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function SmsBodyPreview({
  body,
  spans,
  privateMode = false,
}: {
  body: string;
  spans: readonly SmsTextSpan[];
  privateMode?: boolean;
}) {
  const { theme } = useTheme();
  if (privateMode) return <AppText variant="bodySmall">{copy.privateMessage}</AppText>;

  const phraseIndices = new Map(spans.map((span, index) => [span.start, index]));
  return (
    <AppText variant="bodySmall">
      {splitSmsTextBySpans(body, spans).map((chunk, index) => (
        <AppText
          key={index}
          variant="bodySmall"
          style={
            chunk.highlighted
              ? phraseHighlight(theme, phraseIndices.get(chunk.start) ?? 0)
              : undefined
          }
          weight={chunk.highlighted ? 'semibold' : 'regular'}
        >
          {chunk.text}
        </AppText>
      ))}
    </AppText>
  );
}

const styles = StyleSheet.create({
  phrases: { gap: Spacing.sm },
  phrase: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  phraseNumber: { minWidth: Size.iconXs },
  phraseText: { flex: 1, minWidth: 0 },
  modeButton: { minHeight: Size.touchTarget, alignSelf: 'flex-start', justifyContent: 'center' },
  selectionTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  selectionHint: { flex: 1, minWidth: 0 },
  clearButton: {
    minHeight: Size.touchTarget,
    minWidth: Size.touchTarget,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingLeft: Spacing.sm,
  },
});
