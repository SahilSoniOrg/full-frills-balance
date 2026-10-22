import { Spacing } from '@/src/constants/design-tokens';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSafeAreaInsets, type Edge, type EdgeInsets } from 'react-native-safe-area-context';

const EDGE_BITS = { top: 1, right: 2, bottom: 4, left: 8 } as const;
const ALL_EDGES = 15;

function createLayout(insets: EdgeInsets) {
  const bottom = insets.bottom;
  return {
    insets,
    bottomSpacing: {
      formFooter: Math.max(Spacing.lg, bottom + Spacing.md),
      journalFooter: Math.max(Spacing.md, bottom + Spacing.xs),
      sheet: bottom + Spacing.lg,
      pickerSheet: bottom + Spacing.md,
      floatingAction: Math.max(Spacing.xl, bottom + Spacing.md),
      selectionActions: Math.max(Spacing.md, bottom + Spacing.sm),
      exportSheet: bottom + Spacing.xxxl,
      updateGate: Math.max(bottom, Spacing.lg),
      tabBar: bottom + Spacing.md,
    },
  };
}

// Compute the possible inset ownership combinations once per window change.
// Consumers select a shared value; they do not each recalculate spacing.
function createLayouts(insets: EdgeInsets) {
  return Array.from({ length: ALL_EDGES + 1 }, (_, edges) =>
    createLayout({
      top: edges & EDGE_BITS.top ? insets.top : 0,
      right: edges & EDGE_BITS.right ? insets.right : 0,
      bottom: edges & EDGE_BITS.bottom ? insets.bottom : 0,
      left: edges & EDGE_BITS.left ? insets.left : 0,
    }),
  );
}

const LayoutsContext = createContext(createLayouts({ top: 0, right: 0, bottom: 0, left: 0 }));
const AvailableEdgesContext = createContext(ALL_EDGES);

/** Mount inside the root native SafeAreaProvider. Insets remain responsive to rotation. */
export function AppSafeAreaProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const layouts = useMemo(() => createLayouts(insets), [insets]);
  return <LayoutsContext.Provider value={layouts}>{children}</LayoutsContext.Provider>;
}

/** Insets still available after parent pages or navigation chrome have applied them. */
export function useSafeAreaLayout() {
  return useContext(LayoutsContext)[useContext(AvailableEdgesContext)];
}

/** Native overlays occupy the window, independently of the page that opened them. */
export function useWindowSafeAreaLayout() {
  return useContext(LayoutsContext)[ALL_EDGES];
}

export function useAvailableSafeAreaEdges(edges: readonly Edge[]) {
  const available = useContext(AvailableEdgesContext);
  return edges.filter(edge => available & EDGE_BITS[edge]);
}

/** Declare ownership without adding another view or measuring the window again. */
export function SafeAreaScope({
  children,
  consumedEdges = [],
  window = false,
}: {
  children: ReactNode;
  consumedEdges?: readonly Edge[];
  window?: boolean;
}) {
  const inherited = useContext(AvailableEdgesContext);
  const consumed = consumedEdges.reduce((mask, edge) => mask | EDGE_BITS[edge], 0);
  const available = (window ? ALL_EDGES : inherited) & ~consumed;
  return (
    <AvailableEdgesContext.Provider value={available}>{children}</AvailableEdgesContext.Provider>
  );
}
