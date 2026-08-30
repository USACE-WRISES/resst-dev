# Reservoir Sediment Management Web Application
## Highest-Impact Opportunities for Integrating ResNet, RATTES, RESSED/RISE/RSI, and Existing Sediment Release Data

## Purpose

The current application is a national web map showing documented sediment release and sediment management information for dams across the United States. Its purpose is to help practitioners understand how sediment is currently managed at different reservoirs and use that information to make more sustainable, ecologically valuable reservoir sediment management decisions.

The biggest opportunity is to evolve the application from a **map of documented sediment release practices** into a **reservoir sediment management decision-support system**.

The existing sediment release dataset answers:

> **What are other dams doing?**

The additional datasets can help answer:

> **How serious is the sedimentation problem at this reservoir?**
>
> **How is this reservoir connected to other dams and downstream resources?**
>
> **What is likely to happen if current conditions continue?**
>
> **What similar reservoirs are using sediment management successfully?**
>
> **Where are the biggest opportunities for more sustainable sediment management?**

---

# 1. Recommended Core User Workflow

The strongest overall application concept is to organize the selected-dam experience around five questions.

## 1. What is happening here?

Use the existing sediment release and sediment management database to summarize:

- Sediment management method
- Sediment release method
- Reported sediment release or removal volume
- Frequency of management actions
- Operational approach
- Available project documentation
- Known ecological or downstream objectives
- Dam owner/operator
- Reservoir purpose

This remains the core observational management dataset.

## 2. How serious is the sedimentation problem?

Use **RATTES v1.2** to provide modeled reservoir sedimentation context.

Potential outputs:

- Original/design reservoir storage capacity
- Estimated current remaining storage capacity
- Estimated accumulated sediment volume
- Percent of original storage capacity lost
- Estimated annual sediment accumulation
- Projected storage capacity in 2030, 2040, and 2050
- Projected cumulative sediment volume in 2030, 2040, and 2050

Recommended primary model:

- **RATTES v1.2**
- **Silt/default scenario**
- Sand and clay scenarios treated as model sensitivity cases rather than separate sediment fractions

## 3. How certain are we?

Where available, incorporate **measured reservoir survey information** from:

- RESSED
- RSI
- RISE
- Other agency reservoir sediment surveys

Clearly separate:

- **Measured / surveyed values**
- **Modeled RATTES estimates**

A selected reservoir could show measured capacity observations as points over a continuous RATTES modeled trajectory.

Example:

- 1954 survey: measured storage
- 1987 survey: measured storage
- 2015 survey: measured storage
- 2025: RATTES modeled storage
- 2050: RATTES projected storage

This would make model provenance and uncertainty much easier to understand.

## 4. How is this reservoir connected?

Use **ResNet** to place the selected reservoir within the entire reservoir network.

Potential information:

- Number of upstream dams
- Number of downstream dams
- Immediate upstream dams
- Immediate downstream dam
- Terminal dam status
- River mouth
- Associated coastal delta
- Original drainage area
- Sediment-contributing drainage area
- Portion of watershed effectively disconnected by upstream sediment trapping
- Distance to river mouth
- Distance to downstream reservoirs

This changes the user perspective from an isolated dam to a **connected sediment network**.

## 5. What are comparable reservoirs doing?

Use the combined data to identify reservoirs with similar characteristics and show their documented sediment management practices.

Potential similarity variables:

- Reservoir storage volume
- Drainage area
- Reservoir age
- Dam height
- Reservoir purpose
- Region
- Sedimentation rate
- Percent storage lost
- Estimated cumulative sediment volume
- Network position
- Upstream dam count
- Terminal vs. non-terminal reservoir
- Owner/operator type

The workflow becomes:

> **My reservoir has this problem → show me similar reservoirs → show me how they manage sediment.**

This may become the most directly useful decision-support feature in the application.

---

# 2. Highest-Priority Features

## Priority 1 — Upstream / Downstream Reservoir Network Explorer

### Concept

When a user selects a dam, provide buttons such as:

- **Show Upstream Dams**
- **Show Downstream Dams**
- **Show Full Sediment Network**

### Map behavior

