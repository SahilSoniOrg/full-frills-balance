import { SubmitFooter } from '@/src/components/forms/SubmitFooter';
import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import { Spacing } from '@/src/constants';
import React from 'react';
import { ScrollViewProps, StyleSheet, View } from 'react-native';

type SubmitAction = {
  label: string;
  onPress: () => void;
  disabled: boolean;
  requirementHint?: string | null;
};

type EntityFormScreenProps = {
  chrome: ScreenChrome;
  scrollProps?: Omit<
    ScrollViewProps,
    'style' | 'contentContainerStyle' | 'showsVerticalScrollIndicator'
  >;
  submitAction: SubmitAction;
  children: React.ReactNode;
};

export function EntityFormScreen({
  chrome,
  scrollProps,
  submitAction,
  children,
}: EntityFormScreenProps) {
  return (
    <ScreenWithChrome
      chrome={chrome}
      edges={['top', 'left', 'right']}
      scrollable
      keyboardAvoiding
      footer={
        <View style={styles.footerStack}>
          <SubmitFooter
            onPress={submitAction.onPress}
            label={submitAction.label}
            disabled={submitAction.disabled}
            requirementHint={submitAction.requirementHint}
          />
        </View>
      }
      scrollViewProps={{
        contentContainerStyle: styles.content,
        ...scrollProps,
      }}
    >
      {children}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  // Rows and hero fields own horizontal gutters; the carousel spans the width.
  content: {
    paddingVertical: Spacing.lg,
  },
  footerStack: {
    backgroundColor: 'transparent',
  },
});
