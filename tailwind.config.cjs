/** @type {import('tailwindcss').Config} */

/* The `primary-*` scale is legacy. New code should use the theme tokens from
   src/styles/theme.css (bg-brand, text-brand, border-brand/20, ...), which are
   the single source of colour truth.

   This scale is kept only so older call sites keep rendering on-theme: every
   shade resolves back to --color-brand, tinted with white for the light end
   rather than being a second, unrelated orange. Change the orange in
   theme.css and this scale follows. */
const brand = 'var(--color-brand)';
const tint = (pct) => `color-mix(in srgb, ${brand} ${pct}%, #ffffff)`;

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: tint(6),
          100: tint(12),
          200: tint(24),
          300: tint(40),
          400: tint(60),
          500: brand,
          600: brand,
          700: tint(90),
          800: tint(90),
          900: tint(90),
          950: tint(90),
          DEFAULT: brand,
        },
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
