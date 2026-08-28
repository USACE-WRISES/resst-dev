# Reservoir Sustainable Sediment Tool (RESST)

A static web application for exploring reservoir sediment-management case
studies, sites, and literature — the maintained successor to the ArcGIS
Experience Builder version of RESST.

**Live application:** https://usace-wrises.github.io/resst-dev/
**Data downloads:** the [`data-latest` release](https://github.com/USACE-WRISES/resst-dev/releases/tag/data-latest) (Shapefile, GeoPackage, File Geodatabase, CSV)

## What's in the box

- **The data is the repository.** `data/*.csv` are the authoritative tables
  (sites, literature surveys, literature entries, NID snapshot). Every change
  goes through a pull request, is validated by CI, and automatically rebuilds
  both the app and the GIS downloads. See [docs/DATA-EDITING.md](docs/DATA-EDITING.md).
- **The app** (Vite + React + TypeScript + MapLibre GL) renders a USGS topo
  map with the site and literature layers, 40 keyword filters, four result
  tables, cross-linked selection details (including National Inventory of
  Dams records), map views, reference overlays, guided help, and exports.
- **Behavioral parity** with the retired Experience Builder app was captured
  and verified record-for-record before the rebuild — see
  [docs/PARITY.md](docs/PARITY.md) and the full assessment under
  [RESST-migration/](RESST-migration/07-assessment/RESST-migration-assessment.md).

## Development

```bash
npm ci
npm run dev        # dev server at http://localhost:5173/resst-dev/
npm run validate   # data checks (run after editing data/)
npm run build:data # data/*.csv -> public/data/*.json
npm test           # unit tests (filter-engine parity baselines)
npx playwright test  # end-to-end + accessibility suite
npm run build      # typecheck + production build
```

## Repository map

| Path | Purpose |
|---|---|
| `data/` | Authoritative CSV tables + `MIGRATION-LOG.md` |
| `scripts/` | Data tooling: validate, build-data, migrate (one-time), export bundles, PR diff, config generators |
| `src/config/` | Typed app configuration: fields/labels, filters, tabs, map views, help content |
| `src/filters/` | The pure filter engine (verified parity semantics) |
| `src/map/` | MapLibre map, overlays, views, search, box select |
| `public/data/` | Generated runtime JSON (never edit by hand) |
| `tests/` | Vitest unit + Playwright e2e/a11y suites |
| `docs/` | Runbooks: data editing, deployment, parity, cutover |
| `RESST-migration/` | Read-only evidence archive of the original ArcGIS app |
| `.github/workflows/` | CI, Pages deploy, GIS export builds, PR data-diff |

## Architecture in one paragraph

The CSVs are converted at build time into small JSON files the browser loads
once (~1 MB gzipped total); all filtering, search, selection, and counting run
client-side (the dataset is ~1,400 point features + 1,410 related rows).
Reference layers (NID dams, stream gauges, USGS HUC boundaries, rivers, SSURGO
soils) stream on demand from their public services and are never stored here.
There is no server, no database, and no API key anywhere in the system.
