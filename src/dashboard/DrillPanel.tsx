// The drill-down that opens under a chart when a slice, a quadrant, a loss
// class or a state is chosen: a heading with the count, the actions that lead
// out (to the map, to Screening, to the Library), and the members. The two
// member tables page 25 rows at a time.

import { useState, type ReactNode } from "react";
import type { AppData, Site } from "../lib/types";
import { formatCount, tidyList } from "../lib/display";
import { formatPct, formatVolumeAcft, pctLost } from "../sediment/format";
import type { SedimentCore } from "../sediment/types";
import { CloseIcon } from "../components/icons";
import { reservoirName, rowPct } from "./stats";
import { showReservoirOnMap, showSiteOnMap } from "../state/navigate";

const PAGE = 25;

export function DrillPanel({
  title,
  sub,
  actions,
  onClose,
  children,
}: {
  title: string;
  sub: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="dash-drill" role="region" aria-label={`${title}: details`}>
      <div className="dash-drill-head">
        <div className="dash-drill-titles">
          <h3 className="dash-drill-title">{title}</h3>
          <p className="dash-drill-sub">{sub}</p>
        </div>
        <div className="dash-drill-actions">
          {actions}
          <button type="button" className="icon-btn" aria-label="Close details" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

/** "Show more" paging over a list of rows. */
export function usePage<T>(rows: readonly T[]): { shown: T[]; more: number; showMore: () => void } {
  const [limit, setLimit] = useState(PAGE);
  const shown = rows.slice(0, limit) as T[];
  return { shown, more: Math.max(0, rows.length - limit), showMore: () => setLimit((l) => l + PAGE * 2) };
}

export function MoreButton({ more, onClick }: { more: number; onClick: () => void }) {
  if (more <= 0) return null;
  return (
    <button type="button" className="text-btn dash-more" onClick={onClick}>
      Show more ({formatCount(more)} remaining)
    </button>
  );
}

/** Documented sites: place, agency, modeled loss, references, a way to the map. */
export function SiteTable({ sites, data, label }: { sites: readonly Site[]; data: AppData; label: string }) {
  const sorted = [...sites].sort((a, b) => a.site_name.localeCompare(b.site_name));
  const page = usePage(sorted);
  return (
    <div className="dash-table-wrap">
      <table className="dash-table" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Site</th>
            <th scope="col">Place</th>
            <th scope="col">Responsible group</th>
            <th scope="col" className="num">
              Capacity lost by 2025
            </th>
            <th scope="col" className="num">
              References
            </th>
            <th scope="col">
              <span className="sr-only">Map</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {page.shown.map((s) => {
            const link = data.siteSediment.get(s.site_id);
            const pct = link ? pctLost(link.sed2025_m3, link.cap_orig_m3) : null;
            return (
              <tr key={s.site_id}>
                <td>{s.site_name}</td>
                <td>{s.city || s.address}</td>
                <td>{tidyList(s.responsible_districtagency)}</td>
                <td className="num">{pct == null ? <span className="muted">—</span> : formatPct(pct)}</td>
                <td className="num">{formatCount(data.entriesBySite.get(s.site_id)?.length ?? 0)}</td>
                <td>
                  <button type="button" className="text-btn" aria-label={`Show ${s.site_name} on map`} onClick={() => showSiteOnMap(s.site_id)}>
                    Show on map
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <MoreButton more={page.more} onClick={page.showMore} />
    </div>
  );
}

/** Modeled reservoirs: state, modeled loss, original capacity, any documented site, a way to the map. */
export function ReservoirTable({
  core,
  rows,
  sitesBy,
  data,
  label,
}: {
  core: SedimentCore;
  rows: readonly number[];
  sitesBy: ReadonlyMap<number, string[]>;
  data: AppData;
  label: string;
}) {
  const page = usePage(rows);
  return (
    <div className="dash-table-wrap">
      <table className="dash-table" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Reservoir</th>
            <th scope="col">State</th>
            <th scope="col" className="num">
              Capacity lost by 2025
            </th>
            <th scope="col" className="num">
              Original capacity
            </th>
            <th scope="col">Documented site</th>
            <th scope="col">
              <span className="sr-only">Map</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {page.shown.map((r) => {
            const name = reservoirName(core, r);
            const siteIds = sitesBy.get(core.ids[r]) ?? [];
            const siteNames = siteIds.map((id) => data.siteById.get(id)?.site_name ?? id);
            return (
              <tr key={r}>
                <td>{name}</td>
                <td>{core.state[r] >= 0 ? core.dicts.state[core.state[r]] : <span className="muted">—</span>}</td>
                <td className="num">{formatPct(rowPct(core, r))}</td>
                <td className="num">{formatVolumeAcft(core.capOrig[r])}</td>
                <td>{siteNames.length > 0 ? siteNames.join(", ") : <span className="muted">—</span>}</td>
                <td>
                  <button type="button" className="text-btn" aria-label={`Show ${name} on map`} onClick={() => showReservoirOnMap(core, r, sitesBy)}>
                    Show on map
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <MoreButton more={page.more} onClick={page.showMore} />
    </div>
  );
}
