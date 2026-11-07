# Retail DWH: site

The portfolio site for this warehouse. Astro 6.4, static output, deployable to Vercel.
English at the root, Ukrainian under `/uk`, light and dark themes.

## Why these choices

- **Astro, no framework islands.** The site is content plus one report. Static output
  ships almost no JavaScript, and `<ClientRouter />` gives navigation without a reload.
- **Tailwind through PostCSS, not `@tailwindcss/vite`.** The Vite plugin at 4.3.3 crashes
  against Astro 6.4's rolldown-based Vite 8. See `postcss.config.mjs`.
- **The report is hand-written TypeScript and SVG.** No charting library: the measures
  are plain functions that can be tested, and the charts are a few dozen lines each.
- **Self-hosted fonts, including Cyrillic.** Half the site is Ukrainian, and without the
  Cyrillic subsets those pages fall back to system fonts.

## Layout

```
scripts/fetch-fonts.mjs        Google Fonts woff2 into public/fonts + src/styles/fonts.css
scripts/build-report-data.mjs  warehouse into public/data/report.json
scripts/build-insights.mjs     home page answers and their SQL into src/data/insights.json
src/i18n/index.ts              locales, routing helpers, short UI strings
src/components/pages/          one component per page, prose in both languages side by side
                               (Model, Decisions and Results sit under the /how section)
src/pages/                     thin routes, each renders a page component with a locale
src/report/aggregate.ts        the measures, pure functions, no DOM
src/report/aggregate.test.ts   checks them against figures taken from SQL
src/report/report.ts           renders the report and wires its filters
src/report/labels.ts           English names for what the warehouse stores in Ukrainian
src/data/tables.ts             the model as the star diagram and the matrix draw it
```

## Data

`public/data/report.json` is generated locally and committed, because the deploy has no
access to the warehouse, so it does not update by itself: rerun `npm run data` whenever
the warehouse changes. Sales come from `star`, so a sale counts in the category the
product had on that day, as in Power BI. Stock comes from `dbt_star`. It is rolled up to
month, store, channel and category, and amounts are rounded to whole hryvnias, which
moves the totals by less than 200 UAH.

Order counts are stored twice on purpose. An order belongs to one month, store and
channel, so counts add up across those. It can contain several categories, so
per-category counts must not be added across categories. See `aggregate.ts`.

To regenerate it, start the warehouse (`docker compose up -d` in the repository root),
then run `npm run data`, then `npm test`. The expected values in `aggregate.test.ts` come
from SQL, so refresh them from SQL by hand if the warehouse figures change.

## Commands

```
npm run dev      # localhost:4321
npm run build    # into dist/
npm run preview
npm test         # measures against SQL figures
npm run check    # types
npm run verify   # check, test and build
npm run fonts    # one-off, needs network access
npm run data     # needs the warehouse running
```

Node 22.18 or newer: the tests run TypeScript directly.

## Deploying to Vercel

Set the project's **root directory** to `site/`. Framework preset: Astro. No adapter is
needed. Once the project exists, replace the placeholder `site` URL in
`astro.config.mjs`, because canonical and hreflang URLs are built from it.
