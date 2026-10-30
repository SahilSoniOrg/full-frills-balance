import { AppIcon, PersonAvatar, PressScaleTouchable } from '@/src/components/core';
import { Size } from '@/src/constants';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useTheme } from '@/src/hooks/use-theme';
import {
  PRIMARY_NAVIGATION_TRIGGER_SIZE,
  usePrimaryNavigation,
} from '@/src/navigation/primaryNavigation';
import { Icon } from '@/src/types/domainIcons';
import { getReadableColor } from '@/src/utils/color-math';
import { StyleSheet, View } from 'react-native';

export function PrimaryNavigationHeader() {
  const navigation = usePrimaryNavigation();
  const workplace = useOptionalWorkplace();
  const { theme } = useTheme();
  const selectionMode = navigation?.selectionModeActive ?? false;
  const switching = workplace?.isSwitchingWorkplace ?? false;
  const fullName = workplace?.activeWorkplace.name ?? 'Workplace';
  const identity = navigation?.userName.trim() || 'User';
  const expanded = navigation?.drawerVisible ?? false;
  const disabled = !navigation?.openDrawer || selectionMode || switching;

  return (
    <PressScaleTouchable
      nativeID="primary-navigation-header-trigger"
      testID="primary-navigation-header-trigger"
      onPress={() => navigation?.openDrawer()}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Open navigation drawer. ${identity}. Active workplace: ${fullName}`}
      accessibilityHint="Shows workplace, personal, and device navigation"
      accessibilityState={{ expanded, disabled }}
      style={[styles.trigger, disabled && styles.disabled]}
    >
      <View style={styles.avatar}>
        <PersonAvatar name={identity} />
        <View
          pointerEvents="none"
          style={[styles.menuCue, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <AppIcon
            name={Icon.Menu}
            size={Size.iconXs}
            color={getReadableColor(theme.textSecondary, theme.surface, 3)}
          />
        </View>
      </View>
    </PressScaleTouchable>
  );
}

const styles = StyleSheet.create({
  trigger: { width: PRIMARY_NAVIGATION_TRIGGER_SIZE, height: PRIMARY_NAVIGATION_TRIGGER_SIZE },
  avatar: {
    width: PRIMARY_NAVIGATION_TRIGGER_SIZE,
    height: PRIMARY_NAVIGATION_TRIGGER_SIZE,
    flexShrink: 0,
  },
  menuCue: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: Size.md,
    height: Size.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Size.md / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.65 },
});
