# RESST Migration: Claude Architecture Brief and Artifact-Collection Guide

## Purpose

Use this document to ask Claude to independently assess and plan the migration of the Reservoir Sustainable Sediment Tool (RESST) from ArcGIS Experience Builder into a maintainable, AI-friendly application.

The existing public application is:

- **Application:** Reservoir Sustainable Sediment Tool (RESST)
- **Public URL:** https://experience.arcgis.com/experience/b1eec438459e45c284df2fcf89e5d8e0
- **ArcGIS Experience item ID:** `b1eec438459e45c284df2fcf89e5d8e0`

Give Claude this Markdown file together with whatever configuration files, data exports, screenshots, recordings, and supporting files you have collected. Claude should be able to begin with a partial package, inventory it, and tell you exactly what is still missing.

---

# Part I — Master Prompt for Claude

## BEGIN PROMPT

You are serving as the senior geospatial web architect, migration engineer, data engineer, accessibility reviewer, and deployment advisor for the Reservoir Sustainable Sediment Tool (RESST). Think deeply and independently about the best path forward. Do not simply execute the first technical approach suggested to you.

The current public application is:

- **Name:** Reservoir Sustainable Sediment Tool (RESST)
- **URL:** https://experience.arcgis.com/experience/b1eec438459e45c284df2fcf89e5d8e0
- **ArcGIS Experience item ID:** `b1eec438459e45c284df2fcf89e5d8e0`

The application was created in ArcGIS Online Experience Builder. It uses two principal point datasets associated with dams/reservoirs and ecological information. Users explore sites on an interactive map, apply several categories of keyword filters, inspect site and literature information, review synchronized tabular results, and export information for use in decision-making.

The owner wants to migrate away from ArcGIS Experience Builder so that the application:

- Lives in a conventional, version-controlled source repository.
- Can be understood, maintained, tested, and extended with AI assistance.
- Is not locked into Experience Builder's generated runtime and configuration system.
- Can support additional functionality over time.
- Can be hosted reliably and economically.
- Preserves the current application's useful behavior and information.
- Remains understandable and maintainable by future developers.

## Initial proposed direction

The following is the owner's initial proposed direction. Treat it as a serious working hypothesis, but **not** as a binding architectural decision:

> Rebuild the Reservoir Sustainable Sediment Tool as a clean, independent static TypeScript web application. The ArcGIS Experience Builder files are provided only as a behavioral and visual reference; do not attempt to modify or reuse minified ArcGIS runtime bundles. First inventory the Experience configuration, web-map configuration, datasets, field definitions, widgets, filters, popups, interactions, and export functions. Produce a migration matrix mapping each existing capability to its replacement implementation. Then create a Vite-based application using MapLibre GL JS with a responsive map, point clustering, synchronized map and table selection, multi-category keyword filters, clear-filter controls, site-detail display, accessible controls, and CSV/GeoJSON export. Preserve all field meanings, filter behavior, point symbology, attribution, links, and empty-value handling. Store display fields, filter definitions, and popup configuration separately from application logic so they can be modified without rewriting components. Add automated tests for filtering, selection synchronization, record counts, and exports. Do not invent missing requirements; list ambiguities before implementation.

Independently determine whether that proposed direction is actually the best choice. You may recommend and use a different framework, mapping library, data format, hosting platform, build system, or overall architecture when the evidence supports it. Do not preserve an Esri technology merely because the current app uses it, and do not remove an Esri dependency merely for ideological reasons. Base the decision on documented requirements, technical evidence, maintainability, cost, risk, and the likely future direction of the tool.

## Important working rules

