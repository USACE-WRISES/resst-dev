// The Data Filters panel: three accordion groups of filter items, each with an
// enable switch and a value picker — a faithful port of the Experience Builder
// filter widgets' interaction model (switch applies; empty selection = "field
// has any value"), plus the approved global Clear All (D8).

import { useMemo, useState } from "react";
import type { AppData } from "../lib/types";
import { FILTER_DEFS } from "../config/filters.generated";
import { dynamicOptions, type FilterDef, type FilterState } from "../filters/engine";
import { actions } from "../state/store";
import type { Derived } from "../state/derive";

const GROUPS: Array<{ domain: FilterDef["domain"]; label: string }> = [
  { domain: "sites", label: "Site Keywords" },
  { domain: "siteLit", label: "Site Literature Keywords" },
  { domain: "generalLit", label: "General Literature Keywords" },
];

function FilterItem({ def, state, options }: { def: FilterDef; state: FilterState; options: string[] }) {
  const [open, setOpen] = useState(false);
  const item = state[def.key] ?? { enabled: false, selected: [] };
  const inputId = `filter-switch-${def.key.replace(/\W/g, "-")}`;
  return (
    <div className="filter-item">
      <div className="filter-item-row">
        <button
          type="button"
          className="expander"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${def.label} options`}
          onClick={() => setOpen(!open)}
        >
          {open ? "▾" : "▸"}
        </button>
        <label className="filter-label" htmlFor={inputId}>{def.label}</label>
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          className="switch"
          checked={item.enabled}
          aria-label={`Apply ${def.label} filter`}
          onChange={(e) => actions.setFilterEnabled(def.key, e.target.checked)}
        />
      </div>
      {open && (
        <fieldset className="filter-values">
          <legend className="sr-only">{def.label} values</legend>
          <div className="filter-values-toolbar">
            <span>{item.selected.length} selected</span>
            {item.selected.length > 0 && (
              <button type="button" className="linklike" onClick={() => actions.clearFilterValues(def.key)}>
                Clear
              </button>
            )}
          </div>
          <div className="filter-values-list">
            {options.map((v) => (
              <label key={v} className="value-option">
                <input
                  type="checkbox"
                  checked={item.selected.includes(v)}
                  onChange={() => actions.toggleFilterValue(def.key, v)}
                />
                <span>{v}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function FiltersPanel({ data, filters, derived }: { data: AppData; filters: FilterState; derived: Derived }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ sites: true });

  // Dynamic option lists are computed from the full datasets once.
  const optionsByKey = useMemo(() => {
    const domainRecords = {
      sites: data.sites,
      siteLit: data.entries,
      generalLit: data.literature,
    } as const;
    const map = new Map<string, string[]>();
    for (const def of FILTER_DEFS) {
      map.set(
        def.key,
        def.options ?? dynamicOptions(domainRecords[def.domain] as unknown as Record<string, unknown>[], def.field),
      );
    }
    return map;
  }, [data]);

  const anyActive = FILTER_DEFS.some((d) => filters[d.key]?.enabled || (filters[d.key]?.selected.length ?? 0) > 0);

  return (
    <aside className="filters-panel" id="filters-panel" aria-label="Data filters">
      <div className="panel-title-row">
        <h2>Data Filters</h2>
        <span className="panel-title-tools">
          {anyActive && (
            <button type="button" className="linklike" onClick={() => actions.clearAllFilters()}>
              Clear all
            </button>
          )}
          <button
            type="button"
            className="panel-collapse-btn"
            aria-expanded={true}
            aria-controls="filters-panel"
            aria-label="Collapse Data Filters panel"
            onClick={() => actions.setPanelCollapsed("filters", true)}
          >
            <span aria-hidden="true">«</span>
          </button>
        </span>
      </div>
      {GROUPS.map((g) => {
        const open = !!openGroups[g.domain];
        return (
          <section key={g.domain} className="filter-group">
            <button
              type="button"
              className="group-header"
              aria-expanded={open}
              onClick={() => setOpenGroups((s) => ({ ...s, [g.domain]: !open }))}
            >
              <span>{g.label}</span>
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
            </button>
            {open && (
              <div className="group-body">
                {FILTER_DEFS.filter((d) => d.domain === g.domain).map((def) => (
                  <FilterItem key={def.key} def={def} state={filters} options={optionsByKey.get(def.key) ?? []} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <div className="filtered-counts" aria-live="polite">
        <h2>Filtered Data</h2>
        <div>Sites: <b>{derived.counts.sites.toLocaleString()}</b></div>
        <div>Site Literature: <b>{derived.counts.siteLit.toLocaleString()}</b></div>
        <div>General Literature: <b>{derived.counts.generalLit.toLocaleString()}</b></div>
      </div>
    </aside>
  );
}
