import { SpacingKey } from '@/src/constants/design-tokens';
import React, { forwardRef } from 'react';
import { Box, type BoxBaseProps } from './Box';
import { extractBoxProps } from './utils';
import { View } from 'react-native';

type InlineSpacingProps =
  | { space?: SpacingKey | number; gap?: never }
  | { gap?: SpacingKey | number; space?: never };

export type InlineProps = Omit<BoxBaseProps, 'flexDirection' | 'gap'> &
  InlineSpacingProps & {
    align?: BoxBaseProps['alignItems'];
    justify?: BoxBaseProps['justifyContent'];
    wrap?: boolean | BoxBaseProps['flexWrap'];
    children?: React.ReactNode;
  };

const InlineInner = forwardRef<View, InlineProps>((props, ref) => {
  const { boxProps, restProps } = extractBoxProps(props);
  const { gap, ...shellProps } = boxProps;
  const spacing = props.space ?? props.gap;

  return (
    <Box
      ref={ref}
      {...restProps}
      {...shellProps}
      flexDirection="row"
      {...(spacing !== undefined ? { gap: spacing } : {})}
      {...(props.align !== undefined ? { alignItems: props.align } : {})}
      {...(props.justify !== undefined ? { justifyContent: props.justify } : {})}
      {...(props.wrap !== undefined
        ? { flexWrap: props.wrap === true ? 'wrap' : props.wrap === false ? 'nowrap' : props.wrap }
        : {})}
    >
      {props.children}
    </Box>
  );
});

InlineInner.displayName = 'Inline';

export const Inline = InlineInner;

Inline.displayName = 'Inline';
