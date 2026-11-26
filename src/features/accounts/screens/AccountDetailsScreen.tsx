import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { buildDetailNavChrome } from '@/src/components/layout/buildDetailNavChrome';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { AccountDetailsView } from '@/src/features/accounts/components/AccountDetailsView';
import { useAccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { logAccountPerformanceMarker } from '@/src/testing/accountPerformanceMarkers';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { Icon } from '@/src/types/domainIcons';
import { useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

type NavigationParamList = Record<string, object | undefined>;

const TRANSITION_END_FALLBACK_MS = 450;

function AccountDetailsScreen() {
  const vm = useAccountDetailsViewModel();
  const navigation = useNavigation<NativeStackNavigationProp<NavigationParamList>>();
  const reduceMotion = useReducedMotion();
  const accountRenderMode = readE2eLaunchConfig()?.accountRenderMode ?? 'deferred-full';
  // The web stack never emits transitionEnd, so deferring there would hide the rows for good.
  const deferSecondaryContent =
    accountRenderMode === 'deferred-full' && Platform.OS !== 'web' && !reduceMotion;
  const [transitionCompleted, setTransitionCompleted] = useState(!deferSecondaryContent);
  const transitionReported = useRef(false);
  const { accountLoading, accountMissing, headerActions, isDeleted, onAddPress, selectionChrome } =
    vm;

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

  useEffect(() => {
    if (!deferSecondaryContent || transitionCompleted) return;
    const timer = setTimeout(() => {
      if (transitionReported.current) return;
      transitionReported.current = true;
      setTransitionCompleted(true);
    }, TRANSITION_END_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [deferSecondaryContent, transitionCompleted]);

  const chrome = useMemo<ScreenNavChrome>(() => {
    const phase = accountLoading ? 'loading' : accountMissing ? 'missing' : 'ready';
    return {
      ...buildDetailNavChrome({
        phase,
        // The body already shows the name in large type; no need to repeat it in the bar.
        readyTitle: '',
        loadingTitle: 'Account Details',
        onBack: vm.onBack,
        headerActions: (
          <DetailHeaderMenuActions
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
      selection: phase === 'ready' ? selectionChrome : undefined,
    };
  }, [
    accountLoading,
    accountMissing,
    headerActions,
    isDeleted,
    onAddPress,
    selectionChrome,
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
