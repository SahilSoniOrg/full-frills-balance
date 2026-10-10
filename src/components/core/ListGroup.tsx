import { AppText } from '@/src/components/core/AppText';
import {
  listRowPadding,
  listRowTextInset,
  ListVariantContext,
  type ListVariant,
} from '@/src/components/core/ListRow';
import { FocusTarget } from '@/src/components/shared/FocusTarget';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';

export type ListGroupProps = {
  /** Overline section header, aligned with the row content. */
  header?: string;
  headerAccessory?: ReactNode;
  /** Helper text or content under the group. */
  footer?: ReactNode;
  /**
   * `card`: rows on a rounded surface (detail screens).
   * `plain`: full-width menu rows on the screen background (settings); compact, wrapping,
   * semibold titles and automatic chevrons.
   */
  variant?: ListVariant;
  /** Divider indent; defaults to the row text. `'none'` hides dividers. */
  dividerInset?: number | 'none';
  /** Search/scroll focus target id for the whole group. */
  focusId?: string;
  testID?: string;
  children: ReactNode;
};

/** A titled group of rows: overline header, rows with hairline dividers, optional footer. */
export function ListGroup({
  header,
  headerAccessory,
  footer,
  variant = 'card',
  dividerInset,
  focusId,
  testID,
  children,
}: ListGroupProps) {
  const plain = variant === 'plain';
  const edge = plain ? listRowPadding(variant) : 'sm';
  const inset = dividerInset ?? listRowTextInset(variant);
  const rows = Children.toArray(children).filter(Boolean);

  const group = (
    <Stack space="sm" testID={testID}>
      {header || headerAccessory ? (
        <Inline
          space="sm"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          paddingHorizontal={edge}
        >
          {header ? (
            <AppText variant="overline" color="secondary" accessibilityRole="header">
              {header}
            </AppText>
          ) : null}
          {headerAccessory}
        </Inline>
      ) : null}
      <Box
        background={plain ? undefined : 'surface'}
        borderRadius={plain ? undefined : 'lg'}
        overflow="hidden"
      >
        <ListVariantContext.Provider value={variant}>
          {inset === 'none'
            ? rows
            : rows.map((child, index) => (
                <Fragment key={(isValidElement(child) && child.key) || index}>
                  {index > 0 ? <Separator marginLeft={inset} /> : null}
                  {child}
                </Fragment>
              ))}
        </ListVariantContext.Provider>
      </Box>
      {footer ? (
        <Box paddingHorizontal={edge}>
          {typeof footer === 'string' ? (
            <AppText variant="caption" color="secondary">
              {footer}
            </AppText>
          ) : (
            footer
          )}
        </Box>
      ) : null}
    </Stack>
  );

  return focusId ? <FocusTarget targetId={focusId}>{group}</FocusTarget> : group;
}
