import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { AppToggle } from '@/src/components/core/AppToggle';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { FocusTarget } from '@/src/components/shared/FocusTarget';
import { Opacity, Size, Spacing, type SpacingKey } from '@/src/constants/design-tokens';
import { Box, type BoxViewProps } from '@/src/design-system/Box';
import { extractBoxProps } from '@/src/design-system/utils';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon, type IconName, isValidIconName } from '@/src/types/domainIcons';
import React, { createContext, isValidElement, useContext } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type AccessibilityState,
  type TouchableOpacityProps,
} from 'react-native';

export type ListVariant = 'card' | 'plain';

/** Set by ListGroup: `plain` rows are compact, wrap and use semibold titles. */
export const ListVariantContext = createContext<ListVariant>('card');

const PADDING: Record<ListVariant, SpacingKey> = { card: 'lg', plain: 'md' };
const ICON_SLOT = Size.lg;

/** Left inset that lines a divider up with the row text. */
export function listRowTextInset(variant: ListVariant = 'card') {
  return Spacing[PADDING[variant]] + ICON_SLOT + Spacing.md;
}

/** Horizontal padding of a row in this variant (group headers align to it). */
export function listRowPadding(variant: ListVariant = 'card'): SpacingKey {
  return PADDING[variant];
}

type RowState = { destructive: boolean; disabled: boolean };
const RowStateContext = createContext<RowState>({ destructive: false, disabled: false });

function useGlyphColor() {
  const { theme } = useTheme();
  const { destructive, disabled } = useContext(RowStateContext);
  return disabled ? theme.textSecondary : destructive ? theme.error : theme.primary;
}

/** Bare glyph colored by the row state (brand, red when destructive, gray when disabled). */
function RowIcon({ name }: { name: IconName | string }) {
  const color = useGlyphColor();
  return isValidIconName(name) ? (
    <AppIcon name={name} size={Size.iconSm} color={color} />
  ) : (
    <AppText variant="body">{name}</AppText>
  );
}

/** Trailing switch. The whole row becomes the switch: tapping anywhere toggles it. */
function RowToggle({
  value,
  disabled,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const row = useContext(RowStateContext);
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
      <AppToggle value={value} onValueChange={() => {}} disabled={disabled ?? row.disabled} />
    </View>
  );
}

/** Trailing secondary text; takes AppText props. */
function RowValue(props: React.ComponentProps<typeof AppText>) {
  return <AppText color="secondary" align="right" {...props} />;
}

function RowSpinner() {
  const { theme } = useTheme();
  return <ActivityIndicator size="small" color={theme.textSecondary} />;
}

function RowChevron() {
  const { theme } = useTheme();
  return (
    <AppIcon
      name={Icon.ChevronRight}
      size={Size.xs}
      color={theme.textSecondary}
      style={{ opacity: Opacity.medium }}
    />
  );
}

type ListRowPressProps = {
  onPress?: () => void;
  onLongPress?: TouchableOpacityProps['onLongPress'];
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: TouchableOpacityProps['accessibilityRole'];
  accessibilityState?: AccessibilityState;
  pointerEvents?: BoxViewProps['pointerEvents'];
  trailingMaxWidth?: BoxViewProps['maxWidth'];
};

/** Nesting step used by `level` (matches account-tree indent feel without owning that feature). */
export const LIST_ROW_LEVEL_INDENT = Spacing.lg;

export type ListRowProps = BoxViewProps &
  ListRowPressProps & {
    /** Shortcut for a bare, state-colored glyph; use `leading` for anything custom. */
    icon?: IconName | string;
    leading?: React.ReactNode;
    title: string | React.ReactNode;
    subtitle?: string | React.ReactNode;
    /** Any node, or ListRow.Toggle / .Value / .Spinner / .Chevron. */
    trailing?: React.ReactNode;
    /** Chevron after `trailing`; defaults on for pressable rows with no trailing or a ListRow.Value. */
    chevron?: boolean;
    destructive?: boolean;
    /**
     * Rank inside a group. `utility` is quieter (secondary, regular weight) for subordinate
     * actions under a section — e.g. “Manage this workplace” under the active workplace.
     */
    tone?: 'default' | 'utility';
    /**
     * Nesting depth. `0` (default) is flush with the group; each step indents by
     * `LIST_ROW_LEVEL_INDENT` so child rows read under a parent without a second list primitive.
     */
    level?: number;
    /** Search/scroll focus target id. */
    focusId?: string;
    /** Card rows: let string title/subtitle wrap instead of truncating. */
    wrap?: boolean;
    /** Extra content under the row, aligned with the row padding (e.g. a segmented control). */
    children?: React.ReactNode;
  };

const textOf = (node: React.ReactNode) =>
  typeof node === 'string' || typeof node === 'number' ? String(node) : undefined;

