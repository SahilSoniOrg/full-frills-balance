import { Icon } from '@/src/components/core';
import { IconButton } from '@/src/components/core/IconButton';
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
import { useCallback, useMemo, useState } from 'react';

/** Compact, persistent workplace switcher used by the app's shared header. */
export function WorkplaceSwitcher() {
  const workplace = useOptionalWorkplace();
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
      <IconButton
        name={isSwitching ? Icon.Refresh : (currentWorkplace?.icon ?? Icon.Briefcase)}
        onPress={() => setVisible(true)}
        disabled={isSwitching}
        accessibilityLabel={`Current workplace: ${currentWorkplace?.name ?? 'Unknown'}`}
        accessibilityHint="Choose a different workplace"
        testID="header-workplace-switcher"
      />
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