Highlight:

- Selected reservoir
- All upstream reservoirs
- Immediate upstream reservoirs
- Immediate downstream reservoir
- All downstream reservoirs
- Terminal reservoir
- River mouth / coastal outlet

### Supporting summary

Example:

> **37 upstream reservoirs influence sediment delivery to this reservoir.**
>
> **This reservoir is upstream of 6 additional reservoirs before the river reaches the Gulf of Mexico.**

### Additional graphic

Provide a simplified network diagram:

```text
Upper Basin
    |
 Dam A
    |
 Dam B
    |
SELECTED DAM
    |
 Dam D
    |
Terminal Dam
    |
River Mouth
```

### Why this is high impact

Most dam databases treat reservoirs as isolated points.

ResNet allows the application to communicate **system-scale sediment connectivity**.

This could be one of the most visually distinctive features in the application.

---

# 3. RATTES Sedimentation and Storage Trajectory

## Concept

For the selected reservoir, show how sediment accumulation and remaining reservoir storage change through time.

### Graphic

A simple paired chart could show:

- **Accumulated sediment volume increasing**
- **Remaining reservoir storage decreasing**

Potential time range:

- Dam construction
- 2025
- 2030
- 2040
- 2050

### Possible visual

```text
Reservoir Storage

Original       ████████████████████ 100%
2025           █████████████████    84%
2030           ████████████████     81%
2040           ███████████████      75%
2050           █████████████        68%

Accumulated Sediment

Original       0
2025           ███
2030           ████
2040           █████
2050           ███████
```

### Suggested terminology

Avoid using only "Current Storage," because users may interpret that as current water volume.

Preferred labels:

- **Estimated Remaining Storage Capacity**
- **Estimated Accumulated Sediment Volume**
- **Estimated Percent Capacity Lost**
- **RATTES v1.2 Modeled Estimate**

### Why this is high impact

It makes reservoir sustainability visible immediately.

A user can understand in seconds:

> **How much storage has already been lost?**
>
> **Where is the reservoir heading if current conditions continue?**

---

# 4. Measured vs. Modeled Sedimentation

## Concept

Overlay reservoir sediment surveys on the RATTES modeled storage trajectory.

### Example

```text
Storage Capacity
|
|  ● Survey 1950
|       ● Survey 1985
|            ● Survey 2014
|             \
|              \ RATTES
|               \
|                \ 2050 projection
|
+-------------------------------- Time
```

### Data sources

Potential survey information:

- RESSED
- RSI
- RISE
- USACE surveys
- Reclamation surveys
- Other agency sedimentation surveys

### User-facing evidence classification

#### High Evidence
Recent measured sediment survey + RATTES model

#### Moderate Evidence
Older measured sediment survey + RATTES model

#### Modeled Only
No known sediment survey; RATTES estimate only

### Why this is high impact

This helps prevent users from confusing modeled estimates with observations.

It also makes the application more scientifically defensible.

---

# 5. Similar Reservoirs / Management Analog Finder

## Concept

When a reservoir is selected, provide:

> **Find Similar Reservoirs**

The application identifies peer reservoirs based on physical and sediment-management characteristics.

### Example comparison criteria

- Storage capacity
- Drainage area
- Reservoir age
- Dam height
- Primary purpose
- Region
- Sedimentation rate
- Percent capacity lost
- Sediment accumulation
- Upstream dam density
- Network position
- Ownership

### Example result

| Reservoir | Similarity | Sediment Problem | Management Practice |
|---|---:|---|---|
| Reservoir A | 92% | High sedimentation | Drawdown flushing |
| Reservoir B | 88% | Moderate storage loss | Sediment bypass |
| Reservoir C | 84% | High deposition | Dredging |
| Reservoir D | 81% | Moderate sedimentation | Sluicing |

### Why this is high impact

This directly supports management decisions.

The application shifts from:

> "Here are examples of sediment management."

To:

> **"Here are the examples most relevant to your reservoir."**

---

# 6. National Sediment Management Opportunity Finder

## Concept

Create filters that identify reservoirs where sediment management may deserve further investigation.

Do not initially create an opaque composite score. Instead, let users combine transparent criteria.

