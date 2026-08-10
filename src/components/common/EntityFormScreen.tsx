import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppButton } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import { Shape, Spacing } from '@/src/constants';
import React from 'react';
import { ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Edge } from 'react-native-safe-area-context';

type SubmitAction = {
  label: string;
  onPress: () => void;
  disabled: boolean;
  topSlot?: React.ReactNode;
};

type SecondaryAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'destructive-outline';
  disabled?: boolean;
  testID?: string;
};

type EntityFormScreenProps = {
  chrome: ScreenChrome;
  edges?: Edge[];
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<
    ScrollViewProps,
    'style' | 'contentContainerStyle' | 'showsVerticalScrollIndicator'
  >;
  intro?: React.ReactNode;
  submitAction: SubmitAction;
  secondaryAction?: SecondaryAction;
  children: React.ReactNode;
};

export function EntityFormScreen({
  chrome,
  edges,
  contentContainerStyle,
  scrollProps,
  intro,
  submitAction,
  secondaryAction,
  children,
}: EntityFormScreenProps) {
  return (
    <ScreenWithChrome
      chrome={chrome}
      edges={edges}
      scrollable
      keyboardAvoiding
      footer={
        <View style={styles.footerStack}>
          <SubmitFooter
            onPress={submitAction.onPress}
            label={submitAction.label}
            disabled={submitAction.disabled}
            topSlot={submitAction.topSlot}
          />
          {secondaryAction ? (
            <View style={styles.secondaryActionContainer}>
              <AppButton
                variant={secondaryAction.variant || 'outline'}
                onPress={secondaryAction.onPress}
                disabled={secondaryAction.disabled}
                style={styles.secondaryActionButton}
                testID={secondaryAction.testID}
              >
                {secondaryAction.label}
              </AppButton>
            </View>
          ) : null}
        </View>
      }
      scrollViewProps={{
        contentContainerStyle,
        ...scrollProps,
      }}
    >
      {intro}
      {children}
    </ScreenWithChrome>
  );
}

const styles = StyleSheet.create({
  footerStack: {
    backgroundColor: 'transparent',
  },
  secondaryActionContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  secondaryActionButton: {
    width: '100%',
    borderRadius: Shape.radius.full,
  },
});
