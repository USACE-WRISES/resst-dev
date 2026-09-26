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
      alt: "The RESST map as it opens: every documented site on a full-width map, the Data, Table and Screening buttons in the toolbar, and small tabs at the edges for the Data Filters, the results tables and Selected Data.",
    },
    lead: [
      "The Reservoir Sustainable Sediment Tool (RESST) compiles case studies, analytical approaches, and literature on sediment release from reservoirs. It gives reservoir managers and environmental engineers one searchable place to explore precedent projects, sediment management strategies, ecological concerns, and analytical methods across sites and regions.",
      "The map opens uncluttered, with the panels folded away. <strong>Data</strong> in the map toolbar opens the keyword filters and <strong>Table</strong> the results tables; a site's popup opens its full record with <strong>Show details</strong>. The small tabs at the map's edges open the same panels, and each control closes what it opened.",
      "Work the interactive map, apply keyword filters, review site-linked and general literature, and export the results. Selection is the core move: pick sites one at a time, or use the map's <strong>Select</strong> menu to grab them by dragged box, drawn polygon, watershed (HUC) boundary, or distance from a river.",
      "Around that documented core, RESST places national sedimentation context: modeled storage-loss trajectories for more than 57,000 reservoirs (RATTES), measured sedimentation surveys (RESSED), and the routed upstream–downstream dam network (ResNet). Every value is labeled <strong>Reported</strong>, <strong>Measured</strong>, <strong>Modeled</strong>, or <strong>Network-derived</strong> so observations and model estimates never blur; the ⓘ marks carry each source's citation.",
      "The tabs above walk through five common workflows, then the Dashboard and Library views. The header switch moves between the <strong>Map</strong>, the <strong>Dashboard</strong> (the whole dataset as charts that drill down to their sites and reservoirs) and the <strong>Library</strong> (every publication, searchable by site and topic).",
    ],
    credits: [
      "Basemaps: Esri World Topographic Map (Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), © OpenStreetMap contributors, and the GIS User Community). USGS The National Map: National Boundaries Dataset, 3DEP Elevation Program, Geographic Names Information System, National Hydrography Dataset, National Land Cover Database, National Structures Dataset, and National Transportation Dataset.",
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
        body: "Find it with the map's <strong>Search</strong> box (site names and USGS place names) or click its point. Red points are RESST documented sites; with the national layer on, every other modeled reservoir is clickable too. The popup gives the first look (place, agency, purpose, the documented release method, ecological concern, and analysis, the modeled share of capacity lost, and how many references exist); its <strong>Show details</strong> opens the full record in the <strong>Selected Data</strong> panel, and <strong>Hide details</strong> folds it away again.",
        notes: [
          { label: "Tip", text: "The panel's cards open one at a time. Collapsed, each header still shows its source badge and a one-line summary, such as the share of capacity lost." },
        ],
      },
      {
        title: "Read the documented record first",
        body: "The <strong>Sediment Management</strong> card shows the team-documented release methods, ecological concerns, and analyses as keywords; <strong>Site Literature</strong> lists the references for this location, each title linking to its source. This is RESST's core evidence, reported from real projects.",
      },
      {
        title: "Open Reservoir Sustainability",
        body: "The two headline numbers are the estimated share of capacity lost by 2025 and the projected loss by 2050, drawn as a bar beneath them; below come original, remaining, and accumulated storage and the annual accumulation, then the modeled trajectory chart. The solid line is modeled history; the dashed part beyond 2025 is projection; whiskers mark the model's 95% range at 2025 and 2050.",
        notes: [
          { label: "Why it matters", text: "It answers, in seconds: how much storage is already gone, and where is this reservoir heading if nothing changes?" },
        ],
      },
      {
        title: "Check the Evidence",
        body: "The Evidence badge says whether <strong>measured</strong> RESSED surveys exist and how recent they are. The card lists the surveys (year, measured capacity, sediment since the prior survey), keeps each survey's method and notes under <strong>Survey methods and notes</strong>, and links the original datasheets. Measured capacities plot as dots on the chart. Where dots and the modeled line agree, confidence grows; where they diverge, trust the surveys and read their notes.",
      },
      {
        title: "Explore the Reservoir Network",
        body: "<strong>Show on map</strong> highlights the <strong>Upstream</strong> dams, the <strong>Downstream</strong> path to the river mouth, or <strong>Both</strong>, each button carrying its dam count; <strong>Drainage area</strong> outlines the USGS NLDI basin. Below, the downstream path lists the reservoirs sediment passing this dam would encounter, the rivers it joins, and the mouth. On the map, the dashed downstream path is schematic, not the river course.",
        notes: [
          { label: "Tip", text: "<strong>Not behind another dam</strong> is the share of the drainage area that reaches this reservoir without first passing another dam (ResNet's SCA2025): a connectivity measure, not sediment delivery." },
          { label: "Note", text: "Downstream counts follow the flow path only. Dams on other tributaries that join the same rivers downstream are not on this path." },
        ],
      },
      {
        title: "Check provenance as you go",
        body: "Every section badge (Reported / Modeled / Measured / Network-derived) and ⓘ popover states the source, version, and DOI. For engineering decisions, the original survey reports and agency records always outrank national model estimates.",
      },
      {
        title: "Export and go deeper",
        body: "Open the results tables with <strong>Table</strong> and export rows with <strong>Actions</strong>, or take the full datasets from <strong>Download Data</strong>. The trajectory chart's <strong>View data table</strong> exposes its numbers.",
      },
    ],
  },
  {
    id: "analogs",
    name: "Find Analogs",
    title: "Workflow 2: Management Analog Finder",
    image: {
      src: "help/analogs.jpg",
      alt: "The Comparable Reservoirs card listing documented case-study sites with their modeled capacity lost and management keywords.",
    },
    facets: {
      goal: "From your reservoir's characteristics, surface the most similar reservoirs in the country, documented RESST sites first, and read how they manage sediment.",
      when: "You know the sedimentation situation and want precedent projects worth studying.",
      get: "Ranked documented case studies with their management keywords, plus other similar reservoirs without a RESST record.",
      tip: "Rows are ranked by a relative similarity index over storage, drainage area, age, modeled capacity loss, sedimentation rate, purpose, and region (hover a row for its score). Verify real suitability in the analog's literature.",
    },
    steps: [
      {
        title: "Select your reservoir",
        body: "A documented site or, with the national layer on, any modeled reservoir; <strong>Show details</strong> in its popup opens the Selected Data panel.",
      },
      {
        title: "Open Comparable Reservoirs",
        body: "Open the <strong>Comparable Reservoirs</strong> card; the ranking runs as it opens.",
      },
      {
        title: "Read the documented case studies first",
        body: "The top list ranks RESST documented sites; each row shows the state, modeled capacity lost, and the site's <strong>Sediment Release</strong> methods. These are the analogs with management records and literature behind them. Similar reservoirs without a RESST record sit in the disclosure below.",
        notes: [{ label: "Why it matters", text: "This is the shortest path from “my reservoir has this problem” to “here is how comparable projects handled it.”" }],
      },
      {
        title: "Open an analog",
        body: "Click a row to open that reservoir: a documented site opens on its Sediment Management card; an undocumented one opens its modeled profile. <strong>Back</strong> returns to your reservoir and its list.",
      },
      {
        title: "Build the reading list",
        body: "From each documented analog, collect its <strong>Site Literature</strong>; open the tables with <strong>Table</strong> and export tabs with <strong>Actions</strong> as you go.",
      },
    ],
  },
  {
    id: "screen",
    name: "Screen Nationally",
    title: "Workflow 3: National Screening and Gap Analysis",
    image: {
      src: "help/screen.jpg",
      alt: "The national inventory layer styled by percent capacity lost, with the Screening panel docked beside it: the four starting questions with their counts, and the results bar.",
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
        body: "The <strong>Screening</strong> button in the map toolbar opens a panel docked at the left edge of the map. It stays open while you pan, zoom, and click reservoirs; close it with the toggle, ✕, or Esc. Opening it switches the national layer on if it isn't already.",
      },
      {
        title: "Start with a question",
        body: "Four questions cover the management-versus-sedimentation quadrants, each showing how many reservoirs it would find: <strong>Potential case studies</strong> (documented, 25% or more lost by 2025), <strong>Potential opportunities</strong> (not documented, 25% or more lost), <strong>Possibly proactive</strong>, and <strong>Lower current priority</strong>.",
      },
      {
        title: "Refine if needed",
        body: "Under <strong>Refine criteria</strong>, set capacity-lost or rate thresholds, restrict to terminal dams or reservoirs with measured surveys, or cut by state, owner type, or purpose. Criteria combine with AND, the question counts follow, and the map hides non-matching reservoirs.",
      },
      {
        title: "Read the count and zoom",
        body: "The results bar states how many of the modeled reservoirs match. <strong>Zoom to matches</strong> frames them; click any dot for its details while the panel stays open.",
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
          { label: "Result", text: "Selected Data opens on the basin's sites, and the tables follow." },
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
        body: "Open the tables with <strong>Table</strong> and check that the count and spread match your intent. <strong>Show selection</strong> isolates the selected rows.",
      },
      {
        title: "Review the region's literature",
        body: "Switch to <strong>Site Literature</strong> and scan for recurring themes: dredging versus drawdown, fish passage, water quality, modeling approaches. What is missing is often the finding.",
      },
      {
        title: "Focus with filters (optional)",
        body: "Open <strong>Data</strong> in the map toolbar and use the Data Filters to narrow within the region, for example Sediment Source = bank erosion or Analysis = sediment transport modeling.",
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
        body: "Open <strong>Data</strong> in the map toolbar, switch on a category and pick a single value, say Sediment Release = drawdown. The map and tables update immediately.",
        notes: [
          { label: "Tip", text: "One filter at a time keeps you out of zero-result dead ends." },
          { label: "Note", text: "While any filter is on, a dot on <strong>Data</strong> says so, even with the panel closed." },
        ],
      },
      {
        title: "Add a second to sharpen",
        body: "Layer on another category (Sediment Characteristic = gravel plus Channel Type = braided rivers) to cut to a targeted subset.",
      },
      {
        title: "Scan the map and tables",
        body: "The map shows where matches cluster; open <strong>Table</strong> for the <strong>Site Literature</strong> and <strong>General Literature</strong> tabs that build the reading list.",
      },
      {
        title: "Check promising analogs",
        body: "Click a promising site and use <strong>Show details</strong> in its popup to confirm its attributes in <strong>Selected Data</strong>, the fastest is-this-relevant check.",
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
  {
    id: "dashboard",
    name: "Dashboard",
    title: "Dashboard: the whole dataset at a glance",
    image: {
      src: "help/dashboard.jpg",
      alt: "The Dashboard view: the hint to click a tile, the four headline tiles that are also its tabs, and the Sediment management topic with Dam Removal drilled into its sites.",
    },
    facets: {
      goal: "See the national picture in a few charts, then drill from any slice, quadrant, loss class or state to the sites and reservoirs behind it.",
      when: "You want trends across the database rather than one site: which management methods are documented, what the literature covers, and where modeled storage loss concentrates.",
      get: "Four headline tiles that open four topics: the documented sites by their management keywords; the literature by its keywords; the four screening quadrants with the same counts as the Screening panel; and percent capacity lost across the country by class and by state.",
      tip: "The Dashboard always summarizes the whole dataset. Data Filters set on the Map view do not apply here; a notice says so while they are on.",
    },
    steps: [
      {
        title: "Switch to the Dashboard",
        body: "Use the <strong>Map · Dashboard · Library</strong> switch in the header. The map keeps its position, selection and layers underneath, so switching back costs nothing.",
      },
      {
        title: "Pick a topic",
        body: "The four headline tiles are also the tabs: <strong>Sediment management</strong> (documented sites), <strong>Literature</strong> (publications), <strong>Management and loss</strong> (sites with modeled data) and <strong>Capacity lost</strong> (the nation's original storage lost by 2025). Click one (the arrow on each tile opens it), or use the arrow keys, to show that topic below. Every number is computed from the loaded data.",
        notes: [
          { label: "Note", text: "Keyword counts are exact keywords, so a site tagged Hydraulic Dredging does not count under Dredging (the Data Filters match text fragments instead)." },
        ],
      },
      {
        title: "Pick a dimension",
        body: "In the first two topics, the switch centred above the chart picks one keyword field at a time: choose a site keyword (sediment release, ecological concern, analysis, site type) or a literature keyword and the publication scope. Sites and publications may carry several keywords, so slices count keyword mentions and the legend counts records.",
      },
      {
        title: "Click a slice to drill down",
        body: "The slice slides out and a panel opens below it: a second keyword breakdown, the modeled loss at the sites linked to a reservoir, and the list of members. The same works for a screening quadrant, a loss class, or a state tile. Each topic keeps its own drill-down while you look at the others.",
        notes: [{ label: "Result", text: "The state tiles are coloured by the share of each state's modeled reservoirs that have lost 25% or more of their capacity by 2025." }],
      },
      {
        title: "Follow a site or reservoir to the map",
        body: "<strong>Show on map</strong> selects it and opens the Map view on it; <strong>Show all on map</strong> frames a whole slice and lists its sites in Selected Data. <strong>Open in Screening</strong> puts a quadrant's question into the docked Screening panel, and <strong>Screen this state on the map</strong> does the same for a state; <strong>Open in Library</strong> takes a literature keyword to the Library.",
      },
    ],
  },
  {
    id: "library",
    name: "Library",
    title: "Library: every publication in one place",
    image: {
      src: "help/library.jpg",
      alt: "The Library view: the filters on the left with one group open, the publication table in the middle, and the open publication on the right with its sites and keywords in one table.",
    },
    facets: {
      goal: "Find publications by site, topic, method, document type or decade, and read each one's full keyword record.",
      when: "You are building a reading list, checking what has been written about a site, or looking for the methods used in comparable work.",
      get: "A sortable table of the site-linked and general literature, each publication's citation and source link, the sites it covers (each a way to the map), and every recorded field in one table.",
      tip: "Every count follows the other criteria, so the numbers beside the options and the scopes always say how many publications a click would leave.",
    },
    steps: [
      {
        title: "Search",
        body: "Type in the search box above the table to match titles, authors, years, document types, geography and site names; every word must match. The count follows as you type.",
      },
      {
        title: "Filter",
        body: "Open a filter group on the left (one opens at a time) and tick document types, decades, focus and method keywords, sediment characteristics and sources, settings, covered topics, or risk themes. Values within one facet combine with OR; facets combine with AND. A number on a group's header counts its ticks. Active criteria appear above the table; remove one with its ✕ or use <strong>Clear all</strong>.",
      },
      {
        title: "Choose the scope and the order",
        body: "<strong>All</strong>, <strong>Site literature</strong> (publications tied to documented sites) or <strong>General</strong> (publications with no site). Click the <strong>Title</strong>, <strong>Year</strong> or <strong>Site</strong> heading to sort by that column; click it again to reverse.",
      },
      {
        title: "Read a publication",
        body: "Click a row to read it on the right, or move through the rows with the up and down arrow keys. The pane shows the citation, <strong>Open source</strong> for its link, and one table of every recorded field. Click any keyword there to filter the list by it; click it again to remove that filter.",
      },
      {
        title: "Jump to its sites",
        body: "A site in the pane selects that site and opens the Map view on it; <strong>Show all sites on map</strong> frames every site the publication covers. The site's own Selected Data panel lists the same literature under Site Literature.",
      },
    ],
  },
];
