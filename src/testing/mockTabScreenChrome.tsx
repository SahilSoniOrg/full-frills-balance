import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chrome.fab?.accessibilityLabel}
        onPress={chrome.fab?.onPress}
      >
        <Text>{chrome.fab?.label}</Text>
      </Pressable>
    </View>
  );
}
