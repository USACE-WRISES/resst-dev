// The results table: four tabs ported from the Experience Builder table
// widget, with per-tab search fields, sortable columns, and row selection
// that drives the map and details panel (sites and site-linked literature).

import { useMemo, useState } from "react";
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

function DataTable({ tab, rows, selectedSiteId }: { tab: TabDef; rows: Row[]; selectedSiteId: string | null }) {
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
            const isSelected = selectable && !!rowSiteId && rowSiteId === selectedSiteId;
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
  const rows = useMemo(
    () => (searchText ? allRows.filter((r) => containsValue(r[tab.searchField], searchText)) : allRows),
    [allRows, searchText, tab],
  );
  const selectionCount = state.selectedSiteId ? 1 : 0;

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
          {state.selectedSiteId && (
            <button type="button" className="linklike" onClick={() => actions.selectSite(null)}>
              Clear selection
            </button>
          )}
        </div>
      </div>
      <DataTable tab={tab} rows={rows} selectedSiteId={state.selectedSiteId} />
      <div className="table-footer">
        Total: <b>{rows.length.toLocaleString()}</b> | Selection: <b>{selectionCount}</b>
        {searchText && <span className="muted"> (search active)</span>}
      </div>
    </section>
  );
}
