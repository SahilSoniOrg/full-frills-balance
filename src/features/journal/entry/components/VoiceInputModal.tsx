import { AppButton, AppIcon, AppInput, AppText, IconButton } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Separator } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { transactionExtractorRegistry } from '@/src/services/ledger';
import {
  accountResolutionService,
  ResolutionResult,
} from '@/src/services/ledger/AccountResolutionService';
import { ExtractedInfo } from '@/src/services/ledger/TransactionExtractor';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import React, { useEffect, useRef, useState } from 'react';
import {
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

interface VoiceInputModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (params: {
    amount?: number;
    merchantName?: string;
    direction: 'debit' | 'credit' | 'unknown';
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
  const insets = useSafeAreaInsets();

  const [transcription, setTranscription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedInfo | null>(null);
  const [resolution, setResolution] = useState<ResolutionResult | null>(null);

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
    setExtractedInfo(null);
    setResolution(null);
  }, [visible]);

  const handleStartSimulatedSpeech = () => {
    setIsRecording(true);
    setExtractedInfo(null);
    setResolution(null);
    setTranscription('');

    // Simulate raw audio capturing over a brief period
    setTimeout(() => {
      setIsRecording(false);
      // Default to a random pre-canned template as simulated capture
      const randomTemplate =
        PREDEFINED_TEMPLATES[Math.floor(Math.random() * PREDEFINED_TEMPLATES.length)];
      setTranscription(randomTemplate);
      triggerExtraction(randomTemplate);
    }, 2200);
  };

  const triggerExtraction = async (textToParse: string) => {
    if (!textToParse.trim()) return;
    setIsParsing(true);
    Keyboard.dismiss();

    try {
      // 1. Run text through unified Voice Extractor
      const rawInput = {
        channel: 'voice' as const,
        id: `voice-${Date.now()}`,
        rawText: textToParse,
        date: Date.now(),
      };
      const extractor = transactionExtractorRegistry.getExtractorFor(rawInput);
      const parsed = await extractor.extract(rawInput);

      setExtractedInfo(parsed);

      // 2. Resolve entities in workspace
      const resolved = await accountResolutionService.resolve({
        sourceHint: parsed.sourceAccountHint,
        destinationHint: parsed.destinationCategoryHint,
        direction: parsed.direction,
        workplaceId,
      });

      setResolution(resolved);
    } catch {
      setExtractedInfo(null);
      setResolution(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSelectTemplate = (template: string) => {
    setTranscription(template);
    triggerExtraction(template);
  };

  const handleApply = () => {
    if (!resolution || !extractedInfo) return;
    onApply({
      amount: extractedInfo.amount,
      merchantName: extractedInfo.merchantName,
      direction: extractedInfo.direction,
      sourceAccountId: resolution.sourceAccountId,
      categoryAccountId: resolution.categoryAccountId,
      transcription: transcription.trim(),
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          style={[
            styles.content,
            {
              backgroundColor: theme.background,
              paddingBottom: insets.bottom + Spacing.md,
            },
          ]}
          onPress={e => e.stopPropagation()}
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

          <ScrollView style={styles.scrollableArea} keyboardShouldPersistTaps="handled">
            {/* Pulsing Visualizer Section */}
            <View style={styles.visualizerContainer}>
              <View style={[styles.visualizerBacking, { backgroundColor: theme.surfaceSecondary }]}>
                {isRecording ? (
                  <View style={styles.barGroup}>
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
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleStartSimulatedSpeech}
                    style={[styles.micIconTouch, { backgroundColor: theme.primary }]}
                  >
                    <AppIcon name="mic" size={28} color={theme.onPrimary} />
                  </TouchableOpacity>
                )}
              </View>

              <AppText variant="caption" color="secondary" style={styles.recordingStateLabel}>
                {isRecording
                  ? 'Listening... Speak your transaction clearly.'
                  : 'Tap the microphone to simulate spoken voice input.'}
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
                {transcription.trim().length > 0 && (
                  <TouchableOpacity
                    onPress={() => triggerExtraction(transcription)}
                    disabled={isParsing}
                    style={[styles.parseTextTouch, { backgroundColor: theme.primary }]}
                  >
                    <AppText variant="caption" weight="bold" style={{ color: theme.onPrimary }}>
                      {isParsing ? 'Parsing...' : 'Parse'}
                    </AppText>
                  </TouchableOpacity>
                )}
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
                  Resolving semantic properties...
                </AppText>
              </View>
            )}

            {!isParsing && extractedInfo && resolution && (
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
                  <AppText variant="subheading" weight="bold">
                    Extraction Output
                  </AppText>
                  <View
                    style={[
                      styles.directionBadge,
                      {
                        backgroundColor:
                          extractedInfo.direction === 'credit'
                            ? theme.success + '20'
                            : theme.error + '20',
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{
                        color: extractedInfo.direction === 'credit' ? theme.success : theme.error,
                      }}
                    >
                      {extractedInfo.direction === 'credit' ? 'Income (+)' : 'Expense (-)'}
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
                      {extractedInfo.amount
                        ? `${extractedInfo.currencyCode || 'INR'} ${extractedInfo.amount}`
                        : 'Not detected'}
                    </AppText>
                  </View>

                  <View style={styles.gridRow}>
                    <AppText variant="caption" color="secondary">
                      Merchant / Note
                    </AppText>
                    <AppText variant="body" weight="semibold">
                      {extractedInfo.merchantName || 'Not detected'}
                    </AppText>
                  </View>

                  <View style={styles.gridRow}>
                    <AppText variant="caption" color="secondary">
                      {extractedInfo.direction === 'credit'
                        ? 'Resolved Asset (Destination)'
                        : 'Resolved Asset (Source)'}
                    </AppText>
                    <View style={styles.resolvedAccountBox}>
                      <AppIcon name="creditCard" size={14} color={theme.textSecondary} />
                      <AppText variant="body" weight="bold">
                        {resolution.sourceAccountName || 'Default account'}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.gridRow}>
                    <AppText variant="caption" color="secondary">
                      {extractedInfo.direction === 'credit'
                        ? 'Resolved Category (Source)'
                        : 'Resolved Category (Destination)'}
                    </AppText>
                    <View style={styles.resolvedAccountBox}>
                      <AppIcon name="tag" size={14} color={theme.textSecondary} />
                      <AppText variant="body" weight="bold">
                        {resolution.categoryAccountName || 'Default category'}
                      </AppText>
                    </View>
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
                          resolution.confidence > 0.8
                            ? theme.success
                            : resolution.confidence > 0.6
                              ? theme.warning
                              : theme.textSecondary,
                      }}
                    >
                      {Math.round(resolution.confidence * 100)}% ({resolution.strategyUsed}{' '}
                      strategy)
                    </AppText>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <Separator style={styles.divider} />
          <View style={styles.footerActions}>
            <AppButton variant="primary" disabled={!resolution || isParsing} onPress={handleApply}>
              Confirm & Apply
            </AppButton>
          </View>
        </Pressable>
      </Pressable>
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
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerTitle: {
    alignItems: 'center',
    gap: 2,
  },
  scrollableArea: {
    paddingHorizontal: Spacing.md,
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
