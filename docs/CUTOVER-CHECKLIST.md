# Cutover checklist — retiring the Experience Builder app

Per decision D10 the original app stays untouched until the owner accepts the
replacement. When ready, work through this list (all steps are owner actions
in ArcGIS Online unless noted).

## Before announcing

- [ ] Review [PARITY.md](PARITY.md) side-by-side with the live EXB app and
      sign off (this is the acceptance gate).
- [ ] Decide the two open data items (value-corruption fixes, legacy
      unlinked entries) or explicitly defer them.
- [ ] Confirm any USACE public-release/branding review that applies to the
      new URL has been satisfied (risk R6 in the assessment).

## Cutover

- [ ] Point people at https://usace-wrises.github.io/resst-dev/ (or transfer
      this repo over `usace-wrises/resst` when ready — GitHub redirects the
      old repo URL after a rename/transfer; Pages URL then becomes
      `/resst/`, so update `base` in `vite.config.ts` accordingly).
- [ ] In the EXB app, replace the welcome text with a short "RESST has
      moved" notice linking the new URL (leave the app functional during the
      parallel-run window).
- [ ] After the parallel window: unshare or delete the Web Experience item.

## ArcGIS housekeeping (from the migration findings)

- [ ] The published EXB config embeds ArcGIS tokens in cached Survey123
      thumbnail URLs (assessment risk R8) — likely expired, but review; any
      re-publish re-embeds fresh ones.
- [ ] The test page `/page/DummyTestingSteps` is publicly reachable in the
      EXB app — removed automatically when the app is retired.
- [ ] Decide the fate of the Survey123 forms and hosted services: keep
      read-only as the historical record (recommended — the migration
      extracts under `RESST-migration/` were verified against them), or
      archive/export and remove.
- [ ] Update the old `usace-wrises/resst` repository README to point here.

## After cutover

- [ ] Watch the Pages traffic/issues for a few weeks.
- [ ] Confirm data editors know the workflow in
      [DATA-EDITING.md](DATA-EDITING.md).