1. **Begin with investigation and recommendations, not implementation.** Do not scaffold or rewrite the application until you have completed the initial assessment and the owner has approved the recommended direction.
2. **Treat the public application as a behavioral reference.** Inspect it directly if your browser and permissions allow. Do not rely only on screenshots or only on configuration JSON.
3. **Treat exported data as authoritative only after checking it.** Compare record counts, identifiers, schemas, missing values, and filter results with the live application.
4. **Do not modify the production ArcGIS application or its hosted layers.** All ArcGIS inspection should be read-only unless the owner explicitly authorizes a change.
5. **Do not reuse or reverse-engineer minified Experience Builder runtime bundles.** Reimplement the behavior cleanly using documented APIs and open, maintainable source code.
6. **Do not invent requirements, field meanings, filter semantics, or missing data.** Clearly distinguish facts, reasonable inferences, recommendations, and unresolved questions.
7. **Ask consolidated questions.** After examining all supplied evidence, ask one organized set of the highest-value questions rather than repeatedly interrupting the work for individual details.
8. **Use current primary documentation.** Browse current official documentation for ArcGIS, Posit Connect Cloud, GitHub Pages, candidate frameworks, mapping libraries, accessibility requirements, and deployment constraints. Record the date checked and link the sources supporting material platform claims.
9. **Do not expose credentials.** Never request that passwords, ArcGIS tokens, private API keys, populated `.env` files, or other secrets be placed in the repository or prompt attachments.
10. **Preserve the current application until the replacement is verified.** Plan for a parallel validation period and a reversible cutover.

## Phase A — Inventory all supplied evidence

Inspect every supplied file and create a file inventory. Possible inputs include:

- Experience item metadata JSON.
- Experience item data JSON.
- Published `config/config.json`.
- Experience resource inventory.
- Web-map item metadata and web-map data JSON.
- Hosted feature-layer definition JSON.
- GeoJSON exports.
- GeoPackage exports.
- File geodatabase exports, if attachments exist.
- Original shapefiles.
- Images, logos, icons, documents, and linked literature.
- Screenshots and a workflow screen recording.
- Existing user documentation.
- Notes about desired future functionality.

For every input, report:

- Filename and format.
- Apparent purpose.
- Whether it appears current and complete.
- Important content it contributes to the migration.
- Dependencies or identifiers found inside it.
- Potential conflicts with another supplied artifact.
- Whether it contains information that should not be published.
- Whether an additional or better export is needed.

Identify every external dependency referenced anywhere in the files, including:

- ArcGIS web maps.
- Hosted feature layers and sublayers.
- Hosted tables.
- Feature-service URLs.
- Related records.
- Record attachments.
- Basemaps and tile services.
- Images, logos, thumbnails, and icons.
- PDFs and literature links.
- External websites.
- Geocoding, search, print, export, or analysis services.
- ArcGIS item IDs and layer IDs.
- Any authentication or API-key requirements.

Produce a prioritized list of missing artifacts with exact instructions for obtaining each one.

## Phase B — Reverse-specify the existing application

Create a migration matrix that documents the current system before proposing its replacement. Include at least these columns:

| Existing page/component | Current behavior | Data dependency | Trigger/action | Required parity | Proposed replacement | Confidence | Open question |
|---|---|---|---|---|---|---|---|

Inventory and explain:

- Pages, views, panels, dialogs, and responsive layouts.
- Map layers, layer order, visibility, opacity, clustering, labels, legends, and symbols.
- Initial map center, zoom, extent, and basemap.
- Search behavior.
- Site selection behavior.
- Map-to-table and table-to-map synchronization.
- Popup and site-detail content.
- Site keyword filters.
- Site-literature keyword filters.
- General-literature keyword filters.
- Filter combination semantics, including whether selections use AND or OR logic within and between categories.
- Filter counts and how empty selections behave.
- Selected-filter chips, indicators, or summaries.
- Clear-one-filter and clear-all-filter behavior.
- Results tables, tabs, columns, sorting, pagination, searching, and selection.
- Links, citations, downloads, and exports.
- Any tools or behaviors not obvious from the public landing view.
- Desktop, tablet, and mobile behavior.
- Empty, loading, error, and no-result states.

For filters and exports, establish reproducible baseline checks such as:

- Total record counts for each dataset.
- Counts returned by representative individual filters.
- Counts returned by representative combined filters.
- The identity of records returned by those filters.
- Expected CSV and GeoJSON fields.
- How nulls, blank strings, lists, delimiters, and repeated keywords are handled.

