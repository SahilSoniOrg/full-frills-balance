import { SpacingKey } from '@/src/constants/design-tokens';
import { forwardRef } from 'react';
import { Stack, type StackProps } from './Stack';
import { View } from 'react-native';

export type InlineProps = Omit<StackProps, 'direction' | 'space' | 'gap'> & {
  space?: SpacingKey | number;
  gap?: SpacingKey | number;
};

export const Inline = forwardRef<View, InlineProps>(({ space, gap, ...props }, ref) => (
  <Stack ref={ref} direction="row" space={space ?? gap} {...props} />
));

Inline.displayName = 'Inline';
