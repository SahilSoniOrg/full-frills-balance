/**
 * Color Math Utilities - The Single Source of Truth for Design System Calculations
 *
 * WCAG 2.1 Compliant formulas for contrast, luminance, and opacity.
 */

/**
 * Calculates the relative luminance of a color.
 * Formula: 0.2126 * R + 0.7152 * G + 0.0722 * B
 */
export function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const rIdx = cleanHex.length === 3 ? 0 : 0;
  const gIdx = cleanHex.length === 3 ? 1 : 2;
  const bIdx = cleanHex.length === 3 ? 2 : 4;
  const length = cleanHex.length === 3 ? 1 : 2;

  const extract = (start: number) => {
    const part = cleanHex.substring(start, start + length);
    const val = parseInt(length === 1 ? part + part : part, 16);
    const srgb = val / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };

  const r = extract(rIdx);
  const g = extract(gIdx);
  const b = extract(bIdx);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates the contrast ratio between two relative luminance values.
 */
export function getContrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks the color (from two options) that has the best contrast ratio with the background.
 */
export function getWCAGContrastColor(
  backgroundColor: string,
  lightToken: string,
  darkToken: string,
): string {
  const bgLum = getLuminance(backgroundColor);
  const lightLum = getLuminance(lightToken);
  const darkLum = getLuminance(darkToken);

  const lightRatio = getContrastRatio(bgLum, lightLum);
  const darkRatio = getContrastRatio(bgLum, darkLum);

  return lightRatio >= darkRatio ? lightToken : darkToken;
}

/**
 * Apply opacity to a hex color and return RGBA string.
 */
export function withOpacity(color: string, opacity: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
  const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
  const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Adds alpha to a hex color and returns hex-with-alpha string.
 * @deprecated Use withOpacity for RGBA return value which is more standard in this RN project.
 */
export function addAlpha(hexColor: string, opacity: number): string {
  const _opacity = Math.round(Math.min(Math.max(opacity || 1, 0), 1) * 255);
  return hexColor + _opacity.toString(16).toUpperCase().padStart(2, '0');
}
