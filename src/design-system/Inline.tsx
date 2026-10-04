import React, { forwardRef } from 'react';
import { Stack, type StackProps } from './Stack';
import { View } from 'react-native';

export type InlineProps = Omit<StackProps, 'direction'>;

export const Inline = forwardRef<View, InlineProps>((props, ref) => (
  <Stack ref={ref} direction="row" {...props} />
));

Inline.displayName = 'Inline';
