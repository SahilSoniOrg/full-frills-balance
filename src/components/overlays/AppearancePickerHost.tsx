import { Icon } from '@/src/components/core';
import {
  AppearancePickerView,
  resolveAppearancePickerTitle,
} from '@/src/components/overlays/AppearancePickerView';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import {
  finishAppearancePicker,
  peekAppearancePickerRequest,
  subscribeAppearancePicker,
} from '@/src/components/overlays/appearancePickerSession';
import { AccountType } from '@/src/types/enums';
import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';

function subscribe(onStoreChange: () => void): () => void {
  return subscribeAppearancePicker(onStoreChange);
}

function getSnapshot(): ReturnType<typeof peekAppearancePickerRequest> {
  return peekAppearancePickerRequest();
}

/** Root host: partial bottom sheet so the presenting screen stays visible behind it. */
export function AppearancePickerHost() {
  const request = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const visible = request != null;
  const mode = request?.mode ?? 'both';
  const title = resolveAppearancePickerTitle(mode, request?.title);
  const selectedIcon = request?.selectedIcon ?? Icon.Wallet;
  const selectedColor = request?.selectedColor ?? '';

  return (
    <ModalSurface
      visible={visible}
      title={title}
      onClose={() => finishAppearancePicker(null)}
      position="bottomSheet"
      maxHeightPercent={75}
      fixedHeight
      scrollable={false}
      animationType="fade"
      accessibilityCloseLabel="Close appearance picker"
      contentStyle={styles.content}
    >
      {request ? (
        <AppearancePickerView
          mode={mode}
          title={request.title}
          selectedIcon={selectedIcon}
          selectedColor={selectedColor}
          accountType={request.accountType ?? AccountType.ASSET}
          defaultAccentColor={request.defaultAccentColor}
          previewLabel={request.previewLabel}
          defaultColorLabel={request.defaultColorLabel}
          onIconSelect={async icon => {
            request.onIconSelect?.(icon);
            if (mode !== 'both') {
              finishAppearancePicker({ icon, color: selectedColor });
            }
          }}
          onColorSelect={async color => {
            request.onColorSelect?.(color);
            if (mode !== 'both') {
              finishAppearancePicker({ icon: selectedIcon, color });
            }
          }}
          onSave={
            mode === 'both'
              ? async updates => {
                  finishAppearancePicker(updates);
                }
              : undefined
          }
          onClose={() => finishAppearancePicker(null)}
        />
      ) : null}
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 0, paddingHorizontal: 0 },
});
