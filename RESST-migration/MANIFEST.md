# RESST Migration Evidence Manifest

Collected: 2026-08-28, entirely via anonymous (unauthenticated) public ArcGIS REST requests.
Collector: Claude Code, on behalf of the owner (gtmenichino@gmail.com / garrett.t.menichino.erdc).
All collection was read-only; no ArcGIS items or services were modified.

## 01-experience-configuration/

| File | Size (bytes) | Source URL | Notes |
|---|---|---|---|
| 01-resst-item-metadata.json | 1,521 | https://www.arcgis.com/sharing/rest/content/items/b1eec438459e45c284df2fcf89e5d8e0?f=pjson | Item admin metadata; access=public |
| 02-resst-experience-data.json | 316,622 | .../items/b1eec438459e45c284df2fcf89e5d8e0/data?f=pjson | DRAFT Experience config |
| 03-resst-published-config.json | 317,946 | .../items/b1eec438459e45c284df2fcf89e5d8e0/resources/config/config.json | PUBLISHED Experience config (authoritative for live app) |
| 04-resst-resource-list.json | 2,993 | .../items/b1eec438459e45c284df2fcf89e5d8e0/resources?f=pjson&num=1000 | 19 resources: config + 16 images + 2 image manifests |

Draft vs published: NOT byte-identical but structurally equivalent — same 125 widget IDs, same pages (home, page_2 "DummyTestingSteps"), same exbVersion 1.20.0, same internal timestamp. No unpublished-changes risk identified at widget/page level.

SECURITY NOTE: as published by ArcGIS, both configs embed ArcGIS tokens inside cached Survey123 thumbnail URLs (formItemInfo/selectedSurvey blocks) — publicly downloadable today as part of the live app, likely expired short-lived tokens, flagged for owner review (assessment risk R8). The archived copies in this repository have every `token=…` value replaced with `token=REDACTED` (10 instances, 2026-08-28) so the archive republishes nothing; JSON structure is otherwise unmodified.

## 02-web-map-configuration/

| File | Size | Source URL | Notes |
|---|---|---|---|
| resst-web-map-item.json | 1,377 | .../items/5eab99323660482cbe4a745523b5b83d?f=pjson | Web map "ResSedManWebMap", public |
| resst-web-map-data.json | 58,881 | .../items/5eab99323660482cbe4a745523b5b83d/data?f=pjson | Layers, symbology, popups, basemap (Esri Topographic + World Hillshade), initial extent (CONUS-wide, Web Mercator) |

## 03-data/

| File | Size | Source | Notes |
|---|---|---|---|
| resst-sites-service-root.json | 4,835 | survey123_85c1db.../FeatureServer?f=pjson | Query,Extract,Sync; maxRecordCount 2000 |
| resst-sites-layer-definition.json | 17,340 | .../FeatureServer/0?f=pjson | "survey" point layer; 17 fields; hasAttachments=true |
| resst-literature-service-root.json | 4,570 | service_b488124a.../FeatureServer?f=pjson | Query,Extract; maxRecordCount 1000 |
| resst-literature-layer-definition.json | 22,591 | .../FeatureServer/0?f=pjson | "ResSedMan_LitSurveyRev" point layer; 28 fields; relationship id 1 → lit_repeat |
| resst-lit-repeat-table-definition.json | 19,138 | .../FeatureServer/1?f=pjson | "lit_repeat" table; 30 fields; destination of relationship 1 |
| resst-sites.geojson | 644,264 | /0/query?where=1=1&outFields=*&f=geojson | 979 features — MATCHES returnCountOnly=979 |
| resst-literature.geojson | 588,519 | /0/query (lit service) | 466 features — MATCHES returnCountOnly=466 |
| resst-lit-repeat-page1.json | 1,805,323 | /1/query offset 0, ordered by objectid | 1,000 rows |
| resst-lit-repeat-page2.json | 744,936 | /1/query offset 1000 | 410 rows; total 1,410 — MATCHES returnCountOnly=1410 |

Attachments check: sites layer hasAttachments=true (capability) but queryAttachments returned ZERO attachment groups — no actual attachments exist as of collection date. No file-geodatabase export required for attachment preservation.

## 04-assets/

16 images downloaded from the Experience item's resources (source: .../items/b1eec438459e45c284df2fcf89e5d8e0/resources/<path>):
- images/widget_2/*.png — 5 header/logo images
- images/widget_185/widget_185-snap*.jpg — 6 bookmark-view snapshot images (Bookmark widget)
- images/widget_257|358|502|505|508/*.png — 5 large instructional/content images (~1–1.6 MB each)

## 07-assessment/

- dependency-item-inventory.json — resolution of all 17 item IDs found in published config (title/type/owner/access per ID).

## Dependency summary (from config + web map)

Owner data (public, anonymously queryable):
- Sites: https://services8.arcgis.com/O9PKLn5lg1RCusln/arcgis/rest/services/survey123_85c1db578d5b4222869a785ba658791c/FeatureServer/0 (item bafeeb0e549446a085f3790bec170b96)
- Literature points: https://services8.arcgis.com/O9PKLn5lg1RCusln/arcgis/rest/services/service_b488124ac6a64be091299d2a1a061a07/FeatureServer/0 (item 5246c1e01eb2432e953f2bec8483c50d)
- lit_repeat related table: same service, /FeatureServer/1

Owner data-entry dependencies (PRIVATE Form items; anonymous fetch denied):
- 85c1db578d5b4222869a785ba658791c — Form "ResSedMan_SiteSurvey" (Survey123)
- 3a22d9b823e64d28acfa0c8157617555 — Form "ResSedMan_LiteratureSurvey" (Survey123)
- 770376c04d9e48cf80f195bb813eed3c — Form "ResSedMan_LitSurveyRev" (Survey123)

Third-party reference layers (all hidden by default in web map):
- National Inventory of Dams: services2.arcgis.com/FiaPA4ga0iQKduv3/.../NID_v1/FeatureServer/0 (item a4c195b7a6b74f278ff43e5d60c6915d)
- Live Stream Gauges: services9.arcgis.com/RHVPKKiFTONKtxq3/.../Live_Stream_Gauges_v1/FeatureServer/0 (item 81c5a9f2a2704d54a49042a44eefa5d3)
- SSURGO soils WMS: https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms (item 7bdb776e04994d31a7b4278f914e49b2)
- USGS Watershed Boundary Dataset HUC 2/4/6/8: services.arcgis.com/P3ePLMYs2RVChkJx (Esri) — items bc0cc624..., b92b73b3..., 53a9a02a..., 5bbefdcd...
- North America Lakes and Rivers: services7.arcgis.com/oF9CDB4lUYF7Um9q/.../North_America_Lakes_and_Rivers/FeatureServer/0 (item 4cf66bf1ae124bf59d1144b789529385)

Basemap: Esri "Topographic" (vector tile style item 27e89eb03c1e4341a1d75e597f0291e6 + World Hillshade raster tiles).

Non-dependencies (false positives among 32-hex strings): 415a0570..., 957440bb..., c03bc329... are owner content-folder GUIDs cached inside widget configs.

Portals referenced: https://www.arcgis.com and https://ERDC-EL.maps.arcgis.com.
