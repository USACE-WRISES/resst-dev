// The results table: four tabs ported from the Experience Builder table
// widget, with per-tab search fields, sortable columns, row selection that
// drives the map and details panel, a Show-selection view, and an Actions
// menu exporting the CURRENT filtered rows (CSV / GeoJSON / Shapefile) or
// zooming the map to them.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { TABS, type TabDef, type TabId } from "../config/tabs";
import type { Derived } from "../state/derive";
import { actions, type AppState } from "../state/store";
import { containsValue } from "../filters/engine";
import { exportCsv, exportGeoJson, exportShapefile } from "../utils/exporters";
import { mapCommands } from "../map/mapBus";

type Row = Record<string, unknown>;

function rowsForTab(tab: TabId, derived: Derived): Row[] {
  switch (tab) {
    case "sites":
      return derived.sites as unknown as Row[];
    case "siteLit":
      return derived.siteLit as unknown as Row[];
    case "generalLit":
      return derived.generalLit as unknown as Row[];
    case "allLit":
      return derived.literatureAll as unknown as Row[];
  }
}

function ActionsMenu({ tab, rows, derived }: { tab: TabDef; rows: Row[]; derived: Derived }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasGeometry = tab.id === "sites" || tab.id === "generalLit" || tab.id === "allLit";
  const run = (fn: () => void | Promise<void>) => {
    setOpen(false);
    void fn();
  };
  return (
    <div className="actions-menu" ref={ref}>
      <button type="button" className="actions-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        Actions ▾
      </button>
      {open && (
        <div role="menu" className="menu-popover" aria-label={`Actions for ${tab.label}`}>
          <div className="menu-note">Current {tab.label} rows ({rows.length.toLocaleString()})</div>
          <button role="menuitem" type="button" onClick={() => run(() => exportCsv(rows, tab.columns, tab.id))}>
            Export CSV
          </button>
          {hasGeometry && (
            <button role="menuitem" type="button" onClick={() => run(() => exportGeoJson(rows, tab.columns, tab.id))}>
              Export GeoJSON
            </button>
          )}
          {hasGeometry && (
            <button role="menuitem" type="button" onClick={() => run(() => exportShapefile(rows, tab.columns, tab.id))}>
              Export Shapefile (zip)
            </button>
          )}
          {tab.id === "sites" && (
            <button
              role="menuitem"
              type="button"
              onClick={() => run(() => mapCommands()?.fitToSites(derived.sites))}
            >
              Zoom map to results
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DataTable({ tab, rows, selectedIds }: { tab: TabDef; rows: Row[]; selectedIds: Set<string> }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = useMemo(() => {
    const helper = createColumnHelper<Row>();
    return tab.columns.map((c) =>
      helper.accessor((row) => row[c.field] as string, {
        id: c.field,
        header: c.label,
        cell: (info) => info.getValue() ?? "",
      }),
    );
  }, [tab]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectable = tab.id === "sites" || tab.id === "siteLit";
  return (
    <div className="table-scroll" role="region" aria-label={`${tab.label} results`} tabIndex={0}>
      <table className="data-table">
        <caption className="sr-only">
          {tab.label}: {rows.length} records. {selectable ? "Click a row to select its site." : ""}
        </caption>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const dir = h.column.getIsSorted();
                return (
                  <th key={h.id} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}>
                    <button type="button" className="th-sort" onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <span className="sort-ind" aria-hidden="true">{dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => {
            const row = r.original;
            const rowSiteId = (row["site_id"] as string) || "";
            const isSelected = selectable && !!rowSiteId && selectedIds.has(rowSiteId);
            return (
              <tr
                key={r.id}
                className={isSelected ? "row-selected" : selectable && rowSiteId ? "row-selectable" : undefined}
                aria-selected={selectable ? isSelected : undefined}
                onClick={selectable && rowSiteId ? () => actions.selectSite(isSelected ? null : rowSiteId) : undefined}
              >
                {r.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TablePanel({ derived, state }: { derived: Derived; state: AppState }) {
  const tab = TABS.find((t) => t.id === state.activeTab) ?? TABS[0];
  const searchText = state.tabSearch[tab.id] ?? "";
  const allRows = rowsForTab(tab.id, derived);
  const selectedIds = derived.selection.siteIdSet;

  const rows = useMemo(() => {
    let r = allRows;
    if (state.showSelectionOnly && selectedIds.size > 0 && (tab.id === "sites" || tab.id === "siteLit")) {
      r = r.filter((row) => selectedIds.has((row["site_id"] as string) || ""));
    }
    if (searchText) r = r.filter((row) => containsValue(row[tab.searchField], searchText));
    return r;
  }, [allRows, searchText, tab, state.showSelectionOnly, selectedIds]);

  return (
    <section className="table-panel" aria-label="Results tables">
      <div className="table-toolbar">
        <div role="tablist" aria-label="Result tables" className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab.id}
              className={t.id === tab.id ? "tab active" : "tab"}
              onClick={() => actions.setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="table-tools">
          <input
            type="search"
            className="table-search"
            placeholder={`Search ${tab.columns.find((c) => c.field === tab.searchField)?.label.toLowerCase() ?? "records"}…`}
            aria-label={`Search ${tab.label}`}
            value={searchText}
            onChange={(e) => actions.setTabSearch(tab.id, e.target.value)}
          />
          {selectedIds.size > 0 && (tab.id === "sites" || tab.id === "siteLit") && (
            <label className="show-selection">
              <input
                type="checkbox"
                checked={state.showSelectionOnly}
                onChange={(e) => actions.setShowSelectionOnly(e.target.checked)}
              />
              <span>Show selection</span>
            </label>
          )}
          {selectedIds.size > 0 && (
            <button type="button" className="linklike" onClick={() => actions.clearSelection()}>
              Clear selection
            </button>
          )}
          <ActionsMenu tab={tab} rows={rows} derived={derived} />
        </div>
      </div>
      <DataTable tab={tab} rows={rows} selectedIds={selectedIds} />
      <div className="table-footer">
        Total: <b>{rows.length.toLocaleString()}</b> | Selection: <b>{selectedIds.size}</b>
        {searchText && <span className="muted"> (search active)</span>}
      </div>
    </section>
  );
}
