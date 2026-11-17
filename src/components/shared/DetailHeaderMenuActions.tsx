import { AppButton, AppIcon, AppText, Icon, type IconName } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { PrivacyToggleButton } from './PrivacyToggleButton';
import { ScreenHeaderActions, type ScreenHeaderActionItem } from './ScreenHeaderActions';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Stack } from '@/src/design-system';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface DetailMenuAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** Detail header: inline actions, then a More menu, then the privacy toggle (always last). */
export function DetailHeaderMenuActions({
  actions,
  leadingActions = [],
}: {
  actions: DetailMenuAction[];
  leadingActions?: ScreenHeaderActionItem[];
}) {
  const [open, setOpen] = useState(false);
  const afterDismiss = useAfterDismiss();
  const strings = AppConfig.strings.common;
  return (
    <>
      <ScreenHeaderActions
        trailing={<PrivacyToggleButton />}
        actions={[
          ...leadingActions,
          ...(actions.length > 0
            ? [
                {
                  name: Icon.More,
                  onPress: () => setOpen(true),
                  accessibilityLabel: strings.moreActions,
                  testID: 'detail-more-actions',
                },
              ]
            : []),
        ]}
      />
      <ModalSurface
        visible={open}
        title={strings.actions}
        onClose={() => {
          afterDismiss.cancel();
          setOpen(false);
        }}
        onDismiss={afterDismiss.onDismiss}
        accessibilityCloseLabel={strings.closeActions}
        position="bottomSheet"
        fixedHeight={false}
        scrollable={false}
      >
        <Stack gap="sm">
          {actions.map(action => (
            <AppButton
              key={action.label}
              variant="ghost"
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={action.testID}
              disabled={action.disabled}
              buttonStyle={{ minHeight: Size.touchTarget, alignItems: 'stretch' }}
              onPress={() => {
                setOpen(false);
                afterDismiss.run(action.onPress);
              }}
            >
              <View style={styles.actionRow}>
                {action.icon ? (
                  <AppIcon
                    name={action.icon}
                    size={Size.iconSm}
                    color={action.destructive ? 'error' : 'textSecondary'}
                  />
                ) : null}
                <AppText style={styles.actionLabel} color={action.destructive ? 'error' : 'text'}>
                  {action.label}
                </AppText>
              </View>
            </AppButton>
          ))}
        </Stack>
      </ModalSurface>
    </>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionLabel: {
    flex: 1,
  },
});
