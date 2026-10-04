import { SpacingKey } from '@/src/constants/design-tokens';
import React, { forwardRef } from 'react';
import { Box, type BoxBaseProps } from './Box';
import { extractBoxProps } from './utils';
import { View } from 'react-native';

type StackSpacingProps =
  { space?: SpacingKey | number; gap?: never } | { gap?: SpacingKey | number; space?: never };

export type StackProps = Omit<BoxBaseProps, 'gap'> &
  StackSpacingProps & {
    align?: BoxBaseProps['alignItems'];
    justify?: BoxBaseProps['justifyContent'];
    direction?: BoxBaseProps['flexDirection'];
    wrap?: boolean | BoxBaseProps['flexWrap'];
    children?: React.ReactNode;
  };

const StackInner = forwardRef<View, StackProps>((props, ref) => {
  const { boxProps, restProps } = extractBoxProps(props);
  const { gap, ...shellProps } = boxProps;
  const direction = props.direction || 'column';
  const spacing = props.space ?? props.gap;
  const flexWrap = props.wrap === true ? 'wrap' : props.wrap === false ? 'nowrap' : props.wrap;

  return (
    <Box
      ref={ref}
      {...restProps}
      {...shellProps}
      flexDirection={direction}
      // Conditional overrides ensure we don't stomp with 'undefined'
      {...(spacing !== undefined ? { gap: spacing } : {})}
      {...(props.align !== undefined ? { alignItems: props.align } : {})}
      {...(props.justify !== undefined ? { justifyContent: props.justify } : {})}
      {...(flexWrap !== undefined ? { flexWrap } : {})}
    >
      {props.children}
    </Box>
  );
});

StackInner.displayName = 'Stack';

export const Stack = StackInner;

Stack.displayName = 'Stack';