### Potential filters

- More than 10%, 25%, or 50% storage capacity lost
- High modeled cumulative sediment volume
- High projected storage loss by 2050
- High modeled annual sedimentation rate
- No documented sediment management practice
- Terminal reservoir
- Short distance to downstream river mouth
- Large downstream ecological system
- Federal ownership
- High sediment-contributing drainage area
- High number of upstream reservoirs

### Example workflow

> Show reservoirs where:

- Estimated capacity loss >25%
- No documented sediment management practice
- Accumulated sediment >5 million m³
- Projected additional loss >10% by 2050

### Why this is high impact

This changes the application from a passive information viewer into a **national screening tool**.

---

# 7. Sediment Management Gap Analysis

## Concept

Explicitly identify locations where the modeled sedimentation problem is large but no sediment management activity is documented.

### Possible categories

#### Known Management + High Sedimentation
Potential case studies / learning sites

#### Known Management + Low Sedimentation
Potentially proactive management

#### No Known Management + High Sedimentation
Potential management gap

#### No Known Management + Low Sedimentation
Lower current priority

### Important wording

Avoid stating that reservoirs without documented management **need** intervention.

Instead use:

- **Potential sediment management opportunity**
- **Reservoirs warranting further evaluation**

### Why this is useful

It can identify:

- Research priorities
- Data collection priorities
- Potential management opportunities
- Candidate case studies
- Federal coordination opportunities

---

# 8. Sediment Release Context

## Concept

Use RATTES to put existing documented sediment release volumes into context.

Instead of showing only:

> Sediment released: 120,000 m³

also show:

> Equivalent to approximately X% of estimated annual sediment accumulation.

or:

> Equivalent to approximately X years of modeled sediment accumulation.

or:

> Equivalent to approximately X% of estimated sediment currently stored in the reservoir.

### Potential normalized metrics

- Documented release / estimated annual sediment accumulation
- Documented release / estimated cumulative sediment stored
- Documented release / original reservoir capacity
- Documented release / current estimated storage capacity

### Possible new metric: Sediment Replacement Ratio

```text
Documented annual sediment release
-----------------------------------
Estimated annual sediment accumulation
```

A value near 1.0 could indicate that management is moving sediment at approximately the same magnitude as estimated annual accumulation.

### Caveat

This metric would require careful alignment of:

- Time periods
- Release frequencies
- Sediment volume definitions
- Bulk density assumptions
- Survey/model periods

It should be treated as a screening metric rather than a precise sediment budget unless the input data support that interpretation.

---

# 9. Terminal Dam and Coastal Sediment Opportunity

## Concept

Use ResNet to identify terminal reservoirs and their downstream relationship to river mouths and coastal deltas.

### Display

For terminal or near-terminal reservoirs show:

- Distance to river mouth
- Downstream reservoirs remaining
- Associated delta / coastal receiving area
- Estimated sediment accumulated
- Estimated annual trapping
- Known sediment release practices
- Potential downstream sediment connectivity

### Possible special map mode

**Coastal Sediment Connectivity**

Highlight reservoirs where sediment management may have particular relevance to downstream sediment delivery.

### Important qualification

Do not imply that all sediment stored behind a reservoir could or should be transported to the coast.

The application should communicate:

- Network position
- Potential sediment connectivity
- Relative sediment quantities

rather than guaranteeing downstream sediment delivery.

---

# 10. Sediment Connectivity Map Mode

## Concept

Provide a dedicated map mode focused on sediment connectivity rather than management methods.

### Selected reservoir map could show

- Full drainage area
- Sediment-contributing drainage area
- Upstream reservoirs
- Upstream portions of the watershed effectively disconnected by reservoir trapping
- Selected reservoir
- Downstream reservoir network
- Terminal dam
- River mouth

### Supporting metric

```text
Original drainage area:              18,200 km²
Current sediment-contributing area:  11,400 km²
Area disconnected by upstream dams:   6,800 km²
Relative reduction:                     37%
```

### Why this is high impact

It makes one of ResNet's most powerful concepts visible and understandable.

---

# 11. Before-Dams vs. Current-Network Comparison

