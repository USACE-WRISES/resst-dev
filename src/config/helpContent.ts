// Help content — hand-authored (this file replaced the generated
// helpContent.generated.ts when the help dialog was redesigned; the original
// Experience Builder wording is preserved in the migration archive). Edit the
// words here directly.
//
// "Rich" fields may carry minimal inline HTML — <strong>/<b>, <em>/<i>,
// <a href>, <br> only. This is owner-authored app content, not user input;
// HelpOverlay renders it via dangerouslySetInnerHTML. Step titles stay plain
// text.

/** A string that may contain the minimal inline HTML described above. */
export type Rich = string;

export interface HelpNote {
  /** Bold lead-in: "Result", "Tip", "Why it matters"… */
  label: string;
  text: Rich;
}

export interface HelpStep {
  /** Short imperative title, plain text. */
  title: string;
  body: Rich;
  notes?: HelpNote[];
}

export interface HelpFacets {
  goal: Rich;
  when: Rich;
  get: Rich;
  tip?: Rich;
}

export interface HelpImage {
  /** Relative to BASE_URL, e.g. "help/by-huc.jpg". */
  src: string;
  alt: string;
}

export interface HelpView {
  id: string;
  /** Pill label. */
  name: string;
  /** Panel heading. */
  title: string;
  image: HelpImage | null;
  /** Free paragraphs (the About body; optional preamble elsewhere). */
  lead?: Rich[];
  /** Workflow tabs only. */
  facets?: HelpFacets;
  steps?: HelpStep[];
  /** About only — the quiet attribution block at the bottom. */
  credits?: Rich[];
}

