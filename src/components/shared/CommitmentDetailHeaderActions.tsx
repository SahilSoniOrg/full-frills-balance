import { AppButton, AppText, Icon } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { MoneyDetailHeaderActions } from './MoneyDetailHeaderActions';
import { AppConfig, Size } from '@/src/constants';
import { Column } from '@/src/design-system';
import { useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface CommitmentMenuAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** Keep the established privacy slot and move secondary detail actions into one menu. */
export function CommitmentDetailHeaderActions({ actions }: { actions: CommitmentMenuAction[] }) {
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const finishDismiss = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };
  const strings = AppConfig.strings.commitmentsRedesign;
  return (
    <>
      <MoneyDetailHeaderActions
        privacyVariant="surface"
        actions={[
          {
            name: Icon.More,
            onPress: () => setOpen(true),
            variant: 'surface',
            accessibilityLabel: strings.moreActions,
            testID: 'commitment-more-actions',
          },
        ]}
      />
      <ModalSurface
        visible={open}
        title={strings.menuTitle}
        onClose={() => {
          pendingAction.current = null;
          setOpen(false);
        }}
        onDismiss={finishDismiss}
        accessibilityCloseLabel={strings.closeMenu}
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
                // iOS must dismiss this sheet before presenting a confirmation or pushing a page.
                if (Platform.OS === 'ios' && process.env.NODE_ENV !== 'test') {
                  pendingAction.current = action.onPress;
                } else {
                  action.onPress();
                }
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
