import { AccountsListScreen } from '@/src/features/accounts';
import { normalizeLegacyPrimaryRoute } from '@/src/navigation/primaryPages';
import type { Href } from 'expo-router';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutEffect } from 'react';

export default function AccountsRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();
  const isFocused = useIsFocused();
  const shouldNormalize = params.tab !== undefined;

  useLayoutEffect(() => {
    if (!shouldNormalize || !isFocused) return;
    const normalized = normalizeLegacyPrimaryRoute('accounts', params);
    router.replace({
      pathname: `/(tabs)/${normalized.routeName}`,
      params: normalized.params as never,
    } as Href);
  }, [params, router, shouldNormalize, isFocused]);

  return shouldNormalize ? null : <AccountsListScreen />;
}