export const HELP_VIEWS: HelpView[] = [
  {
    id: "about",
    name: "About",
    title: "About RESST",
    image: {
      src: "help/about.jpg",
      alt: "The RESST application: map of sites, Data Filters panel, results tables, and Selected Data panel.",
    },
    lead: [
      "The Reservoir Sustainable Sediment Tool (RESST) compiles case studies, analytical approaches, and literature on sediment release from reservoirs. It gives reservoir managers and environmental engineers one searchable place to explore precedent projects, sediment management strategies, ecological concerns, and analytical methods across sites and regions.",
      "Work the interactive map, apply keyword filters, review site-linked and general literature, and export the results. Selection is the core move: pick sites one at a time, or use the map's <strong>Select</strong> menu to grab them by dragged box, drawn polygon, watershed (HUC) boundary, or distance from a river.",
      "The tabs above walk through four common workflows.",
    ],
    credits: [
      "Basemaps: Esri World Topographic Map and World Hillshade — Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community; hillshade: Esri, Vantor, Airbus DS, USGS, NGA, NASA. USGS The National Map: National Boundaries Dataset, 3DEP Elevation Program, Geographic Names Information System, National Hydrography Dataset, National Land Cover Database, National Structures Dataset, and National Transportation Dataset.",
      "Reference layers: watershed boundaries from the USGS Watershed Boundary Dataset; rivers and lakes from the North American Environmental Atlas © Commission for Environmental Cooperation (Natural Resources Canada, INEGI, USGS), CC BY 4.0; National Inventory of Dams (USACE); Live Stream Gauges; SSURGO Soils (USDA NRCS).",
      "Place search: USGS Geographic Names Information System (GNIS).",
    ],
  },
  {
    id: "by-reservoir",
    name: "By Reservoir",
    title: "Workflow 1 — Targeted Reservoir Analysis",
    image: {
      src: "help/by-reservoir.jpg",
      alt: "A selected site on the map with its popup open and its details in the Selected Data panel.",
    },
    facets: {
      goal: "Find everything RESST knows about a specific dam, reservoir, or reach, then review the linked literature and export the results.",
      when: "You already have a site in mind — by name, location, or known dam.",
      get: "The site's key attributes, its <strong>Site Literature</strong>, and related <strong>General Literature</strong> to compare against.",
      tip: "Start broad: select the site first, and narrow with filters only if you need to.",
    },
    steps: [
      {
        title: "Find the site",
        body: "Type a reservoir, dam, or place name into the map's <strong>Search</strong> box, or pan and zoom to the area. Search matches site names and USGS place names — rivers, lakes, and towns included.",
      },
      {
        title: "Select it on the map",
        body: "Click the site's point. It becomes the active selection: a popup opens, the <strong>Selected Data</strong> panel fills in, and the tables highlight its rows.",
      },
      {
        title: "Review the Selected Data panel",
        body: "Check the key attributes — Site Type, Sediment Release, Ecological Concern, Analysis — to judge whether the site is a useful analog for your project.",
      },
      {
        title: "Open the Site Literature tab",
        body: "In the results table, switch to <strong>Site Literature</strong> and scan the references documented for this location.",
        notes: [{ label: "Tip", text: "This is the fastest route to location-specific reading." }],
      },
      {
        title: "Compare with General Literature",
        body: "The <strong>General Literature</strong> tab holds methods, monitoring approaches, and modeling work not tied to one site — use it to broaden the reading list.",
      },
      {
        title: "Refine with filters (optional)",
        body: "Open <strong>Data Filters</strong> and toggle values one at a time; the map and tables update as you go.",
      },
      {
        title: "Export",
        body: "Use <strong>Actions</strong> on any table tab to export the current rows as CSV, GeoJSON, or shapefile. <strong>Download Data</strong> in the header carries the full datasets.",
      },
    ],
  },
  {
    id: "by-huc",
    name: "By HUC",
    title: "Workflow 2 — Regional Analysis by Hydrologic Unit (HUC)",
    image: {
      src: "help/by-huc.jpg",
      alt: "A HUC basin outlined on the map with the sites inside it selected.",
    },
    facets: {
      goal: "Pull together the sites and literature inside a basin or sub-basin along its HUC boundary (HUC-2 through HUC-8).",
      when: "You are scoping sediment management needs — or knowledge gaps — for a watershed or district area.",
      get: "A basin-scoped site set plus its literature, ready to filter and export.",
      tip: "Screen with a larger unit (HUC-2 or HUC-4) first, then repeat with smaller units for detail.",
    },
    steps: [
      {
        title: "Pick the HUC level",
        body: "Open the map's <strong>Select</strong> menu and choose <strong>HUC-2</strong>, <strong>HUC-4</strong>, <strong>HUC-6</strong>, or <strong>HUC-8</strong>. The matching boundary layer switches on so you can see the basins.",
      },
      {
        title: "Click your basin",
        body: "Click anywhere inside it. RESST looks up the basin's boundary and selects every site shown within.",
        notes: [
          { label: "Result", text: "The Selected Data panel and tables update to the basin." },
          { label: "Tip", text: "Shift+click adds another basin to the selection." },
        ],
      },
      {
        title: "Confirm in the Sites tab",
        body: "Check that the count and spread match your intent. <strong>Show selection</strong> in the table toolbar isolates the selected rows.",
      },
      {
        title: "Review the basin's literature",
        body: "Switch to <strong>Site Literature</strong> and scan for recurring themes — dredging versus drawdown, fish passage, water quality, modeling approaches. What is missing is often the finding.",
      },
      {
        title: "Focus with filters (optional)",
        body: "Use <strong>Data Filters</strong> to narrow within the basin — for example Sediment Source = bank erosion, or Analysis = sediment transport modeling.",
      },
      {
        title: "Export the basin set",
        body: "Export the <strong>Sites</strong> and literature tabs with <strong>Actions</strong> for offline analysis or comparison across basins. The boundary layer stays available under <strong>Layers</strong>.",
      },
    ],
  },
  {
    id: "by-river",
    name: "By River",
    title: "Workflow 3 — River Corridor Compilation",
    image: {
      src: "help/by-river.jpg",
      alt: "A river's course highlighted on the map with sites selected within the chosen distance.",
    },
    facets: {
      goal: "Build a corridor-scale dataset — every site along a river or multi-dam reach — and compile its literature as one package.",
      when: "You are evaluating sediment continuity, a multi-dam system, or downstream effects along a river.",
      get: "A longitudinal site set you can review upstream-to-downstream and export together.",
    },
    steps: [
      {
        title: "Arm the river tool",
        body: "Open <strong>Select</strong> and choose <strong>Near a river</strong>. The rivers layer switches on.",
      },
      {
        title: "Click the river",
        body: "Click its blue line. RESST fetches the river's full course — well beyond the current view — and selects every site within the set distance of it.",
      },
      {
        title: "Tune the distance",
        body: "Adjust the <strong>within … mi</strong> box in the strip under the toolbar; the selection recomputes as you type. Click <strong>Done</strong> when it looks right.",
        notes: [
          { label: "Tip", text: "The river lines are generalized mapping data — allow a mile or two of slack for tight corridors." },
        ],
      },
      {
        title: "Or draw the corridor yourself",
        body: "For a specific reach — say, Dam A to Dam D — use <strong>Select → Polygon</strong> instead: click corners along the corridor and double-click to finish.",
      },
      {
        title: "Validate in the Sites tab",
        body: "Sort or scan the selected rows to confirm the corridor caught what you intended and nothing unrelated nearby.",
      },
      {
        title: "Compile the literature",
        body: "Review <strong>Site Literature</strong> for the corridor sites, then round it out with <strong>General Literature</strong> on methods and monitoring.",
      },
      {
        title: "Export for longitudinal review",
        body: "Export the corridor's sites and literature with <strong>Actions</strong>, and compare upstream to downstream in a spreadsheet or GIS.",
      },
    ],
  },
  {
    id: "by-category",
    name: "By Category",
    title: "Workflow 4 — Thematic or Categorical Review",
    image: {
      src: "help/by-category.jpg",
      alt: "The map and tables narrowed to a theme by keyword filters.",
    },
    facets: {
      goal: "Find sites and literature matching a technical theme, regardless of region, using the controlled keyword filters.",
      when: "You are building a reading list, comparing methods, or hunting analogs across watersheds.",
      get: "A cross-basin set of sites and literature cut to the theme.",
      tip: "Pick the theme before you click — a sediment type, a release mechanism, an ecological concern, or a modeling method.",
    },
    steps: [
      {
        title: "Start with one filter",
        body: "In <strong>Data Filters</strong>, switch on a category and pick a single value — say Sediment Release = drawdown. The map and tables update immediately.",
        notes: [{ label: "Tip", text: "One filter at a time keeps you out of zero-result dead ends." }],
      },
      {
        title: "Add a second to sharpen",
        body: "Layer on another category — Sediment Characteristic = gravel plus Channel Type = braided rivers — to cut to a targeted subset.",
      },
      {
        title: "Scan the map and tables",
        body: "The map shows where matches cluster; <strong>Site Literature</strong> and <strong>General Literature</strong> build the reading list.",
      },
      {
        title: "Check promising analogs",
        body: "Click a promising site and confirm its attributes in <strong>Selected Data</strong> — the fastest is-this-relevant check.",
      },
      {
        title: "Export the theme set",
        body: "Export the literature tabs as your reading list, and the <strong>Sites</strong> tab to map or compare candidates offline.",
      },
      {
        title: "Reset for the next theme",
        body: "Use <strong>Clear all</strong> at the top of Data Filters so stacked filters from the last pass don't hide results.",
      },
    ],
  },
];