## Concept

Show how reservoir construction has altered sediment connectivity.

### Side-by-side graphic

#### Natural / No Reservoir Network

```text
Watershed
████████████████████
100% potentially connected
```

#### Current Reservoir Network

```text
Watershed
████████████░░░░░░░░
62% sediment-contributing
38% interrupted upstream
```

### Why this is useful

It explains the effect of the reservoir network without requiring users to understand technical ResNet variables.

---

# 12. Basin-Scale Sediment Management View

## Concept

Allow users to select:

- HUC
- River basin
- State
- Agency region
- Custom watershed

and summarize the reservoir sediment system.

### Basin summary

Potential outputs:

- Number of reservoirs
- Number with sediment management records
- Number with sediment surveys
- Total original storage
- Estimated current storage
- Estimated cumulative sediment
- Projected 2050 storage loss
- Number of terminal reservoirs
- Known sediment management techniques
- Largest sediment management gaps

### Why this is high impact

Sediment management is often more meaningful at the **river-system scale** than at an individual reservoir.

---

# 13. Network-Scale Management Consequences

## Concept

When a reservoir is selected, communicate which downstream reservoirs may potentially be affected by changes in sediment passage.

Example:

> **This reservoir is upstream of six other storage reservoirs before the river reaches its terminal reservoir.**

or:

> **Sediment passing this dam would encounter three additional reservoirs before reaching the river mouth.**

### Why this matters

It prevents users from assuming:

> "If sediment passes this dam, it reaches the coast."

Instead, users can immediately see the downstream reservoir chain.

---

# 14. Grain-Size Sensitivity View

## Recommended role

Keep this out of the default user interface.

Primary result:

- **RATTES v1.2 silt/default**

Advanced model sensitivity panel:

- Clay scenario
- Silt/default scenario
- Sand scenario

### Important interpretation

These are not fractions that sum to total sediment.

They are alternative RATTES model realizations based on different Brown trap-efficiency assumptions.

### Why useful

This provides an intuitive indication of sensitivity to assumed sediment behavior.

---

# 15. National Storage-Loss Map

## Concept

Allow the national map to switch among several RATTES-based metrics.

### Map layers

- Estimated accumulated sediment
- Percent original capacity lost
- Estimated remaining storage
- Predicted 2050 storage loss
- Estimated annual sediment accumulation
- Number of upstream dams
- Sediment-contributing drainage area

### Overlay

Overlay known sediment-management sites.

This immediately allows users to ask:

> **Are sediment management projects happening where sedimentation pressures are greatest?**

---

# 16. Expand the Map to the Full ResNet Reservoir Inventory

## Concept

Display the full ResNet reservoir set as a secondary national layer.

### Suggested visual categories

#### Sediment Management Site
Reservoir with documented sediment release/management information

#### Surveyed Reservoir
Reservoir with measured sedimentation/capacity survey

#### Modeled Reservoir
RATTES estimate available but no known survey

#### Surveyed + Managed
Highest-information reservoirs

### Why this matters

This puts the existing sediment release database into national context.

It can visually demonstrate:

- How few reservoirs have documented sediment-management records
- Where sediment surveys exist
- Where management data gaps occur
- Where the highest-information case studies are located

---

# 17. Data Provenance and Transparency

## Concept

Every calculated or displayed value should expose its source.

### Example

**Estimated Accumulated Sediment**
- Source: RATTES v1.2
- Scenario: Silt/default
- Model year: 2025
- Type: Modeled

**Measured Capacity**
- Source: Reclamation RISE
- Survey year: 2018
- Type: Observed

**Downstream Dam Count**
- Source: ResNet
- Version: [version]
- Type: Network-derived

**Sediment Release**
- Source: Reservoir Sustainable Sediment Management database
- Type: Reported/documented

### Why this is high impact

Scientific transparency becomes part of the product rather than documentation hidden elsewhere.

---

# 18. Recommended Selected-Dam Page

A strong reservoir detail interface could be organized as follows.

## Header

- Reservoir name
- Dam name
- Owner
- State
- River
- Primary purpose

## Sediment Management