Do not assume that the visible label for a field is the same as its stored field name.

## Phase C — Audit and redesign the data layer

Assess the two primary point datasets and any supporting tables. Determine:

- Authoritative source and most recent version.
- Record count and unique identifier quality.
- Coordinate reference system and coordinate validity.
- Field names, aliases, types, units, domains, and coded values.
- Nulls, blank strings, sentinel values, malformed URLs, and duplicate records.
- Whether keyword fields contain delimited strings, normalized values, or relationships that should be represented differently.
- Whether site and literature data should remain in one flat dataset or be normalized into separate related files/tables.
- Whether any fields should be excluded from a public deployment.
- Whether attachments or related records must be preserved.
- Whether GeoJSON is sufficiently small and performant for direct browser loading.
- Whether GeoPackage should remain the authoritative source with a reproducible build script generating web-ready data.
- Whether GeoParquet, FlatGeobuf, PMTiles, a database, or an API would materially improve the result.

Measure actual file sizes and feature counts before choosing the runtime format. Avoid premature complexity, but identify the threshold at which the recommended approach would need to change.

Recommend a reproducible data-update workflow. It should ideally allow a future maintainer to replace or update the authoritative data, run validation, regenerate web-ready files, and deploy without manually editing application code.

At minimum, consider separating these concerns:

- Authoritative source data.
- Generated web data.
- Field and display configuration.
- Filter definitions and option ordering.
- Popup/detail configuration.
- Validation rules.
- Application code.

## Phase D — Compare candidate architectures

Do not assume the replacement must be a static TypeScript site or a Shiny application. Evaluate the smallest reasonable set of serious alternatives, including:

1. A static TypeScript/JavaScript application.
2. An R Shiny application.
3. A hybrid design with a static frontend and a small backend or API, if justified.
4. Any materially better alternative you identify.

For the static option, evaluate appropriate choices such as:

- Vite or another build system.
- Plain TypeScript, React, Preact, Vue, Svelte, or another justified UI approach.
- MapLibre GL JS, Leaflet, OpenLayers, ArcGIS Maps SDK for JavaScript, or another justified mapping library.
- A suitable accessible table implementation.
- Client-side search and filter architecture.
- GeoJSON versus more scalable browser data formats.
- Browser memory, initial load time, mobile performance, and caching.

For the Shiny option, evaluate:

- R package choices for the map, table, UI, testing, and dependency management.
- Server sessions, worker sizing, idle behavior, concurrency, startup time, and state preservation.
- Whether R-based analyses or report generation provide a genuine advantage for this particular application.
- How the app would be tested, versioned, and deployed on Posit Connect Cloud.

For a hybrid option, explain what the backend actually contributes. Do not recommend a backend merely as future-proofing when the current and foreseeable functions can be handled reliably in the browser.

Compare the options using a decision matrix. Include at least:

- Fidelity to existing behavior.
- Fit for current dataset size and complexity.
- Anticipated future analytical functionality.
- Initial development effort.
- Long-term maintainability.
- Ease of AI-assisted maintenance.
- Testability.
- Accessibility.
- Performance and startup time.
- Mobile behavior.
- Data-update workflow.
- Authentication and access-control capability.
- Security and secret-management needs.
- Hosting complexity.
- Reliability and operational burden.
- Vendor dependence.
- Expected ongoing cost.
- Portability to a different host later.
- Suitability for applicable USACE review and public-release processes.

State the weighting or reasoning you use. Recommend one architecture, explain why it wins, identify the strongest runner-up, and state what future requirement would cause you to revisit the decision.

## Phase E — Evaluate hosting independently

Investigate current hosting options rather than relying on remembered capabilities. At minimum, evaluate:

- GitHub Pages.
- Posit Connect Cloud.
- Any GitHub-based static deployment option that is materially better than GitHub Pages.
- Another appropriate static or application host if it offers a meaningful advantage.
- An internal or USACE-managed option if the supplied constraints indicate that public commercial hosting is unsuitable.

Do not assume the code repository and deployment host must be the same service.

