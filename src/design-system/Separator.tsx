import { Box, BoxViewProps } from './Box';
import { DimensionValue, StyleSheet } from 'react-native';

export type SeparatorProps = BoxViewProps & {
  vertical?: boolean;
  space?: DimensionValue;
};

/**
 * Separator - Themed divider component
 * Maps to design tokens and supports horizontal/vertical orientations.
 */
export const Separator = ({
  background = 'border',
  vertical = false,
  space = 1,
  style,
  ...props
}: SeparatorProps) => {
  return (
    <Box
      background={background}
      height={vertical ? '100%' : space}
      width={vertical ? space : '100%'}
      style={[styles.separator, style]}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  separator: {
    alignSelf: 'stretch',
  },
});
