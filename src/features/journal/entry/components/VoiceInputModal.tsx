import { Icon, AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Shape, Size, Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import {
  useVoiceJournalParse,
  type VoiceJournalApplyParams,
} from '@/src/features/journal/entry/hooks/useVoiceJournalParse';
import { useVoiceVisualizer } from '@/src/features/journal/entry/hooks/useVoiceVisualizer';
import { useTheme } from '@/src/hooks/use-theme';
import { WorkplaceId } from '@/src/types/ids';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

interface VoiceInputModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (params: VoiceJournalApplyParams) => void;
  workplaceId: WorkplaceId;
}

const PREDEFINED_TEMPLATES = [
  '120 rupees for tea at tapri from cash',
  '1500 rs for groceries from hdfc credit card',
  '50000 rupees for salary received from acme corporation',
  '2500 rs for electricity using sbi bank',
  '450 usd for iphone using chase card',
];

/**
 * Voice capture sheet. Uses ModalSurface Moti enter; keeps RN Animated for the
 * waveform (volume bars) — that path is not Moti and stays outside Moti nesting
 * that would re-drive the visualizer.
 */
export function VoiceInputModal({ visible, onClose, onApply, workplaceId }: VoiceInputModalProps) {
  const { theme } = useTheme();

  const { animValues, onVolumeChange, setRecording } = useVoiceVisualizer();

  const {
    transcription,
    setTranscription,
    isRecording,
    isParsing,
    parserOutput,
    startRecording,
    stopRecording,
    parseTranscription,
    selectTemplate,
    applyParsedResult,
  } = useVoiceJournalParse({
    workplaceId,
    visible,
    onApply,
    onClose,
    onVolumeChange,
  });

  useEffect(() => {
    setRecording(isRecording);
  }, [isRecording, setRecording]);

  return (
    <ModalSurface
      visible={visible}
      title="Voice Input"
      onClose={onClose}
      position="bottomSheet"
      fixedHeight
      scrollable
      maxHeightPercent={85}
      accessibilityCloseLabel="Close voice input"
      footer={
        <View style={styles.footerActions}>
          <AppButton
            variant="primary"
            disabled={!parserOutput || isParsing}
            onPress={applyParsedResult}
          >
            Confirm & Apply
          </AppButton>
        </View>
      }
    >
      <AppText variant="caption" color="secondary" style={styles.intro}>
        Speak naturally to record an entry
      </AppText>

      <View style={styles.visualizerContainer}>
        <View style={[styles.visualizerBacking, { backgroundColor: theme.surfaceSecondary }]}>
          {isRecording ? (
            <TouchableOpacity onPress={stopRecording} style={styles.barGroup}>
              {animValues.map((anim, idx) => (
                <Animated.View
                  key={idx}
                  style={[
                    styles.waveformBar,
                    {
                      backgroundColor: theme.primary,
                      transform: [{ scaleY: anim }],
                    },
                  ]}
                />
              ))}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={startRecording}
              style={[styles.micIconTouch, { backgroundColor: theme.primary }]}
            >
              <AppIcon name={Icon.Mic} size={28} color={theme.onPrimary} />
            </TouchableOpacity>
          )}
        </View>

        <AppText variant="caption" color="secondary" style={styles.recordingStateLabel}>
          {isRecording
            ? 'Listening... Tap to stop speaking.'
            : 'Tap the microphone to start speaking.'}
        </AppText>
      </View>

      <Separator style={styles.divider} />

      <View style={styles.section}>
        <AppText variant="caption" weight="bold" color="secondary" style={styles.sectionLabel}>
          Voice Transcript
        </AppText>
        <View style={styles.inputContainer}>
          <AppInput
            value={transcription}
            onChangeText={setTranscription}
            placeholder="e.g. 250 rupees for coffee at starbucks using icici credit"
            multiline
            flex={1}
            width="auto"
            style={styles.textArea}
          />
          <View style={styles.parseActionsGroup}>
            {transcription.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => void parseTranscription(transcription)}
                disabled={isParsing}
                style={[
                  styles.parseTextTouch,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <AppText variant="caption" weight="bold" color="primary">
                  {isParsing ? '...' : 'Auto'}
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <AppText variant="caption" weight="bold" color="secondary" style={styles.sectionLabel}>
          Try These Templates
        </AppText>
        <View style={styles.templateList}>
          {PREDEFINED_TEMPLATES.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => selectTemplate(item)}
              style={[
                styles.templateRow,
                {
                  backgroundColor: theme.surfaceSecondary,
                  borderColor: theme.border,
                },
              ]}
            >
              <AppIcon name={Icon.Sparkles} size={14} color={theme.primary} />
              <AppText
                variant="caption"
                color="primary"
                weight="medium"
                style={styles.templateText}
              >
                &quot;{item}&quot;
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isParsing && (
        <View style={styles.resolutionContainer}>
          <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Resolving with on-device AI...
          </AppText>
          <ActivityIndicator
            size="small"
            color={theme.primary}
            style={{ marginTop: Spacing.sm }}
          />
        </View>
      )}

      {!isParsing && parserOutput && parserOutput.transactions.length > 0 && (
        <View
          style={[
            styles.resolutionContainer,
            {
              backgroundColor: theme.surfaceSecondary,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.resolutionTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
              <AppText variant="subheading" weight="bold">
                {parserOutput.isHighConfidence ? 'Auto-Resolved Output' : 'Suggested Resolution'}
              </AppText>
              {parserOutput.provider === 'ai' && (
                <View
                  style={{
                    backgroundColor: theme.primary + '20',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <AppText variant="caption" weight="bold" style={{ color: theme.primary }}>
                    NATIVE AI
                  </AppText>
                </View>
              )}
            </View>
            <View
              style={[
                styles.directionBadge,
                {
                  backgroundColor:
                    parserOutput.transactions[0].type === 'income'
                      ? theme.success + '20'
                      : theme.error + '20',
                },
              ]}
            >
              <AppText
                variant="caption"
                weight="bold"
                style={{
                  color:
                    parserOutput.transactions[0].type === 'income'
                      ? theme.success
                      : theme.error,
                }}
              >
                {parserOutput.transactions[0].type === 'income' ? 'Income (+)' : 'Expense (-)'}
              </AppText>
            </View>
          </View>

          <Separator style={{ marginVertical: Spacing.sm }} />

          <View style={styles.resolutionGrid}>
            <View style={styles.gridRow}>
              <AppText variant="caption" color="secondary">
                Amount
              </AppText>
              <AppText variant="body" weight="semibold">
                {parserOutput.transactions[0].amount
                  ? `${parserOutput.transactions[0].currencyCode || 'INR'} ${parserOutput.transactions[0].amount}`
                  : 'Not detected'}
              </AppText>
            </View>

            <View style={styles.gridRow}>
              <AppText variant="caption" color="secondary">
                Merchant / Note
              </AppText>
              <AppText variant="body" weight="semibold">
                {parserOutput.transactions[0].categoryNameHint ||
                  parserOutput.transactions[0].description ||
                  'Not detected'}
              </AppText>
            </View>

            <View style={styles.gridRow}>
              <AppText variant="caption" color="secondary">
                {parserOutput.transactions[0].type === 'income'
                  ? 'Resolved Asset (Destination)'
                  : 'Resolved Asset (Source)'}
              </AppText>
              <View style={styles.resolvedAccountBox}>
                <AppIcon name={Icon.CreditCard} size={14} color={theme.textSecondary} />
                <AppText variant="body" weight="bold">
                  {parserOutput.transactions[0].accountNameHint || 'Default account'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridRow}>
              <AppText variant="caption" color="secondary">
                {parserOutput.transactions[0].type === 'income'
                  ? 'Resolved Category (Source)'
                  : 'Resolved Category (Destination)'}
              </AppText>
              <View style={styles.resolvedAccountBox}>
                <AppIcon name={Icon.Tag} size={14} color={theme.textSecondary} />
                <AppText variant="body" weight="bold">
                  {parserOutput.transactions[0].categoryNameHint || 'Default category'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridRow}>
              <AppText variant="caption" color="secondary">
                Processing Time
              </AppText>
              <AppText variant="body" weight="semibold">
                {parserOutput.processTimeMs ? `${parserOutput.processTimeMs}ms` : '--'}
              </AppText>
            </View>

            <View style={styles.gridRow}>
              <AppText variant="caption" color="secondary">
                Confidence Rating
              </AppText>
              <AppText
                variant="caption"
                weight="bold"
                style={{
                  color:
                    parserOutput.confidenceScore > 0.8
                      ? theme.success
                      : parserOutput.confidenceScore > 0.6
                        ? theme.warning
                        : theme.textSecondary,
                }}
              >
                {Math.round(parserOutput.confidenceScore * 100)}%
              </AppText>
            </View>
          </View>
        </View>
      )}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  intro: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  visualizerContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  visualizerBacking: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  micIconTouch: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    gap: 6,
  },
  waveformBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  recordingStateLabel: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  divider: {
    marginVertical: Spacing.sm,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    marginLeft: Spacing.xs,
    textTransform: 'uppercase',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  parseActionsGroup: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  textArea: {
    flex: 1,
    minHeight: Size.inputMd,
  },
  parseTextTouch: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.md,
  },
  templateList: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  templateText: {
    flex: 1,
  },
  resolutionContainer: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
  },
  resolutionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  directionBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Shape.radius.full,
  },
  resolutionGrid: {
    gap: Spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resolvedAccountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerActions: {
    width: '100%',
  },
});
