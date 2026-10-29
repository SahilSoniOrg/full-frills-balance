import { IconButton, AppText, Icon } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ExplanationContextItem {
  label: string;
  value: string;
}

interface ContextualExplanationProps {
  title: string;
  meaning: string;
  interpretation: string;
  unit: string;
  context: readonly ExplanationContextItem[];
  dataNotes?: readonly string[];
  accessibilityLabel?: string;
  testID?: string;
}

export function ContextualExplanation({
  title,
  meaning,
  interpretation,
  unit,
  context,
  dataNotes = [],
  accessibilityLabel,
  testID,
}: ContextualExplanationProps) {
  const [visible, setVisible] = useState(false);
  const close = () => setVisible(false);
  const triggerLabel = accessibilityLabel ?? `Explain ${title}`;

  return (
    <>
      <IconButton
        name={Icon.Info}
        variant="clear"
        size={Size.iconXs}
        accessibilityLabel={triggerLabel}
        onPress={() => setVisible(true)}
        testID={testID}
      />
      {visible ? (
        <InfoSheet
          visible
          title={title}
          onClose={close}
          position="bottomSheet"
          fixedHeight={false}
          maxHeightPercent={AppConfig.layout.popupModalHeightPercent}
          accessibilityCloseLabel={`Close ${title} explanation`}
          contentTestID={testID ? `${testID}-content` : undefined}
        >
          <View style={styles.content}>
            <ExplanationBlock title="What it measures" text={meaning} />
            <ExplanationBlock title="How to read it" text={interpretation} />
            <View style={styles.context}>
              <AppText variant="caption" color="secondary" weight="semibold">
                Selected scope and units
              </AppText>
              {context.map(item => (
                <View key={item.label} style={styles.contextRow}>
                  <AppText variant="caption" color="secondary">
                    {item.label}
                  </AppText>
                  <AppText variant="caption" align="right" style={styles.contextValue}>
                    {item.value}
                  </AppText>
                </View>
              ))}
              <View style={styles.contextRow}>
                <AppText variant="caption" color="secondary">
                  Units
                </AppText>
                <AppText variant="caption" align="right" style={styles.contextValue}>
                  {unit}
                </AppText>
              </View>
            </View>
            {dataNotes.length > 0 ? (
              <View style={styles.notes}>
                <AppText variant="caption" color="secondary" weight="semibold">
                  Data notes
                </AppText>
                {dataNotes.map(note => (
                  <AppText key={note} variant="caption" color="secondary">
                    {note}
                  </AppText>
                ))}
              </View>
            ) : null}
          </View>
        </InfoSheet>
      ) : null}
    </>
  );
}

function ExplanationBlock({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.block}>
      <AppText variant="caption" color="secondary" weight="semibold">
        {title}
      </AppText>
      <AppText variant="body">{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingBottom: Spacing.sm },
  block: { gap: Spacing.xs },
  context: { gap: Spacing.sm },
  contextRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  contextValue: { flex: 1 },
  notes: { gap: Spacing.xs },
});
