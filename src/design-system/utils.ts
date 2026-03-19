import { RadiusKey, Shape, Spacing, SpacingKey, Theme } from '@/src/constants/design-tokens'

export function resolveSpacing(value: SpacingKey | number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value
  return Spacing[value]
}

export function resolveRadius(value: RadiusKey | number | undefined): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value
  return Shape.radius[value]
}

export function resolveThemeColor(theme: Theme, color: keyof Theme | string | undefined): string | undefined {
  if (color === undefined) return undefined
  if (color in theme) return theme[color as keyof Theme]
  return color
}

export function negateSpace(value: SpacingKey | number | undefined): number | undefined {
  const resolved = resolveSpacing(value)
  if (resolved === undefined) return undefined
  return -resolved
}
