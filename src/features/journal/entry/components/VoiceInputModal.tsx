import { AppButton, AppIcon, AppInput, AppText, IconButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { transactionIngestionService } from '../../services/TransactionIngestionService';
import { ParserOutput } from '../../types/ai-parsing';

interface VoiceInputModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (params: {
    amount?: number;
    merchantName?: string;
    direction: 'debit' | 'credit' | 'unknown';
    transactionType?: 'expense' | 'income' | 'transfer';
    sourceAccountId: AccountId;
    categoryAccountId: AccountId;
    transcription: string;
  }) => void;
  workplaceId: WorkplaceId;
}

const PREDEFINED_TEMPLATES = [
  '120 rupees for tea at tapri from cash',
  '1500 rs for groceries from hdfc credit card',
  '50000 rupees for salary received from acme corporation',
  '2500 rs for electricity using sbi bank',
  '450 usd for iphone using chase card',
];

export function VoiceInputModal({ visible, onClose, onApply, workplaceId }: VoiceInputModalProps) {
  const { theme } = useTheme();
  const { isNativeAiEnabled } = useUI();
  const insets = useSafeAreaInsets();

  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parserOutput, setParserOutput] = useState<ParserOutput | null>(null);

  // Real-time voice events
  useSpeechRecognitionEvent('start', () => setIsRecording(true));
  useSpeechRecognitionEvent('end', () => setIsRecording(false));
  useSpeechRecognitionEvent('result', event => {
    const text = event.results[0]?.transcript || '';
    setTranscription(text);
  });
  useSpeechRecognitionEvent('error', event => {
    logger.error('[VoiceInputModal] Speech recognition error', event.error);
    setIsRecording(false);
  });

  // Vertical bar visualizer driven by real volume
  useSpeechRecognitionEvent('volumechange', event => {
    // Value is typically -2 to 10. Normalize to a scale factor.
    const volume = event.value;
    const scale = Math.max(1, (volume + 2) / 3); // Map to ~1.0 to 4.0

    animValues.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: scale * (0.8 + Math.random() * 0.4), // Add some variation per bar
        useNativeDriver: true,
        friction: 7,
        tension: 40,
      }).start();
    });
  });

  // Animated bars for voice pulsing visualizer
  const animValues = useRef([
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
    new Animated.Value(1),
  ]).current;

  const animLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRecording) {
      // Start looping animation for the vertical visualizer bars
      const animations = animValues.map((anim, index) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 2.5 + Math.sin(index) * 0.8,
              duration: 350 + index * 80,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.6,
              duration: 350 + index * 80,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        );
      });

      animLoopRef.current = Animated.parallel(animations);
      animLoopRef.current.start();
    } else {
      if (animLoopRef.current) {
        animLoopRef.current.stop();
      }
      animValues.forEach(anim => {
        Animated.spring(anim, {
          toValue: 1.0,
          useNativeDriver: true,
        }).start();
      });
    }

    return () => {
      if (animLoopRef.current) {
        animLoopRef.current.stop();
      }
    };
  }, [isRecording, animValues]);

  // Reset local state when opened/closed
  useEffect(() => {
    if (!visible) return;
    setTranscription('');
    setIsRecording(false);
    setIsParsing(false);
    setParserOutput(null);
  }, [visible]);

  const handleStartRecording = async () => {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      logger.warn('[VoiceInputModal] Speech permissions denied');
      return;
    }

    setParserOutput(null);
    setTranscription('');

    ExpoSpeechRecognitionModule.start({
      lang: 'en-IN', // Indian English is common for this userbase
      interimResults: true,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 50,
      },
    });
  };

  const handleStopRecording = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  const triggerExtraction = async (textToParse: string, forceAi: boolean = false) => {
    if (!textToParse.trim()) return;
    setIsParsing(true);
    Keyboard.dismiss();

    try {
      const output = await transactionIngestionService.ingest(textToParse, workplaceId, forceAi);
      setParserOutput(output);
    } catch (err) {
      logger.error('[VoiceInputModal] Extraction failed', err);
      setParserOutput(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSelectTemplate = (template: string) => {
    setTranscription(template);
    triggerExtraction(template);
  };

  const handleApply = () => {
    if (!parserOutput || parserOutput.transactions.length === 0) return;
    const result = parserOutput.transactions[0];

    onApply({
      amount: result.amount,
      merchantName: result.categoryNameHint || result.description,
      direction: result.type === 'income' ? 'credit' : 'debit',
      transactionType:
        result.type === 'unknown' ? undefined : (result.type as 'expense' | 'income' | 'transfer'),
      sourceAccountId: (result.accountId as AccountId) || ('' as AccountId),
      categoryAccountId: (result.categoryId as AccountId) || ('' as AccountId),
      transcription: transcription.trim(),
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.content,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <IconButton name="close" onPress={onClose} />
            <View style={styles.headerTitle}>
              <AppText variant="subheading" weight="bold">
                Voice Input Parser
              </AppText>
              <AppText variant="caption" color="secondary">
                Speech to Ledger Resolution
              </AppText>
            </View>
            <View style={{ width: Size.md + Spacing.md }} />
          </View>

          <ScrollView
            style={styles.scrollableArea}
            contentContainerStyle={styles.scrollableContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Pulsing Visualizer Section */}
            <View style={styles.visualizerContainer}>
              <View style={[styles.visualizerBacking, { backgroundColor: theme.surfaceSecondary }]}>
                {isRecording ? (
                  <TouchableOpacity onPress={handleStopRecording} style={styles.barGroup}>
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
                    onPress={handleStartRecording}
                    style={[styles.micIconTouch, { backgroundColor: theme.primary }]}
                  >
                    <AppIcon name="mic" size={28} color={theme.onPrimary} />
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

            {/* Input & Examples Section */}
            <View style={styles.section}>
              <AppText
                variant="caption"
                weight="bold"
                color="secondary"
                style={styles.sectionLabel}
              >
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
                      onPress={() => triggerExtraction(transcription)}
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
                  {isNativeAiEnabled && transcription.trim().length > 0 && (
                    <TouchableOpacity
                      onPress={() => triggerExtraction(transcription, true)}
                      disabled={isParsing}
                      style={[styles.parseTextTouch, { backgroundColor: theme.primary }]}
                    >
                      <AppIcon
                        name="sparkles"
                        size={12}
                        color={theme.onPrimary}
                        style={{ marginRight: 4 }}
                      />
                      <AppText variant="caption" weight="bold" style={{ color: theme.onPrimary }}>
                        {isParsing ? '...' : 'AI'}
                      </AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <AppText
                variant="caption"
                weight="bold"
                color="secondary"
                style={styles.sectionLabel}
              >
                Try These Templates
              </AppText>
              <View style={styles.templateList}>
                {PREDEFINED_TEMPLATES.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleSelectTemplate(item)}
                    style={[
                      styles.templateRow,
                      {
                        backgroundColor: theme.surfaceSecondary,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <AppIcon name="sparkles" size={14} color={theme.primary} />
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

            {/* Parsing Result Dash */}
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
                      {parserOutput.isHighConfidence
                        ? 'Auto-Resolved Output'
                        : 'Suggested Resolution'}
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
                      {parserOutput.transactions[0].type === 'income'
                        ? 'Income (+)'
                        : 'Expense (-)'}
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
                      <AppIcon name="creditCard" size={14} color={theme.textSecondary} />
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
                      <AppIcon name="tag" size={14} color={theme.textSecondary} />
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
          </ScrollView>

          {/* Actions */}
          <Separator style={styles.divider} />
          <View style={styles.footerActions}>
            <AppButton
              variant="primary"
              disabled={!parserOutput || isParsing}
              onPress={handleApply}
            >
              Confirm & Apply
            </AppButton>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: Shape.radius.r2,
    borderTopRightRadius: Shape.radius.r2,
    paddingTop: Spacing.md,
    height: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    alignItems: 'center',
    gap: 2,
  },
  scrollableArea: {
    flex: 1,
  },
  scrollableContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
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
    paddingHorizontal: Spacing.lg,
  },
});
