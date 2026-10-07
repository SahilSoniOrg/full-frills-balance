import { AppButton, AppText, Icon } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { MoneyDetailHeaderActions } from './MoneyDetailHeaderActions';
import type { ScreenHeaderActionItem } from './ScreenHeaderActions';
import { AppConfig, Size } from '@/src/constants';
import { Column } from '@/src/design-system';
import { useState } from 'react';

export interface DetailMenuAction {
  label: string;
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
  return (
    <>
      <MoneyDetailHeaderActions
        privacyVariant="surface"
        privacyPosition={privacyPosition}
        actions={[
          ...leadingActions,
          {
            name: Icon.More,
            onPress: () => setOpen(true),
            variant: 'surface',
            accessibilityLabel: strings.moreActions,
            testID: 'detail-more-actions',
          },
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
              <AppText color={action.destructive ? 'error' : 'text'}>{action.label}</AppText>
            </AppButton>
          ))}
        </Column>
      </ModalSurface>
    </>
  );
}