- Current/known sediment management technique
- Documented sediment release volume
- Frequency
- Reference/project source
- Links

## Reservoir Sustainability

### Current Estimate

- Original storage
- Estimated current storage
- Estimated cumulative sediment
- Percent capacity lost

### Projection

- 2030
- 2040
- 2050

### Graphic

Storage loss + sediment accumulation trajectory.

## Evidence

- Latest measured survey
- Survey year
- Survey source
- Model vs. measured comparison
- Evidence/confidence classification

## Reservoir Network

- Upstream dam count
- Downstream dam count
- Immediate downstream dam
- Terminal dam
- River mouth
- Sediment-contributing drainage area

Buttons:

- **Highlight Upstream**
- **Highlight Downstream**
- **Show Sediment Network**

## Comparable Reservoirs

- 5–10 similar dams
- Similarity explanation
- Sediment management approaches
- Links to reservoir detail pages

---

# 19. Recommended Development Priorities

## Tier 1 — Highest Impact / Highest Value

### 1. ResNet Upstream / Downstream Network Explorer

Why:
- Visually compelling
- Unique
- Directly useful
- Relatively easy concept for users to understand

### 2. RATTES Storage + Sediment Trajectory

Why:
- Makes reservoir sustainability tangible
- Strong communication graphic
- Uses current peer-reviewed national modeling
- Adds future planning relevance

### 3. Measured Survey Points + RATTES Model

Why:
- Scientifically powerful
- Clearly distinguishes observed and modeled data
- Builds user trust
- Makes survey data more valuable

### 4. Similar Reservoir / Management Analog Finder

Why:
- Directly supports management decision-making
- Connects sedimentation problem to existing practices
- Uses the application's unique sediment release dataset

### 5. National Sediment Management Gap Filtering

Why:
- Converts the map into a screening tool
- Supports research and planning priorities
- Identifies potential high-value management opportunities

---

# 20. Tier 2 — Strong Follow-On Features

- Basin-scale summary
- Sediment release normalization
- Terminal dam / coastal opportunity analysis
- Sediment-connectivity map
- Before-dams vs. current-network graphic
- Full ResNet inventory layer
- Evidence/confidence scoring
- Multi-reservoir comparison panel

---

# 21. Tier 3 — Advanced / Research-Oriented Features

- Sand/silt/clay RATTES sensitivity exploration
- Network-scale management scenarios
- Source-to-sea sediment story mode
- Dynamic sediment-management opportunity scoring
- Scenario modeling of reservoir removal or sediment passage
- Estimated cumulative sediment connectivity to coastal deltas

---

# 22. Most Important Product Positioning

The application should not become simply:

> **A larger dam database.**

The unique value comes from connecting four different types of information:

## 1. Management Practice

**What are people currently doing?**

Source:
- Existing sediment release database

## 2. Reservoir Sustainability

**How much sediment is accumulating and how much storage is being lost?**

Source:
- RATTES

## 3. Network Connectivity

**How does this reservoir affect and depend on the rest of the river system?**

Source:
- ResNet

## 4. Observational Evidence

**What has actually been measured?**

Sources:
- RESSED
- RSI
- RISE
- Agency reservoir surveys

The application becomes valuable when these four pieces are combined into a decision workflow.

---

# 23. Recommended Product Vision

A concise way to describe the future application:

> **A national reservoir sediment management decision-support tool that combines documented sediment management practices, measured reservoir sedimentation, modeled storage loss, and reservoir-network connectivity to help practitioners identify sustainable and ecologically valuable sediment management strategies.**

---

# 24. Recommended MVP Expansion

If only five major new capabilities can be developed initially:

1. **Show upstream/downstream reservoirs using ResNet**
2. **Show RATTES v1.2 sediment accumulation and storage-loss trajectory**
3. **Overlay measured survey observations where available**
4. **Find similar reservoirs and show their sediment management practices**
5. **Filter nationally for high-sedimentation reservoirs with limited documented management**

Together, these five features transform the application from a static reference map into a true decision-support workflow:

> **Identify the sedimentation problem → understand the evidence → understand network context → find relevant management analogs → identify opportunities for better sediment management.**
