/**
 * JS-side mirror of the theme in src/styles/theme.css.
 *
 * Use this only where a raw colour string is unavoidable - canvas, charts,
 * generated PDFs, inline SVG fills, third-party widget options. Anything
 * rendered with Tailwind should use the theme utilities instead
 * (bg-brand, text-brand, border-brand/20, bg-surface, bg-ink, ...).
 *
 * Same rules as the CSS theme: one orange, neutral greys. If the orange
 * changes, change it in theme.css and here - nowhere else.
 */

/** The one brand orange - hsl(24 100% 50%). */
export const BRAND = '#ff6600';

export const THEME = {
    /** Every accent, CTA and focus ring. */
    brand: BRAND,
    brandForeground: '#fafafa',

    /** Page and card background. */
    surface: '#ffffff',

    /** Dark - sidebar and inverted panels only. */
    ink: '#0a0a0a',
    inkForeground: '#fafafa',

    /** Default body text. */
    foreground: '#0a0a0a',
    /** Quiet fills. */
    muted: '#f5f5f5',
    /** Secondary text. */
    mutedForeground: '#737373',
    /** Hairlines, dividers, input outlines. */
    border: '#e5e5e5',

    destructive: '#ef4444',
    destructiveForeground: '#fafafa',
} as const;

/**
 * The brand orange at a given opacity, matching the `bg-brand/NN` utilities.
 * `brandAlpha(10)` is the old "orange-50" tint.
 */
export const brandAlpha = (percent: number): string =>
    `color-mix(in srgb, ${BRAND} ${percent}%, transparent)`;

/** Linear blend between two hex colours. `amount` is 0 = a, 1 = b. */
const mixHex = (a: string, b: string, amount: number): string => {
    const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    const channel = (x: number, y: number) =>
        Math.round(x + (y - x) * amount).toString(16).padStart(2, '0');
    return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
};

/** A tint of the brand orange towards white. `brandTint(0)` is the brand itself. */
export const brandTint = (amount: number): string => mixHex(BRAND, '#ffffff', amount);

/** A shade of the brand orange towards black. */
export const brandShade = (amount: number): string => mixHex(BRAND, '#0a0a0a', amount);

/**
 * Categorical palette for charts (recharts pie slices, bar series, ...).
 *
 * Still one orange - the series are separated by lightness, not by hue, so a
 * chart never introduces a colour the rest of the app does not have. Ordered
 * strongest first so a two- or three-series chart uses the boldest steps.
 * Concrete hex, not color-mix(), because these end up in SVG fill attributes.
 */
export const CHART_COLORS: readonly string[] = [
    BRAND,
    brandTint(0.35),
    brandShade(0.3),
    brandTint(0.6),
    brandShade(0.5),
    brandTint(0.8),
    brandShade(0.65),
    brandTint(0.9),
];

/** Neutral grey ramp for incidental text and hairlines. */
export const GRAY = {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
} as const;

/**
 * @deprecated Kept for backwards compatibility. There is no orange ramp in
 * this theme - every shade below is the one brand orange. Use `THEME.brand`
 * or the `bg-brand/NN` utilities instead.
 */
export const COLORS = {
    primary: {
        50: BRAND,
        100: BRAND,
        200: BRAND,
        300: BRAND,
        400: BRAND,
        500: BRAND,
        600: BRAND,
        700: BRAND,
        800: BRAND,
        900: BRAND,
        950: BRAND,
    },
    secondary: {
        gray: GRAY,
    },
};
