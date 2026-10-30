import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, PressScaleTouchable } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useTheme } from '@/src/hooks/use-theme';
import { usePrimaryPagerNavigation } from '@/src/navigation/primaryPageNavigation';
import { usePrimaryNavigation } from '@/src/navigation/primaryNavigation';
import { PRIMARY_PAGES, primaryPageFromRouteName } from '@/src/navigation/primaryPages';
import { getReadableColor } from '@/src/utils/color-math';

/** Each pane owns a static subtab strip that travels with the pane during swipes. */
export function HomeV2Subtabs({ routeName }: { routeName: string }) {
  const { theme } = useTheme();
  const navigation = usePrimaryPagerNavigation();
  const primary = usePrimaryNavigation();
  const workplace = useOptionalWorkplace();
  const page = primaryPageFromRouteName(routeName);
  const siblings = PRIMARY_PAGES.filter(item => item.group === page?.group);
  if (siblings.length < 2) return null;
  const disabled = !!(
    !navigation ||
    navigation.isTransitioning ||
    workplace?.isSwitchingWorkplace ||
    primary?.selectionModeActive ||
    primary?.drawerVisible
  );
  return (
    <View
      style={[styles.strip, { borderBottomColor: theme.border }]}
      testID={`home-v2-subtabs-${routeName}`}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.tabs}
        accessibilityRole="tablist"
        accessibilityLabel={`${page?.group === 'accounts' ? 'Accounts' : 'Plans'} pages`}
      >
        {siblings.map(sibling => {
          const selected = sibling.routeName === routeName;
          return (
            <PressScaleTouchable
              key={sibling.id}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={sibling.title}
              disabled={disabled}
              onPress={() => {
                if (!selected) navigation?.navigateToPage(sibling.routeName);
              }}
              pressScale="none"
              testID={`home-v2-subtab-${routeName}-${sibling.routeName}`}
              style={[styles.tab, { borderBottomColor: selected ? theme.primary : 'transparent' }]}
            >
              <AppText
                weight={selected ? 'semibold' : 'medium'}
                style={{
                  color: getReadableColor(
                    selected ? theme.primary : theme.textSecondary,
                    theme.background,
                  ),
                }}
              >
                {sibling.title}
              </AppText>
            </PressScaleTouchable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { paddingHorizontal: Spacing.lg, gap: Spacing.lg },
  tab: {
    minHeight: Size.touchTarget,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
  },
});
