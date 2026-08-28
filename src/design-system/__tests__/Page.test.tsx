import { Spacing } from '@/src/constants/design-tokens';
import { Page } from '@/src/design-system/Page';
import { render, screen } from '@/src/utils/test-utils';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

describe('Page safe-area ownership', () => {
  it('does not add the bottom inset again inside scroll content', () => {
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 24, left: 0, right: 0, bottom: 34 },
        }}
      >
        <Page scrollable>
          <Text>Content</Text>
        </Page>
      </SafeAreaProvider>,
    );

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle).paddingBottom).toBe(
      Spacing.xxl,
    );
  });
});