For each serious hosting candidate, determine:

- Whether it can host the selected architecture.
- Whether it supports purely static assets, server-side processes, or both.
- Public versus authenticated access options.
- Repository integration and deployment automation.
- Build and runtime limits.
- File-size and bandwidth considerations.
- Custom-domain and HTTPS support.
- Environment-variable and secret handling.
- Logging, monitoring, rollback, and version history.
- Expected cost under the likely usage pattern.
- Vendor lock-in and ease of moving later.
- Operational effort for the owner.
- Any relevant government, organizational, accessibility, or public-release considerations that must be confirmed rather than assumed.

Use current official documentation and provide source links for material claims. Clearly separate documented facts from inferences. If account-tier information or organization policy is unavailable, identify it as a decision dependency rather than guessing.

Select a recommended hosting approach and a fallback. Explain whether a static deployment should be preferred initially and whether Posit Connect Cloud should be reserved for future server-side analysis, or whether the evidence supports a different conclusion.

## Phase F — Define the proposed replacement

After selecting an architecture, provide a concrete technical design that includes:

- Repository and directory structure.
- Major components and their responsibilities.
- Application state and filter-state design.
- Map and table synchronization approach.
- Configuration-file design.
- Data loading and validation approach.
- Search and filtering approach.
- URL/link handling.
- Export implementation.
- Error and empty-state handling.
- Responsive-layout strategy.
- Accessibility strategy, including keyboard navigation, labels, focus management, contrast, reduced motion where relevant, and screen-reader behavior.
- Testing strategy.
- Build and deployment workflow.
- Data-update and maintenance workflow.
- Documentation needed for future maintainers.

Prefer straightforward, well-supported technology over unnecessary layers of abstraction. Avoid a complex global state library, backend, database, or component framework unless it provides a clear benefit.

If the selected approach is static, consider whether the following working structure is appropriate, but revise it as needed:

    resst/
    ├── src/
    │   ├── components/
    │   ├── map/
    │   ├── filters/
    │   ├── table/
    │   ├── state/
    │   ├── config/
    │   └── utilities/
    ├── data-source/
    ├── public/data/
    ├── scripts/
    ├── tests/
    ├── docs/
    └── .github/workflows/

Keep field display rules, filter definitions, popup fields, category ordering, external links, and export-field selections in typed configuration where practical rather than scattering them through UI components.

## Phase G — Testing and acceptance criteria

Design tests before implementation. Include:

- Data-schema validation.
- Unique-ID and coordinate validation.
- Unit tests for each filter group.
- Tests for AND/OR combination semantics.
- Tests for nulls, blanks, delimiters, and special characters.
- Tests for map-to-table selection.
- Tests for table-to-map selection.
- Tests for clear-one and clear-all controls.
- Tests for result counts using known baseline cases.
- Tests for CSV and GeoJSON export content.
- Tests for internal and external links.
- Responsive visual tests at representative desktop, tablet, and phone sizes.
- Keyboard-only navigation checks.
- Automated accessibility checks plus identified manual checks.
- Production-build and deployment smoke tests.

Define a side-by-side acceptance process in which the same representative workflows are performed in the existing Experience Builder application and the replacement. Document any deliberate differences as approved improvements rather than accidental regressions.

## Phase H — Migration, deployment, and handoff plan

Provide an ordered implementation plan with milestones, dependencies, decision gates, and approximate effort ranges. The plan should cover:

1. Evidence and dependency inventory.
2. Requirements and ambiguity resolution.
3. Data cleanup and reproducible conversion.
4. Architecture and hosting approval.
5. Repository scaffolding.
6. Functional prototype.
7. Feature-parity implementation.
8. Accessibility and responsive refinement.
9. Automated testing.
10. Side-by-side validation.
11. Nonproduction deployment.
12. Applicable review and release approval.
13. Production deployment and rollback plan.
14. Documentation and ownership handoff.
15. Retirement or redirect of the old application only after the replacement is accepted.

Include:

