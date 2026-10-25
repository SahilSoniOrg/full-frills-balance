import { ConfirmDialog } from '@/src/components/overlays/ConfirmDialog';
import { AppConfig } from '@/src/constants';
import {
  WORKPLACE_MISMATCH_MESSAGE,
  useWorkplaceLaunchBinding,
} from '@/src/navigation/boundWorkplace';
import { AppNavigation } from '@/src/utils/navigation';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

const copy = AppConfig.strings.navigation.workplaceBound;

/**
 * Keeps a creation draft mounted under a blocking notice when the active
 * workplace no longer matches the launch binding. Save handlers still call
 * `assertBoundWorkplace` so a draft is never silently retargeted.
 */
export function WorkplaceBoundScreen({ children }: { children: ReactNode }) {
  const { mismatched } = useWorkplaceLaunchBinding();

  return (
    <View style={styles.root}>
      {children}
      <ConfirmDialog
        visible={mismatched}
        title={copy.title}
        message={WORKPLACE_MISMATCH_MESSAGE}
        onClose={AppNavigation.back}
        primaryAction={{ label: copy.closeDraft, onPress: AppNavigation.back }}
        accessibilityCloseLabel={AppConfig.strings.common.closeActions}
        useNativeModal={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