function ListRowBase(initialProps: ListRowProps) {
  const variant = useContext(ListVariantContext);
  const {
    icon,
    leading: leadingProp,
    title,
    subtitle,
    trailing,
    chevron,
    destructive = false,
    tone = 'default',
    level = 0,
    wrap = false,
    focusId,
    children,
    onPress: onPressProp,
    onLongPress,
    disabled = false,
    testID,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    pointerEvents,
    trailingMaxWidth,
    ...passthroughProps
  } = initialProps;

  const { boxProps } = extractBoxProps(passthroughProps);
  const { style, as: _as, ...rowBoxProps } = boxProps;

  const plain = variant === 'plain';
  const utility = tone === 'utility';
  const paddingH = PADDING[variant];
  const nestIndent = Math.max(0, level) * LIST_ROW_LEVEL_INDENT;
  const leading = icon !== undefined ? <RowIcon name={icon} /> : leadingProp;

  const toggle =
    isValidElement<React.ComponentProps<typeof RowToggle>>(trailing) && trailing.type === RowToggle
      ? trailing.props
      : null;
  const onPress = toggle ? () => toggle.onValueChange(!toggle.value) : onPressProp;
  const isPressable = onPress != null || onLongPress != null;
  const value =
    isValidElement<{ children?: React.ReactNode }>(trailing) && trailing.type === RowValue
      ? trailing
      : null;
  const showChevron = chevron ?? (onPressProp != null && (!trailing || value != null));
  const lines = plain || wrap ? undefined : 1;
  const valueText = value ? textOf(value.props.children) : undefined;
  const defaultLabel =
    [textOf(title), textOf(subtitle), valueText].filter(Boolean).join(', ') || undefined;
  const label = accessibilityLabel ?? defaultLabel;
  const hint = destructive ? 'Destructive action' : undefined;
  const a11yState: AccessibilityState | undefined =
    accessibilityState ??
    (toggle ? { checked: toggle.value, disabled } : disabled ? { disabled } : undefined);

  const hostProps = { testID, pointerEvents };

  const titleWeight = utility ? 'regular' : plain ? 'semibold' : 'regular';
  const titleVariant = utility ? 'bodySmall' : 'body';
  const titleColor = destructive ? 'error' : utility ? 'secondary' : undefined;

  const rowContent = (
    <>
      {leading && (
        <Box minWidth={ICON_SLOT} marginRight="md" alignItems="center">
          {leading}
        </Box>
      )}
      <Box flex={1} justifyContent="center">
        {typeof title === 'string' ? (
          <AppText
            variant={titleVariant}
            weight={titleWeight}
            color={titleColor}
            numberOfLines={lines}
            style={styles.title}
          >
            {title}
          </AppText>
        ) : (
          title
        )}
        {!subtitle ? null : typeof subtitle === 'string' ? (
          <AppText
            variant="caption"
            color="secondary"
            weight={plain && !utility ? 'medium' : undefined}
            numberOfLines={lines}
            style={styles.subtitle}
          >
            {subtitle}
          </AppText>
        ) : (
          subtitle
        )}
      </Box>
      {(trailing || showChevron) && (
        <Box
          marginLeft="md"
          flexDirection="row"
          alignItems="center"
          justifyContent="flex-end"
          gap={Spacing.xs}
          maxWidth={trailingMaxWidth}
          flexShrink={trailingMaxWidth ? 1 : undefined}
          minWidth={trailingMaxWidth ? 0 : undefined}
        >
          {trailing}
          {showChevron && <RowChevron />}
        </Box>
      )}
    </>
  );

  const nestedStyle = nestIndent > 0 ? [{ marginLeft: nestIndent }, style] : style;

  const rowBody = (
    <Box
      flexDirection="row"
      alignItems="center"
      paddingHorizontal={paddingH}
      paddingVertical={utility ? 'xs' : 'sm'}
      minHeight={isPressable ? (utility ? Size.touchTarget : Size.rowMin) : undefined}
      style={isPressable ? undefined : nestedStyle}
      {...rowBoxProps}
      {...(!isPressable
        ? {
            ...hostProps,
            accessibilityRole,
            accessibilityLabel,
            accessibilityState,
          }
        : null)}
    >
      {rowContent}
    </Box>
  );

  let row: React.ReactElement = isPressable ? (
    <PressScaleTouchable
      style={nestedStyle}
      onPress={onPress ? () => onPress() : undefined}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? (toggle ? 'switch' : 'button')}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={a11yState}
      {...hostProps}
    >
      {rowBody}
    </PressScaleTouchable>
  ) : (
    rowBody
  );

  if (children) {
    row = (
      <View>
        {row}
        <Box paddingHorizontal={paddingH} paddingBottom="sm" marginTop="sm">
          {children}
        </Box>
      </View>
    );
  }

  row = (
    <RowStateContext.Provider value={destructive || disabled ? { destructive, disabled } : IDLE}>
      {row}
    </RowStateContext.Provider>
  );

  return focusId ? <FocusTarget targetId={focusId}>{row}</FocusTarget> : row;
}

const IDLE: RowState = { destructive: false, disabled: false };

export const ListRow = Object.assign(ListRowBase, {
  Toggle: RowToggle,
  Value: RowValue,
  Spinner: RowSpinner,
});

const styles = StyleSheet.create({
  title: { flexShrink: 1 },
  subtitle: { marginTop: Spacing.xs / 2, flexShrink: 1 },
});