- A risk register with likelihood, impact, mitigation, and owner/decision needed.
- A list of decisions requiring owner approval.
- A maintenance guide outline.
- A data-update runbook outline.
- A deployment runbook outline.
- A recommended versioning and release strategy.
- A recommendation for how to preserve the old application and migration artifacts for audit/reference purposes.

## Required first response

Your first substantive response must contain:

1. **Executive assessment:** your present understanding of RESST and the likely migration direction.
2. **Evidence inventory:** what was provided, what each artifact establishes, and any conflicts.
3. **Dependency inventory:** all referenced ArcGIS and external items you can identify.
4. **Existing-function migration matrix.**
5. **Data assessment:** schema, quality, size, relationships, risks, and missing exports.
6. **Architecture comparison and decision matrix.**
7. **Hosting comparison and decision matrix based on current official documentation.**
8. **Recommended architecture and host:** including runner-up and reversal conditions.
9. **Proposed repository and application design.**
10. **Phased migration plan with effort ranges and decision gates.**
11. **Risk register.**
12. **Exact missing-artifact checklist.**
13. **A consolidated set of clarifying questions, limited to questions that could materially change the recommendation or implementation.**

Do not begin implementation in that first response. Stop after presenting the assessment and questions so the owner can review and approve or revise the path forward.

## Provisional owner preference

The owner's provisional preference is a static TypeScript application because the current tool appears to be a public, primarily read-only map/filter/table explorer that may not require server-side computation. GitHub-hosted static deployment appears promising because it could eliminate application sessions and simplify operations. However, Posit Connect Cloud is already part of the owner's broader application-hosting workflow, and future RESST functions may involve R-based calculations or other server-side work.

Evaluate this preference critically. Recommend the static approach only if it remains the best fit after examining the real data, current behavior, future requirements, hosting limitations, and maintenance tradeoffs.

## END PROMPT

---

# Part II — Steps for Collecting and Packaging the Existing Application

Claude can start with an incomplete package and identify missing items. The most useful initial package contains the published Experience configuration, the web-map configuration, exports of the current hosted layers, and screenshots showing important workflows.

## Phase 1 — Confirm the version to migrate

1. Sign into ArcGIS Online.
2. Open RESST in Experience Builder editing mode.
3. Check whether an **Unpublished changes** indicator is present.
4. If the current draft is the final version you want to migrate, click **Publish**.
5. Open the public application and confirm that it represents the version you want Claude to reproduce:
   - https://experience.arcgis.com/experience/b1eec438459e45c284df2fcf89e5d8e0

