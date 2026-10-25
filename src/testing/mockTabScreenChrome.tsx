import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function MockTabScreenWithChrome({
  chrome,
  children,
}: {
  chrome: TabScreenChrome;
  children: ReactNode;
}) {
  return (
    <View>
      <Text>{chrome.screenTitle}</Text>
      {children}
    </View>
  );
}
