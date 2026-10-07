import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { AppButton, AppText } from '@/src/components/core';
import { Size } from '@/src/constants';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { SectionLabel } from './SectionLabel';

/** Titled card for detail screens. `separatorInset` draws a hairline between children, indented by that many points. */
export function DetailGroup({
  title,
  accessory,
  separatorInset,
  children,
  testID,
}: {
  title: string;
  accessory?: ReactNode;
  separatorInset?: number;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Stack space="sm" testID={testID}>
      <Inline
        space="sm"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        paddingHorizontal="sm"
      >
        <SectionLabel label={title} marginTop="none" style={{ marginBottom: 0 }} />
        {accessory}
      </Inline>
      <Box background="surface" borderRadius="lg" overflow="hidden">
        {separatorInset === undefined
          ? children
          : Children.toArray(children).map((child, index) => (
              <Fragment key={(isValidElement(child) && child.key) || index}>
                {index > 0 ? <Separator marginLeft={separatorInset} /> : null}
                {child}
              </Fragment>
            ))}
      </Box>
    </Stack>
  );
}

/** `accessory` sits in a group header on the screen background; `inline` sits inside a group card. */
export function DetailCaptionLink({
  label,
  onPress,
  placement = 'accessory',
  prefix,
  testID,
}: {
  label: string;
  onPress: () => void;
  placement?: 'accessory' | 'inline';
  prefix?: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  const inline = placement === 'inline';
  return (
    <AppButton
      variant="ghost"
      size={inline ? undefined : 'sm'}
      onPress={onPress}
      accessibilityLabel={label}
      testID={testID}
      hitSlop={inline ? undefined : { top: 6, bottom: 6 }}
      buttonStyle={
        inline
          ? { minHeight: Size.touchTarget, alignSelf: 'flex-start', paddingHorizontal: 0 }
          : { minHeight: Size.buttonSm, paddingVertical: 0, paddingHorizontal: 0 }
      }
    >
      <AppText
        variant="caption"
        color="primary"
        weight="semibold"
        contrastOn={inline ? theme.surface : theme.background}
      >
        {prefix ? `${prefix} ${label}` : label}
      </AppText>
    </AppButton>
  );
}
