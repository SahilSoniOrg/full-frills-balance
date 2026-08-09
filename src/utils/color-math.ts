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
 * Blends two hex colors together based on alpha weight.
 * Returns a solid 6-digit hex string.
 */
export function blendColors(fg: string, bg: string, alpha: number): string {
  const parse = (hex: string) => {
    const c = hex.replace('#', '');
    const r = parseInt(c.length === 3 ? c[0] + c[0] : c.substring(0, 2), 16);
    const g = parseInt(c.length === 3 ? c[1] + c[1] : c.substring(2, 4), 16);
    const b = parseInt(c.length === 3 ? c[2] + c[2] : c.substring(4, 6), 16);
    return [r, g, b];
  };

  const [rf, gf, bf] = parse(fg);
  const [rb, gb, bb] = parse(bg);

  const r = Math.round(rf * alpha + rb * (1 - alpha));
  const g = Math.round(gf * alpha + gb * (1 - alpha));
  const b = Math.round(bf * alpha + bb * (1 - alpha));

  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
