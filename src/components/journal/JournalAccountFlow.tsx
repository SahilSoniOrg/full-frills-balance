import { AppIcon, AppText, Icon } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { JournalEntryLeg } from '@/src/types/journalEntryCard';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { useId, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { JournalEntryFooterRow } from './JournalEntryFooterRow';

type FlowLayout = {
  key: string;
  sourceWidth?: number;
  destinationWidth?: number;
};

type FlowLayoutField = Exclude<keyof FlowLayout, 'key'>;
const inlineConnectorSpace = Size.iconXs + Spacing.xs * 2;
const stackedCueSpace = Size.iconXs + Spacing.xs * 2;

function AccountLeg({
  leg,
  comma = false,
  precedingBackground,
  rowStartBackground,
}: {
  leg: JournalEntryLeg;
  comma?: boolean;
  precedingBackground?: string;
  rowStartBackground?: string;
}) {
  const { getVariantColors, theme } = useTheme();
  const gradientId = useId();
  const [startsRow, setStartsRow] = useState(true);
  const colors = getVariantColors(leg.variant);
  const isSection = leg.role !== 'NEUTRAL';
  const background = isSection ? colors.light : theme.surface;
  const leadingBackground = startsRow ? rowStartBackground : precedingBackground;
  const { accentColor, categoryColor } = resolveAccountAppearance(
    { accountType: leg.variant, color: leg.color },
    theme,
    background,
  );

  return (
    <View
      testID="transaction-account-leg"
      style={[styles.leg, isSection && [styles.section, { backgroundColor: background }]]}
      onLayout={isSection ? event => setStartsRow(event.nativeEvent.layout.x < 1) : undefined}
    >
      {isSection && leadingBackground && leadingBackground !== background && (
        <View
          style={styles.colorTransition}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width="100%" height="100%" accessible={false}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={leadingBackground} />
                <Stop offset="1" stopColor={background} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
        </View>
      )}
      {leg.role !== 'NEUTRAL' && (
        <AppIcon
          name={leg.icon ?? undefined}
          fallbackIcon={leg.fallbackIcon}
          size={Size.xxs}
          color={categoryColor}
          style={styles.icon}
        />
      )}
      <AppText variant="caption" style={[styles.name, { color: accentColor }]}>
        {leg.name}
        {comma ? ',' : ''}
      </AppText>
    </View>
  );
}

function AccountGroup({
  legs,
  role,
  stacked,
  connected,
  width,
  maxWidth,
  onMeasure,
}: {
  legs: JournalEntryLeg[];
  role: 'SOURCE' | 'DESTINATION';
  stacked: boolean;
  connected: boolean;
  width?: number;
  maxWidth?: number;
  onMeasure: (width: number) => void;
}) {
  const { theme, getVariantColors } = useTheme();
  const isSource = role === 'SOURCE';
  const cueSpace = stacked && connected && !isSource ? stackedCueSpace : 0;
  const showCue = cueSpace > 0 && width != null;
  const groupWidth =
    width == null ? undefined : Math.min(width + (showCue ? cueSpace : 0), maxWidth ?? Infinity);
  return (
    <View
      style={[stacked ? styles.stackedGroup : styles.inlineGroup, { width: groupWidth }]}
      testID={isSource ? 'transaction-source-group' : 'transaction-destination-group'}
      onLayout={event => {
        // Keep content measurements intact when the cue makes the rendered box narrower.
        if (width == null) onMeasure(Math.ceil(event.nativeEvent.layout.width));
      }}
    >
      <View
        testID={isSource ? 'transaction-source-box' : 'transaction-destination-box'}
        style={[styles.box, { backgroundColor: theme.surfaceSecondary }]}
      >
        {showCue && (
          <View
            testID="transaction-destination-cue"
            style={styles.destinationCue}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <AppIcon name={Icon.ArrowRight} size={Size.iconXs} color={theme.textSecondary} />
          </View>
        )}
        <View style={styles.members}>
          {legs.map((leg, index) => (
            <AccountLeg
              key={leg.id}
              leg={leg}
              precedingBackground={
                index > 0 ? getVariantColors(legs[index - 1].variant).light : undefined
              }
              rowStartBackground={cueSpace > 0 ? theme.surfaceSecondary : undefined}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

export function JournalAccountFlow({
  legs,
  timestamp,
}: {
  legs: JournalEntryLeg[];
  timestamp?: string;
}) {
  const { theme, themeMode, fonts } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState<number>();
  const [layout, setLayout] = useState<FlowLayout | null>(null);
  if (legs.length === 0 && timestamp == null) return null;
  const sources = legs.filter(leg => leg.role === 'SOURCE');
  const destinations = legs.filter(leg => leg.role === 'DESTINATION');
  const neutral = legs.filter(leg => leg.role === 'NEUTRAL');
  const connected = sources.length > 0 && destinations.length > 0;
  const layoutKey = JSON.stringify([
    availableWidth,
    fontScale,
    themeMode,
    fonts.regular,
    fonts.medium,
    ...[sources, destinations].map(group =>
      group.map(leg => [leg.name, leg.icon, leg.fallbackIcon, leg.variant]),
    ),
  ]);
  const currentLayout = layout?.key === layoutKey ? layout : null;
  const stacked =
    connected &&
    (availableWidth == null ||
      currentLayout?.sourceWidth == null ||
      currentLayout.destinationWidth == null ||
      currentLayout.sourceWidth + currentLayout.destinationWidth + inlineConnectorSpace >
        availableWidth);

  const measure = (field: FlowLayoutField, width: number) => {
    setLayout(previous => {
      const current = previous?.key === layoutKey ? previous : { key: layoutKey };
      const currentWidth = current[field];
      if (currentWidth != null && Math.abs(currentWidth - width) < 1) return current;
      return { ...current, [field]: width };
    });
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    setAvailableWidth(event.nativeEvent.layout.width);
  };

  const sourceGroup =
    sources.length > 0 ? (
      <AccountGroup
        legs={sources}
        role="SOURCE"
        stacked={stacked}
        connected={connected}
        width={currentLayout?.sourceWidth}
        maxWidth={availableWidth}
        onMeasure={width => measure('sourceWidth', width)}
      />
    ) : null;
  const destinationGroup =
    destinations.length > 0 ? (
      <AccountGroup
        legs={destinations}
        role="DESTINATION"
        stacked={stacked}
        connected={connected}
        width={currentLayout?.destinationWidth}
        maxWidth={availableWidth}
        onMeasure={width => measure('destinationWidth', width)}
      />
    ) : null;

  return (
    <View style={styles.flow} onLayout={handleLayout} testID="transaction-account-flow">
      {(sources.length > 0 || destinations.length > 0) && (
        <View
          // Remeasure changed contents even when their native frames stay the same.
          key={layoutKey}
          testID={stacked ? 'transaction-flow-stacked' : 'transaction-flow-inline'}
          style={styles.flow}
        >
          {stacked && sourceGroup}
          <JournalEntryFooterRow timestamp={neutral.length === 0 ? timestamp : undefined}>
            <View style={styles.inline}>
              {!stacked && sourceGroup}
              {!stacked && connected && (
                <View
                  testID="transaction-flow-arrow"
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <AppIcon name={Icon.ArrowRight} size={Size.iconXs} color={theme.textSecondary} />
                </View>
              )}
              {destinationGroup}
            </View>
          </JournalEntryFooterRow>
        </View>
      )}
      {neutral.length > 0 && (
        <JournalEntryFooterRow timestamp={timestamp}>
          <Inline gap="xs" wrap>
            <AppText variant="caption" color="secondary">
              Other accounts:
            </AppText>
            {neutral.map((leg, index) => (
              <AccountLeg key={leg.id} leg={leg} comma={index < neutral.length - 1} />
            ))}
          </Inline>
        </JournalEntryFooterRow>
      )}
      {legs.length === 0 && <JournalEntryFooterRow timestamp={timestamp} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { gap: Spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  inlineGroup: { flexShrink: 0, maxWidth: '100%' },
  stackedGroup: { alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '100%' },
  box: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: Shape.radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  members: {
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  },
  destinationCue: {
    width: stackedCueSpace,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    flexGrow: 1,
  },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  icon: { flexShrink: 0 },
  colorTransition: {
    position: 'absolute',
    left: -Spacing.sm,
    top: 0,
    bottom: 0,
    width: Spacing.lg,
  },
  name: { flexShrink: 1, minWidth: 0 },
});
