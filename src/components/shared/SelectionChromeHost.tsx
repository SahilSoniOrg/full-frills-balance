import { coveredInteractionProps } from '@/src/components/shared/coveredInteractionProps';
import {
  SelectionDock,
  SelectionHeader,
  type SelectionOverlayProps,
} from '@/src/components/shared/SelectionOverlay';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type EdgePadding = {
  bottom?: number;
  left?: number;
  right?: number;
};

/** Shared covered-edge / selection-chrome slot keeping base chrome mounted without layout jump. */
function SelectionEdgeHost({
  active,
  edge,
  backgroundColor,
  edgePadding,
  overlay,
  children,
  style,
}: {
  active: boolean;
  edge: 'top' | 'bottom';
  backgroundColor: string;
  edgePadding?: EdgePadding;
  overlay: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!active && !children) return null;

  const paddingStyle = edgePadding
    ? {
        paddingBottom: edgePadding.bottom,
        paddingLeft: edgePadding.left,
        paddingRight: edgePadding.right,
      }
    : undefined;
  const coveredLayerStyle = [
    edge === 'top' ? styles.coveredHeaderLayer : styles.coveredFooterLayer,
    styles.coveredHidden,
  ];

  return (
    <View style={[active ? [styles.slot, { backgroundColor }, paddingStyle] : undefined, style]}>
      {children ? (
        <View style={active ? coveredLayerStyle : undefined} {...coveredInteractionProps(active)}>
          {children}
        </View>
      ) : null}
      {active ? overlay : null}
    </View>
  );
}

/**
 * Shared covered-header / selection-header slot used by Screen and the primary pager.
 * Base chrome stays mounted (covered) so layout does not jump when selection starts.
 */
export function SelectionHeaderHost({
  selection,
  backgroundColor,
  children,
  style,
}: {
  selection?: SelectionOverlayProps;
  backgroundColor: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SelectionEdgeHost
      active={Boolean(selection)}
      edge="top"
      backgroundColor={backgroundColor}
      overlay={selection ? <SelectionHeader {...selection} /> : null}
      style={style}
    >
      {children}
    </SelectionEdgeHost>
  );
}

/**
 * Shared covered-footer / selection-dock slot. Selection replaces the footer visually
 * instead of stacking both.
 */
export function SelectionFooterHost({
  selection,
  backgroundColor,
  edgePadding,
  children,
  style,
}: {
  selection?: SelectionOverlayProps;
  backgroundColor: string;
  edgePadding?: EdgePadding;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const hasActions = Boolean(selection?.actions?.length);
  const active = Boolean(selection) && (Boolean(children) || hasActions);
  return (
    <SelectionEdgeHost
      active={active}
      edge="bottom"
      backgroundColor={backgroundColor}
      edgePadding={hasActions ? edgePadding : undefined}
      overlay={selection && hasActions ? <SelectionDock {...selection} /> : null}
      style={style}
    >
      {children}
    </SelectionEdgeHost>
  );
}

const styles = StyleSheet.create({
  slot: { zIndex: 1 },
  coveredHidden: { opacity: 0 },
  coveredHeaderLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  coveredFooterLayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
