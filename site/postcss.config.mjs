// Tailwind is wired through PostCSS rather than @tailwindcss/vite: as of
// Tailwind 4.3.3 the Vite plugin fails against Astro 6.4's rolldown-based
// Vite 8. The PostCSS path produces identical output and does not touch Vite
// resolve.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