Experience Builder maintains separate draft and published states. See [Esri's save, preview, and publish documentation](https://developers.arcgis.com/experience-builder/guide/save-preview-publish/).

Do not change the production application merely for migration purposes. The objective is to record its current state.

## Phase 2 — Create the migration folder

Create this folder structure on your computer:

```text
RESST-migration/
├── 01-experience-configuration/
├── 02-web-map-configuration/
├── 03-data/
├── 04-assets/
├── 05-screenshots/
└── 06-requirements/
```

## Phase 3 — Download the four basic Experience files

Because the application is public, try the direct ArcGIS REST URLs first. If a URL does not work, use ArcGIS Assistant as described in Phase 4.

### File 1 — Experience item metadata

Open:

```text
https://www.arcgis.com/sharing/rest/content/items/b1eec438459e45c284df2fcf89e5d8e0?f=pjson
```

Then:

1. Press `Ctrl+S`.
2. Save the file in `01-experience-configuration`.
3. Name it:

```text
01-resst-item-metadata.json
```

This provides the application's title, item type, description, owner, dates, tags, sharing information, and other administrative metadata. It does not normally contain the application layout.

### File 2 — Experience item data

Open:

```text
https://www.arcgis.com/sharing/rest/content/items/b1eec438459e45c284df2fcf89e5d8e0/data?f=pjson
```

Save it as:

```text
01-experience-configuration/02-resst-experience-data.json
```

This important file can describe:

- Pages and layouts.
- Widgets.
- Filters.
- Data sources.
- Widget connections and actions.
- Application text.
- Field references.
- Web-map item IDs.

See [ArcGIS item and item-data documentation](https://developers.arcgis.com/rest/users-groups-and-items/items-and-item-types/).

### File 3 — Published Experience configuration

Open:

```text
https://www.arcgis.com/sharing/rest/content/items/b1eec438459e45c284df2fcf89e5d8e0/resources/config/config.json
```

Save it as:

```text
01-experience-configuration/03-resst-published-config.json
```

This is generally the most important Experience configuration because it represents the published application used by visitors.

If it does not open:

- Confirm that the application is published and publicly shared.
- Sign into ArcGIS Online in another browser tab and retry.
- Use the ArcGIS Assistant method in Phase 4.

### File 4 — Experience resource inventory

Open:

```text
https://www.arcgis.com/sharing/rest/content/items/b1eec438459e45c284df2fcf89e5d8e0/resources?f=pjson&num=1000
```

Save it as:

```text
01-experience-configuration/04-resst-resource-list.json
```

This is an inventory of attached resources such as the published configuration, logos, images, icons, and translations. See [ArcGIS item-resources documentation](https://developers.arcgis.com/rest/users-groups-and-items/item-resources/).

You do not need to download every resource immediately. Claude can inspect the inventory and identify which resources are actually relevant.

### Validate the saved JSON files

Open each file in VS Code, Notepad++, or another text editor. A JSON response should begin with `{` or `[` rather than HTML markup.

If a saved file begins with something like this, the browser saved a webpage rather than the JSON response:

```html
<!DOCTYPE html>
```

If that happens:

1. Reopen the REST URL.
2. Select the displayed JSON using `Ctrl+A`.
3. Copy it.
4. Paste it into a new text-editor file.
5. Save it with the intended `.json` filename using UTF-8 encoding.

## Phase 4 — Use ArcGIS Assistant only if necessary

Use this method if the direct REST URLs do not work or you prefer a visual interface.

1. Open [ArcGIS Assistant](https://assistant.esri-ps.com/).
2. Select **ArcGIS Online**.
3. Sign in through the organization's normal OAuth or SSO process.
4. Search for `Reservoir Sustainable Sediment Tool`.
5. Select the Web Experience with item ID `b1eec438459e45c284df2fcf89e5d8e0`.
6. Select **View Item JSON**.
7. Open the **Data** tab.
8. Copy or download the displayed JSON as:

```text
01-experience-configuration/02-resst-experience-data.json
```

9. Open the **Resources** tab.
10. Locate `config/config.json`.
11. View or download it as:

```text
01-experience-configuration/03-resst-published-config.json
```

12. Download clearly relevant images, logos, or icons into `04-assets`.

Use only read and download functions. Do not select **Edit Resource**, **Replace**, **Update**, or **Save**. Esri documents the published `config/config.json` resource in [this ArcGIS Assistant support workflow](https://support.esri.com/en-us/knowledge-base/fix-data-sources-after-cloning-arcgis-experience-builde-000033170).

## Phase 5 — Let Claude identify the connected ArcGIS items

At this point, give Claude this Markdown briefing and these four files:

```text
01-resst-item-metadata.json
02-resst-experience-data.json
03-resst-published-config.json
04-resst-resource-list.json
```

Claude's first job should be to identify every referenced web map, hosted feature layer, table, image, document, URL, basemap, service, and ArcGIS item ID. It should return a prioritized dependency list and exact instructions for obtaining anything missing.

Do not try to interpret thousands of lines of Experience configuration manually before Claude performs this inventory.

## Phase 6 — Download each web map's configuration

Claude should identify one or more web-map item IDs. For each web map, replace `<WEB_MAP_ID>` below with the actual 32-character ID.

### Web-map metadata

Open:

```text
https://www.arcgis.com/sharing/rest/content/items/<WEB_MAP_ID>?f=pjson
```

Save as a clearly named file such as:

```text
02-web-map-configuration/resst-web-map-item.json
```

### Web-map data and display configuration

Open:

```text
https://www.arcgis.com/sharing/rest/content/items/<WEB_MAP_ID>/data?f=pjson
```

Save as:

```text
02-web-map-configuration/resst-web-map-data.json
```

This file can contain:

- Layer order and visibility.
- Point symbols and colors.
- Clustering.
- Labels and legends.
- Popup titles, fields, formatting, and links.
- Field aliases.
- Basemap.
- Initial map extent.
- Scale-dependent display behavior.

If multiple web maps exist, give each pair of files a distinct descriptive name.

## Phase 7 — Export the current hosted feature layers

Export the hosted feature layers actually used by the web map, not only the original uploaded shapefile ZIPs. Hosted layers may contain later edits, field changes, or additional records.

For each hosted layer:

1. Sign into ArcGIS Online.
2. Open **Content**.
3. Find and open the layer identified by Claude.
4. Confirm that its item type is `Feature Layer (hosted)` or the appropriate hosted-layer type.
5. On the **Overview** page, click **Export data**.
6. Select **Export to GeoJSON**.
7. Give the temporary export a descriptive title, such as `RESST Dam Sites GeoJSON Export`.
8. Click **Export**.
9. Open the newly created export item.
10. Click **Download**.
11. Save the file in `03-data` with a clear name, such as:

```text
resst-dam-sites.geojson
```

Repeat the process using **Export to GeoPackage**, saving a file such as:

```text
resst-dam-sites.gpkg
```

Do this for both principal datasets. The result may resemble:

```text
03-data/
├── resst-dam-sites.geojson
├── resst-dam-sites.gpkg
├── resst-ecological-data.geojson
└── resst-ecological-data.gpkg
```

Use GeoJSON as a convenient candidate web format and GeoPackage as a stronger portable archival/source format. Claude should still inspect actual sizes, field types, relationships, and performance before selecting the final runtime format.

If a hosted layer contains attachments, export a file geodatabase as well because that format can retain attachments. See [ArcGIS Online hosted-layer export instructions](https://doc.arcgis.com/en/arcgis-online/manage-data/use-hosted-layers.htm).

### Save each layer definition

The feature-service layer definition contains information that a GeoJSON export may not preserve, including aliases, domains, drawing information, and capabilities.

Claude should identify each service URL. For each relevant sublayer, open a URL of this form:

```text
<FEATURE_SERVICE_URL>/<LAYER_NUMBER>?f=pjson
```

Save it using a descriptive filename such as:

```text
03-data/resst-dam-sites-layer-definition.json
```

## Phase 8 — Capture application appearance and behavior

Take screenshots of these representative states:

1. Default application immediately after opening.
2. Site keyword filter open.
3. Site-literature keyword filter open.
4. General-literature keyword filter open.
5. One filter applied.
6. Multiple filters applied.
7. A dam/site selected on the map.
8. The selected site's popup or details displayed.
9. Results table showing filtered records.
10. Table selection linked to the map.
11. Export functionality.
12. Instructions, About, help, or methodology content.
13. A no-results state, if possible.
14. Mobile or narrow-screen layout, if mobile use matters.

Save the screenshots in `05-screenshots` using descriptive numbered filenames.

Create a short workflow screen recording showing:

1. Opening the application.
2. Applying a filter.
3. Selecting a point.
4. Showing the corresponding table record.
5. Applying several filters together.
6. Clearing filters.
7. Exporting results.

The screenshots establish visual intent; the recording establishes interaction sequence and behavior.

## Phase 9 — Record requirements and known future ideas

Create a short file named:

```text
06-requirements/owner-notes.md
```

Record what is already known about:

- Intended users.
- Whether all data can be public.
- Expected number of users.
- Desktop versus mobile importance.
- Expected data-update frequency.
- Who will maintain the datasets.
- Desired new features.
- Whether future R/Python analysis is anticipated.
- Whether users will upload files.
- Whether results must be saved between visits.
- Whether authentication is needed.
- Whether reports must be generated.
- Applicable accessibility, organizational, cybersecurity, or public-release constraints.
- Preferred GitHub organization or repository location, if known.
- Existing Posit Connect Cloud account and deployment limitations, if known.

Unknown answers can be marked `Unknown`. Claude should not infer them silently.

## Phase 10 — Obtain a Developer Edition deployment ZIP only if useful

This ZIP is optional. It is useful as an archival and runtime reference, but it is not the preferred foundation for the replacement source repository.

If desired:

1. Download and install the current [ArcGIS Experience Builder Developer Edition](https://developers.arcgis.com/experience-builder/guide/install-guide/).
2. Configure it to connect to the same ArcGIS Online organization.
3. Start Developer Edition.
4. Select the **Experience** tab.
5. Click **Import**.
6. Select **Import from my account**.
7. Find RESST and click **Done**.
8. Open the imported application and verify that it loads.
9. Publish the imported copy.
10. Return to the Developer Edition gallery.
11. Open the application's three-dot menu.
12. Click **Download**.
13. Save the ZIP as:

```text
01-experience-configuration/resst-developer-edition-deployment.zip
```

Esri documents [importing an existing app](https://developers.arcgis.com/experience-builder/guide/import-apps-or-templates/) and [downloading a deployable Experience](https://developers.arcgis.com/experience-builder/guide/experience-deployment/).

Do not spend substantial time troubleshooting Developer Edition before providing Claude the configuration JSON, web-map JSON, data exports, and screenshots. Those are generally more valuable for a clean migration.

## Phase 11 — Package the material for Claude

The assembled package should resemble:

```text
RESST-migration/
├── 01-experience-configuration/
│   ├── 01-resst-item-metadata.json
│   ├── 02-resst-experience-data.json
│   ├── 03-resst-published-config.json
│   ├── 04-resst-resource-list.json
│   └── resst-developer-edition-deployment.zip        # optional
├── 02-web-map-configuration/
│   ├── resst-web-map-item.json
│   └── resst-web-map-data.json
├── 03-data/
│   ├── resst-dam-sites.geojson
│   ├── resst-dam-sites.gpkg
│   ├── resst-dam-sites-layer-definition.json
│   ├── resst-ecological-data.geojson
│   ├── resst-ecological-data.gpkg
│   └── resst-ecological-data-layer-definition.json
├── 04-assets/
├── 05-screenshots/
│   └── resst-workflow-recording.mp4
└── 06-requirements/
    └── owner-notes.md
```

Compress it as:

```text
RESST-migration-package.zip
```

Before uploading, check that the ZIP contains no passwords, ArcGIS tokens, browser-session data, private API keys, populated `.env` files, or data that is not approved for the intended audience.

## Phase 12 — Claude's expected workflow after receiving the package

Claude should:

1. Inventory everything supplied.
2. Identify unresolved dependencies and missing exports.
3. Reverse-specify existing functionality.
4. Audit the data and filter behavior.
5. Compare architectures and hosting options using current official sources.
6. Recommend one architecture and one host, with a runner-up and reversal conditions.
7. Present the proposed repository structure, tests, data workflow, deployment workflow, risk register, and effort ranges.
8. Ask the consolidated questions that materially affect the decision.
9. Stop for owner review and approval.
10. Begin implementation only after the direction is approved and the necessary artifacts are available.

---

# Preliminary Recommendation to Be Tested

The most plausible initial direction is a static TypeScript application because the present RESST application appears to be a public, read-only explorer centered on a map, filters, site details, and a results table. A static implementation could avoid server sessions, reduce hosting and operating complexity, and create a conventional repository that is straightforward for AI to maintain.

However, this is not the final decision. Claude should validate it against:

- Actual dataset sizes and structures.
- Exact filter and relationship logic.
- Planned analytical functions.
- Authentication or private-data needs.
- User uploads or saved work.
- Report-generation needs.
- Current Posit Connect Cloud and GitHub hosting capabilities.
- Applicable USACE deployment, review, accessibility, and public-release constraints.

If server-side R calculations, authenticated data, user uploads, saved sessions, database access, or report generation are near-term requirements, Shiny on Posit Connect Cloud may be the better choice. Claude should recommend its own evidence-based approach rather than simply affirming the preliminary preference.
