/**
 * Design System Components - Core Components Only
 * 
 * These are the ONLY components that should be used for new UI code.
 * They encode the visual identity and are hard to misuse.
 * 
 * Rules:
 * - No new components without concrete use case
 * - No variant explosion 
 * - No layout primitives
 * - Must stay small and strict (~5 props max)
 */

export { AppText } from './AppText'
export type { AppTextProps } from './AppText'

export { AppCard } from './AppCard'
export type { AppCardProps } from './AppCard'

export { AppButton } from './AppButton'
export type { AppButtonProps } from './AppButton'

export { ListRow } from './ListRow'
export type { ListRowProps } from './ListRow'

export { Badge } from './Badge'
export type { BadgeProps } from './Badge'

export { Divider } from './Divider'
export type { DividerProps } from './Divider'

