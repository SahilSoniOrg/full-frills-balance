/**
 * Color Utilities
 */

/**
 * Calculates the contrast color (black or white) for a given hex color.
 * Based on YIQ luminance formula.
 */
export function getContrastColor(hexColor: string): 'black' | 'white' {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? 'black' : 'white';
}

/**
 * Adds alpha to a hex color.
 */
export function addAlpha(hexColor: string, opacity: number): string {
    const _opacity = Math.round(Math.min(Math.max(opacity || 1, 0), 1) * 255);
    return hexColor + _opacity.toString(16).toUpperCase().padStart(2, '0');
}
