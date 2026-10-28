import { AccountsListScreen } from '@/src/features/accounts';
import { normalizeLegacyPrimaryRoute } from '@/src/navigation/primaryPages';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLayoutEffect } from 'react';

export default function AccountsRoute() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const router = useRouter();
  const shouldNormalize = params.tab !== undefined;

  useLayoutEffect(() => {
    if (!shouldNormalize) return;
    const normalized = normalizeLegacyPrimaryRoute('accounts', params);
    router.replace({
      pathname: `/(tabs)/${normalized.routeName}`,
      params: normalized.params as never,
    } as Href);
  }, [params, router, shouldNormalize]);

  return shouldNormalize ? null : <AccountsListScreen activeTab="accounts" />;
}
