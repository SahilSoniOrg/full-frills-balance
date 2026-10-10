import { AppText } from '@/src/components/core/AppText';
import {
  ListRow,
  type ListRowProps,
  listRowPadding,
  listRowTextInset,
  ListVariantContext,
  type ListVariant,
} from '@/src/components/core/ListRow';
import { FocusTarget } from '@/src/components/shared/FocusTarget';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';

/** A data-driven row: ListRow props plus a stable key. */
export type ListRowItem = ListRowProps & { id: string };

type ListGroupBaseProps = {
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
  /** Props applied to every row generated from `items` (e.g. `{ chevron: true }`); item props win. */
  rowProps?: Partial<ListRowProps>;
  /** Custom rows, rendered after the `items` rows. */
  children?: ReactNode;
};

/**
 * Rows come from `items` (keyed by `id`, mapped with `toRow` unless they already are
 * `ListRowItem`s) followed by `children`.
 */
export type ListGroupProps<T = ListRowItem> = ListGroupBaseProps &
  (
    | { items?: readonly ListRowItem[]; toRow?: undefined }
    | { items: readonly T[]; toRow: (item: T, index: number) => ListRowItem }
  );

/** A titled group of rows: overline header, rows with hairline dividers, optional footer. */
export function ListGroup<T = ListRowItem>({
  header,
  headerAccessory,
  footer,
  variant = 'card',
  dividerInset,
  focusId,
  testID,
  rowProps,
  items,
  toRow,
  children,
}: ListGroupProps<T>) {
  const plain = variant === 'plain';
  const edge = plain ? listRowPadding(variant) : 'sm';
  const inset = dividerInset ?? listRowTextInset(variant);
  const generated = (items ?? []).map((item, index) => {
    const { id, ...row } = toRow ? toRow(item as T, index) : (item as ListRowItem);
    return <ListRow key={id} {...rowProps} {...row} />;
  });
  const rows = [...generated, ...Children.toArray(children).filter(Boolean)];
  if (rows.length === 0 && !header) return null;

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
