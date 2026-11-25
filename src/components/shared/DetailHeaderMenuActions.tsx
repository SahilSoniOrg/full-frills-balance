import { Icon, ListGroup, ListRow, type IconName } from '@/src/components/core';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { PrivacyToggleButton } from './PrivacyToggleButton';
import { ScreenHeaderActions, type ScreenHeaderActionItem } from './ScreenHeaderActions';
import { AppConfig } from '@/src/constants';
import { useState } from 'react';

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
      >
        <ListGroup variant="plain" dividerInset="none">
          {actions.map(action => (
            <ListRow
              key={action.label}
              title={action.label}
              icon={action.icon}
              destructive={action.destructive}
              chevron={false}
              wrap
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={action.testID}
              disabled={action.disabled}
              onPress={() => {
                afterDismiss.run(action.onPress);
                setOpen(false);
              }}
            />
          ))}
        </ListGroup>
      </ModalSurface>
    </>
  );
}
