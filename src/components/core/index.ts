/**
 * Design System Components - Core Components Only
 *
 * These are the ONLY components that should be used for new UI code.
 * They encode the visual identity and are hard to misuse.
 *
 * Rules:
 * - No new components without concrete use case
 * - No variant explosion
 * - Standardized layout primitives (Box/Stack)
 * - Must stay small and strict (~5 props max)
 */

export { AppText } from './AppText';
export type { AppTextProps } from './AppText';

export { AppCard } from './AppCard';
export type { AppCardProps } from './AppCard';

export { AppSurface } from './AppSurface';
export type { AppSurfaceProps } from './AppSurface';

export { AppButton } from './AppButton';
export type { AppButtonProps } from './AppButton';

export { AppInput } from './AppInput';
export type { AppInputProps } from './AppInput';

export { AppInputField } from './AppInputField';
export type { AppInputFieldProps } from './AppInputField';

export { ListRow } from './ListRow';
export type { ListRowProps } from './ListRow';

export { Badge } from './Badge';
export type { BadgeProps } from './Badge';

export { AppIcon, isValidIconName } from './AppIcon';
export type { IconName } from './AppIcon';
export { ErrorBoundary } from './ErrorBoundary';
export { ExpandableSearchButton } from './ExpandableSearchButton';
export { FloatingActionButton } from './FloatingActionButton';
export { IconButton } from './IconButton';
export { IvyIcon } from './IvyIcon';

export { LoadingView } from '../common/LoadingView';
export type { LoadingViewProps } from '../common/LoadingView';

export { EmptyStateView } from '../common/EmptyStateView';
export type { EmptyStateViewProps } from '../common/EmptyStateView';

export { AppToggle } from './AppToggle';
export type { AppToggleProps } from './AppToggle';

export { AppSegmentedControl } from './AppSegmentedControl';
export type { SegmentedOption } from './AppSegmentedControl';
