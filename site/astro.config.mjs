// @ts-check
import { defineConfig } from 'astro/config';
// Tailwind is loaded via postcss.config.mjs. See the note there.

// Static output: Vercel serves plain files, so no adapter is needed.
// Navigation without a reload comes from <ClientRouter /> in Base.astro.
export default defineConfig({
  // Placeholder until the Vercel project exists. Only canonical and hreflang
  // URLs depend on it.
  site: 'https://retail-dwh.vercel.app',
  output: 'static',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'uk'],
    routing: { prefixDefaultLocale: false },
  },
  trailingSlash: 'never',
  // 'directory' emits report/index.html rather than report.html. Static hosts
  // resolve /report to an index file; with 'file' the same request looks for a
  // directory that does not exist and returns 404.
  build: { format: 'directory' },
});
