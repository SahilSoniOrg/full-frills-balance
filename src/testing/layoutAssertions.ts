import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const layoutProperty =
  /^(padding|margin|border.*Width|width|height|minWidth|minHeight|maxWidth|maxHeight|position|top|right|bottom|left|flex|gap|rowGap|columnGap|align|justify|font|lineHeight|letterSpacing)/;

/** Layout inputs along a content node's host path, excluding paint and decorative siblings. */
export function getLayoutPath(node: ReactTestInstance, rootTestID?: string) {
  const path = [];
  for (let current: ReactTestInstance | null = node; current; current = current.parent) {
    if (typeof current.type !== 'string') continue;
    const style = StyleSheet.flatten(current.props.style) ?? {};
    path.push(
      Object.fromEntries(Object.entries(style).filter(([key]) => layoutProperty.test(key))),
    );
    if (rootTestID && current.props.testID === rootTestID) break;
  }
  return path;
}
