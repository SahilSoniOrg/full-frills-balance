import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface ReportChartCardProps {
  title?: string;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
  zIndex?: number;
  style?: StyleProp<ViewStyle>;
}

export function ReportChartCard({
  title,
  children,
  headerContent,
  zIndex = 1,
  style,
}: ReportChartCardProps) {
  return (
    <>
      {title && <ScreenSectionHeader title={title} style={styles.sectionTitle} />}
      <AppCard style={[styles.chartCard, { zIndex, overflow: 'visible' }, style]} paddingSize="lg">
        {headerContent && <View style={styles.headerRow}>{headerContent}</View>}
        {children}
      </AppCard>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  chartCard: {
    marginBottom: Spacing.xl,
  },
  headerRow: {
    marginBottom: Spacing.lg,
  },
});
