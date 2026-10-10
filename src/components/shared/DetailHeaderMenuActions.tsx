import { AppButton, AppIcon, AppText, Icon, type IconName } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { PrivacyToggleButton } from './PrivacyToggleButton';
import { ScreenHeaderActions, type ScreenHeaderActionItem } from './ScreenHeaderActions';
import { AppConfig, Size, Spacing, Typography } from '@/src/constants';
import { Column } from '@/src/design-system';
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

/** Keep the established privacy slot and move secondary detail actions into one menu. */
export function DetailHeaderMenuActions({
  actions,
  leadingActions = [],
  privacyPosition = 'trailing',
}: {
  actions: DetailMenuAction[];
  leadingActions?: ScreenHeaderActionItem[];
  privacyPosition?: 'leading' | 'trailing';
}) {
  const [open, setOpen] = useState(false);
  const afterDismiss = useAfterDismiss();
  const strings = AppConfig.strings.common;
  const privacy = <PrivacyToggleButton variant="surface" size={Typography.sizes.xl} />;
  return (
    <>
      <ScreenHeaderActions
        leading={privacyPosition === 'leading' ? privacy : undefined}
        trailing={privacyPosition === 'trailing' ? privacy : undefined}
        actions={[
          ...leadingActions,
          ...(actions.length > 0
            ? [
                {
                  name: Icon.More,
                  onPress: () => setOpen(true),
                  variant: 'surface' as const,
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
        <Column gap="sm">
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
        </Column>
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
