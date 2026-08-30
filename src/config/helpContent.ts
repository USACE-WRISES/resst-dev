// Help content — hand-authored (this file replaced the generated
// helpContent.generated.ts when the help dialog was redesigned; the original
// Experience Builder wording is preserved in the migration archive). Edit the
// words here directly.
//
// The five workflows follow the decision-support arc of the sedimentation
// expansion: assess one reservoir → find analogs → screen nationally →
// compile regionally → review thematically. The team-collected case-study/
// literature database stays the spine; RATTES/ResNet/RESSED are context.
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
      "Around that documented core, RESST places national sedimentation context: modeled storage-loss trajectories for more than 57,000 reservoirs (RATTES), measured sedimentation surveys (RESSED), and the routed upstream–downstream dam network (ResNet). Every value is labeled <strong>Reported</strong>, <strong>Measured</strong>, <strong>Modeled</strong>, or <strong>Network-derived</strong> so observations and model estimates never blur; the ⓘ marks carry each source's citation.",
      "The tabs above walk through five common workflows.",
    ],
    credits: [
      "Basemaps: Esri World Topographic Map and World Hillshade (Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community; hillshade: Esri, Vantor, Airbus DS, USGS, NGA, NASA). USGS The National Map: National Boundaries Dataset, 3DEP Elevation Program, Geographic Names Information System, National Hydrography Dataset, National Land Cover Database, National Structures Dataset, and National Transportation Dataset.",
      "Reference layers: watershed boundaries from the USGS Watershed Boundary Dataset; rivers and lakes from the North American Environmental Atlas © Commission for Environmental Cooperation (Natural Resources Canada, INEGI, USGS), CC BY 4.0; National Inventory of Dams (USACE); Live Stream Gauges; SSURGO Soils (USDA NRCS).",
      'Sedimentation datasets: modeled reservoir storage and sediment from <strong>RATTES v1.2</strong> (silt scenario): Eckland, A.C., Foster, M.A., Hurst, A.A., Beyene, M.T., and Overeem, I. (2026), "Reservoir sedimentation diminishes water storage and coastal delta resiliency," <em>Nature Communications</em>, <a href="https://doi.org/10.1038/s41467-026-76986-3" target="_blank" rel="noopener noreferrer">doi:10.1038/s41467-026-76986-3</a>. Reservoir network from <strong>ResNet</strong>: Hurst, A.A., Foster, M.A., and Eckland, A.C. (2025), "The ResNet network of dams impounding storage reservoirs across the continental United States," <em>Scientific Data</em> 12:2044, <a href="https://doi.org/10.1038/s41597-025-06315-8" target="_blank" rel="noopener noreferrer">doi:10.1038/s41597-025-06315-8</a>. Measured surveys from the <strong>USGS RESSED</strong> Reservoir Sedimentation Database, 2013 public export, <a href="https://water.usgs.gov/osw/ressed/" target="_blank" rel="noopener noreferrer">water.usgs.gov/osw/ressed</a> (public domain).',
      "Place search: USGS Geographic Names Information System (GNIS).",
    ],
  },
  {
    id: "assess",
    name: "Assess a Reservoir",
    title: "Workflow 1: Reservoir Sediment Assessment",
    image: {
      src: "help/assess.jpg",
      alt: "A selected reservoir with its documented record, modeled storage trajectory chart, and network context in the Selected Data panel.",
    },
    facets: {
      goal: "From one selected reservoir, read what has been documented, how serious the modeled sedimentation problem is, how certain the evidence is, and how the reservoir sits in the river network.",
      when: "You are starting an evaluation of a specific dam or reservoir, yours or a potential analog.",
      get: "The documented management record and literature, the RATTES storage/sediment trajectory, any measured RESSED surveys, and upstream/downstream context, each labeled with its source.",
      tip: "Values badged <strong>Modeled</strong> are RATTES v1.2 estimates. Check the Evidence section for measured surveys before leaning on any single number.",
    },
    steps: [
      {
        title: "Select the reservoir",
        body: "Find it with the map's <strong>Search</strong> box (site names and USGS place names) or click its point. Red points are RESST documented sites; with the national layer on, every other modeled reservoir is clickable too.",
      },
      {
        title: "Read the documented record first",
        body: "The <strong>Sediment Management</strong> section carries the team-documented release methods, ecological concerns, and analyses; <strong>Site Literature</strong> lists the references for this location. This is RESST's core evidence, reported from real projects.",
      },
      {
        title: "Open Reservoir Sustainability",
        body: "Headline estimates (percent capacity lost, original versus estimated remaining storage, annual accumulation) over the modeled trajectory chart. The solid line is modeled history; the dashed part beyond 2025 is projection; whiskers mark the model's 95% range at 2025 and 2050.",
        notes: [
          { label: "Why it matters", text: "It answers, in seconds: how much storage is already gone, and where is this reservoir heading if nothing changes?" },
        ],
      },
      {
        title: "Check the Evidence",
        body: "The Evidence badge says whether <strong>measured</strong> RESSED surveys exist and how recent they are. Measured capacities plot as dots on the chart. Where dots and the modeled line agree, confidence grows; where they diverge, trust the surveys and read their notes.",
      },
      {
        title: "Explore the Reservoir Network",
        body: "Upstream and downstream dam counts, the terminal-dam status, and the river mouth the system drains to. <strong>Upstream / Downstream / Full network</strong> highlight the connected dams on the map; the dashed downstream path is schematic, not the river course.",
        notes: [
          { label: "Tip", text: "The connectivity bar shows how much of the drainage area reaches this reservoir without first passing another dam (ResNet's SCA2025)." },
          { label: "Note", text: "Downstream counts follow the flow path only. Dams on other tributaries that join the same rivers downstream are not on this path." },
        ],
      },
      {
        title: "Check provenance as you go",
        body: "Every section badge (Reported / Modeled / Measured / Network-derived) and ⓘ popover states the source, version, and DOI. For engineering decisions, the original survey reports and agency records always outrank national model estimates.",
      },
      {
        title: "Export and go deeper",
        body: "Export table rows with <strong>Actions</strong>, or the full datasets from <strong>Download Data</strong>. The trajectory chart's <strong>View data table</strong> exposes its numbers.",
      },
    ],
  },
  {
    id: "analogs",
    name: "Find Analogs",
    title: "Workflow 2: Management Analog Finder",
    image: {
      src: "help/analogs.jpg",
      alt: "The Comparable Reservoirs section listing documented analog sites with similarity scores and management keywords.",
    },
    facets: {
      goal: "From your reservoir's characteristics, surface the most similar reservoirs in the country, documented RESST sites first, and read how they manage sediment.",
      when: "You know the sedimentation situation and want precedent projects worth studying.",
      get: "Ranked documented analogs with their management keywords, plus the nearest reservoirs overall.",
      tip: "The similarity score is a relative screening index over storage, drainage area, age, modeled capacity loss, sedimentation rate, purpose, and region. Verify real suitability in the analog's literature.",
    },
    steps: [
      {
        title: "Select your reservoir",
        body: "A documented site or, with the national layer on, any modeled reservoir.",
      },
      {
        title: "Run the finder",
        body: "Expand <strong>Comparable Reservoirs</strong> and press <strong>Find similar reservoirs</strong>.",
      },
      {
        title: "Read the documented analogs first",
        body: "The top list ranks RESST documented sites; each row shows its similarity score, modeled capacity lost, and the site's <strong>Sediment Release</strong> keywords. These are the analogs with management records and literature behind them.",
        notes: [{ label: "Why it matters", text: "This is the shortest path from “my reservoir has this problem” to “here is how comparable projects handled it.”" }],
      },
      {
        title: "Open an analog",
        body: "Click a row to select that reservoir: a documented site opens with its full management record and literature; an undocumented one opens its modeled profile.",
      },
      {
        title: "Build the reading list",
        body: "From each documented analog, collect its <strong>Site Literature</strong>; export tabs with <strong>Actions</strong> as you go.",
      },
    ],
  },
  {
    id: "screen",
    name: "Screen Nationally",
    title: "Workflow 3: National Screening and Gap Analysis",
    image: {
      src: "help/screen.jpg",
      alt: "The national inventory layer styled by percent capacity lost, with the Screening panel's criteria and count open.",
    },
    facets: {
      goal: "Filter the ~57,000 modeled reservoirs with transparent criteria to find where sediment management may deserve further evaluation, and where documented experience already exists.",
      when: "Research prioritization, program planning, hunting case studies, or mapping data gaps.",
      get: "A styled national map, a live matching count, and a CSV of the matching reservoirs.",
      tip: "Screening results identify reservoirs for further evaluation, never a statement that a reservoir needs intervention.",
    },
    steps: [
      {
        title: "Turn on the national layer",
        body: "Under <strong>Layers</strong>, check <strong>All modeled reservoirs</strong> and pick a <strong>Style by</strong> metric: percent capacity lost (2025 or projected 2050), annual sedimentation rate, storage, or RATTES model class (survey-constrained versus statistical prediction). The <strong>Legend</strong> explains the colors; the red RESST sites always stay on top.",
      },
      {
        title: "Open Screening",
        body: "The <strong>Screening</strong> popover sits beside Layers. Opening it switches the national layer on if it isn't already.",
      },
      {
        title: "Start from a gap-analysis preset",
        body: "The four chips are the management-versus-sedimentation quadrants, for example <strong>Undocumented + high sedimentation</strong> (potential opportunities) or <strong>Documented + high sedimentation</strong> (potential case studies).",
      },
      {
        title: "Tighten the criteria",
        body: "Raise the capacity-lost or rate thresholds, restrict to terminal dams or reservoirs with measured surveys, or cut by state, owner type, or purpose. Criteria combine with AND; the map hides non-matching reservoirs.",
      },
      {
        title: "Read the count and zoom",
        body: "The readout states how many of the modeled reservoirs match. <strong>Zoom to matches</strong> frames them; click any dot for its details panel.",
      },
      {
        title: "Export the matches",
        body: "<strong>Export matches (CSV)</strong> writes the matching reservoirs with their metrics and any linked RESST site, ready for offline prioritization.",
      },
    ],
  },
  {
    id: "by-region",
    name: "By Region & River",
    title: "Workflow 4: Regional and Corridor Compilation",
    image: {
      src: "help/by-huc.jpg",
      alt: "A HUC basin outlined on the map with the sites inside it selected.",
    },
    facets: {
      goal: "Pull together the documented sites and literature for a watershed (HUC-2 through HUC-8) or a river corridor.",
      when: "You are scoping sediment management needs (or knowledge gaps) for a basin, district area, or multi-dam reach.",
      get: "A region- or corridor-scoped site set plus its literature, ready to filter and export.",
      tip: "Screen with a larger unit (HUC-2 or HUC-4) first, then repeat with smaller units for detail.",
    },
    steps: [
      {
        title: "Scope by watershed: pick the HUC level",
        body: "Open the map's <strong>Select</strong> menu and choose <strong>HUC-2</strong> through <strong>HUC-8</strong>; the matching boundary layer switches on.",
      },
      {
        title: "Click your basin",
        body: "Click anywhere inside it. RESST looks up the boundary and selects every documented site within.",
        notes: [
          { label: "Result", text: "The Selected Data panel and tables update to the basin." },
          { label: "Tip", text: "Shift+click adds another basin to the selection." },
        ],
      },
      {
        title: "Or scope by river: arm the river tool",
        body: "Choose <strong>Select → Near a river</strong> and click the river's blue line. RESST traces the full course and selects every site within the set distance; tune the <strong>within … mi</strong> box and press <strong>Done</strong>.",
        notes: [
          { label: "Tip", text: "River lines are generalized mapping data; allow a mile or two of slack. For a specific reach, draw it with <strong>Select → Polygon</strong> instead." },
        ],
      },
      {
        title: "Confirm in the Sites tab",
        body: "Check that the count and spread match your intent. <strong>Show selection</strong> isolates the selected rows.",
      },
      {
        title: "Review the region's literature",
        body: "Switch to <strong>Site Literature</strong> and scan for recurring themes: dredging versus drawdown, fish passage, water quality, modeling approaches. What is missing is often the finding.",
      },
      {
        title: "Focus with filters (optional)",
        body: "Use <strong>Data Filters</strong> to narrow within the region, for example Sediment Source = bank erosion or Analysis = sediment transport modeling.",
      },
      {
        title: "Export the set",
        body: "Export the <strong>Sites</strong> and literature tabs with <strong>Actions</strong> for offline analysis; boundary and river layers stay available under <strong>Layers</strong>.",
      },
    ],
  },
  {
    id: "by-category",
    name: "By Category",
    title: "Workflow 5: Thematic or Categorical Review",
    image: {
      src: "help/by-category.jpg",
      alt: "The map and tables narrowed to a theme by keyword filters.",
    },
    facets: {
      goal: "Find sites and literature matching a technical theme, regardless of region, using the controlled keyword filters.",
      when: "You are building a reading list, comparing methods, or hunting analogs across watersheds.",
      get: "A cross-basin set of sites and literature cut to the theme.",
      tip: "Pick the theme before you click: a sediment type, a release mechanism, an ecological concern, or a modeling method.",
    },
    steps: [
      {
        title: "Start with one filter",
        body: "In <strong>Data Filters</strong>, switch on a category and pick a single value, say Sediment Release = drawdown. The map and tables update immediately.",
        notes: [{ label: "Tip", text: "One filter at a time keeps you out of zero-result dead ends." }],
      },
      {
        title: "Add a second to sharpen",
        body: "Layer on another category (Sediment Characteristic = gravel plus Channel Type = braided rivers) to cut to a targeted subset.",
      },
      {
        title: "Scan the map and tables",
        body: "The map shows where matches cluster; <strong>Site Literature</strong> and <strong>General Literature</strong> build the reading list.",
      },
      {
        title: "Check promising analogs",
        body: "Click a promising site and confirm its attributes in <strong>Selected Data</strong>, the fastest is-this-relevant check.",
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
