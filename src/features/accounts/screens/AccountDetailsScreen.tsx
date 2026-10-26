import { applySelectionChrome } from '@/src/components/layout/applySelectionChrome';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { logAccountPerformanceMarker } from '@/src/testing/accountPerformanceMarkers';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { Icon } from '@/src/types/domainIcons';
import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

type NavigationParamList = Record<string, object | undefined>;

function AccountDetailsScreen() {
  const vm = useAccountDetailsViewModel();
  const navigation = useNavigation<NativeStackNavigationProp<NavigationParamList>>();
  const accountRenderMode = readE2eLaunchConfig()?.accountRenderMode ?? 'deferred-full';
  const deferSecondaryContent = accountRenderMode === 'deferred-full';
  const [transitionCompleted, setTransitionCompleted] = useState(!deferSecondaryContent);
  const transitionReported = useRef(false);
  const {
    accountLoading,
    accountMissing,
    headerActions,
    isDeleted,
    onAddPress,
    isSelectionModeActive,
    selectionChrome,
  } = vm;

  useLayoutEffect(
    () =>
      navigation.addListener('transitionEnd', event => {
        if (event.data.closing || transitionReported.current) return;
        transitionReported.current = true;
        logAccountPerformanceMarker('transition_end', { mode: accountRenderMode });
        if (deferSecondaryContent) setTransitionCompleted(true);
      }),
    [accountRenderMode, deferSecondaryContent, navigation],
  );

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = accountLoading ? 'loading' : accountMissing ? 'missing' : 'ready';
    return applySelectionChrome(
      buildDetailNavChrome({
        phase,
        // The body already shows the name in large type; no need to repeat it in the bar.
        readyTitle: '',
        loadingTitle: 'Account Details',
        onBack: vm.onBack,
        headerActions: (
          <DetailHeaderMenuActions
            privacyPosition="leading"
            leadingActions={headerActions.leading}
            actions={headerActions.menu}
          />
        ),
        fab: isDeleted
          ? undefined
          : {
              onPress: onAddPress,
              label: 'Add Transaction',
              icon: Icon.Plus,
              placement: 'end',
              accessibilityLabel: 'Add transaction for this account',
            },
      }),
      {
        active: isSelectionModeActive,
        onExit: selectionChrome.exitSelectionMode,
      },
    );
  }, [
    accountLoading,
    accountMissing,
    headerActions,
    isDeleted,
    onAddPress,
    isSelectionModeActive,
    selectionChrome.exitSelectionMode,
    vm.onBack,
  ]);

  return (
    <AccountDetailsView
      {...vm}
      chrome={chrome}
      secondaryContentReady={!deferSecondaryContent || transitionCompleted}
    />
  );
}

export default withPrivacyScope(AccountDetailsScreen);
