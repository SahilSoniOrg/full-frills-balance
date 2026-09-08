import { AppIcon } from '@/src/components/core';
import {
  SelectionPickerSheet,
  type SelectionOption,
} from '@/src/components/filters/SelectionPickerSheet';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { useObservable } from '@/src/hooks/useObservable';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { workplaceService } from '@/src/services/WorkplaceService';
import type { WorkplaceId } from '@/src/types/ids';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

/** Compact, persistent workplace switcher used by the app's shared header. */
export function WorkplaceSwitcher() {
  const workplace = useOptionalWorkplace();
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const { data: currentWorkplace } = useWorkplaceSnapshot(workplace?.workplaceId);
  const { data: workplaces = [] } = useObservable(
    () => workplaceService.observeAllWorkplaces(),
    [],
    [],
  );

  const options = useMemo<SelectionOption<string>[]>(
    () =>
      [...workplaces]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(item => ({
          id: item.id,
          label: item.name,
          icon: item.icon,
        })),
    [workplaces],
  );

  const handleSelect = useCallback(
    async (id: string) => {
      setVisible(false);
      if (!workplace || id === workplace.workplaceId || isSwitching) return;
      setIsSwitching(true);
      try {
        await workplace.setWorkplaceId(id as WorkplaceId);
      } catch {
        toast.error('Failed to switch workplace.');
      } finally {
        setIsSwitching(false);
      }
    },
    [isSwitching, workplace],
  );

  if (!workplace) return null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        disabled={isSwitching}
        accessibilityRole="button"
        accessibilityLabel={`Current workplace: ${currentWorkplace?.name ?? 'Unknown'}`}
        accessibilityHint="Choose a different workplace"
        testID="header-workplace-switcher"
        style={[styles.trigger, { backgroundColor: theme.surfaceSecondary }]}
      >
        {isSwitching ? (
          <AppIcon name="refresh" size={21} color={theme.primary} />
        ) : (
          <AppIcon name={currentWorkplace?.icon ?? 'briefcase'} size={21} color={theme.primary} />
        )}
      </TouchableOpacity>
      <SelectionPickerSheet
        visible={visible}
        title="Switch workplace"
        options={options}
        selectedValue={workplace.workplaceId}
        onClose={() => setVisible(false)}
        onSelect={id => void handleSelect(String(id))}
        actionLabel="Create Workplace"
        onAction={() => {
          setVisible(false);
          AppNavigation.toWorkplaceCreation();
        }}
        actionTestID="workplace-switcher-create"
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
});
