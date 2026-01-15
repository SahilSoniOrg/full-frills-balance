/**
 * Constants Index - Clear separation of concerns
 */

// Design tokens - Visual appearance only
export * from './design-tokens'
export * from './theme-helpers'

// App configuration - Behavior and settings only
export * from './app-config'

// Shape tokens - Exported for convenience (use via @/constants)
export { Shape } from './design-tokens'

