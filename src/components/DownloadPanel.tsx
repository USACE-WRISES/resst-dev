// Download Data panel: full-dataset downloads in GIS formats (built by CI
// from the authoritative CSVs — decision D3), the data-as-of stamp, citation,
// and the contribute pointer. In-app filtered exports live under each table's
// Actions menu.

import { useEffect } from "react";
import type { DataManifest } from "../lib/types";
import { actions } from "../state/store";
import { useFocusTrap } from "../lib/useFocusTrap";

const RELEASE_BASE = "https://github.com/USACE-WRISES/resst-dev/releases/download/data-latest";
const REPO = "https://github.com/USACE-WRISES/resst-dev";

const FILES = [
  { name: "resst-shapefiles.zip", label: "Shapefiles (sites + literature points)", note: "zipped, WGS84" },
  { name: "resst.gpkg", label: "GeoPackage (all tables + relationships)", note: "single file" },
  { name: "resst-filegdb.zip", label: "File Geodatabase (ArcGIS)", note: "zipped .gdb" },
  { name: "resst-csv.zip", label: "CSV tables", note: "the authoritative source data" },
];

export function DownloadPanel({ manifest }: { manifest: DataManifest }) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && actions.setDownloadsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="dialog-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && actions.setDownloadsOpen(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Download data" ref={dialogRef}>
        <div className="help-head">
          <h2 style={{ margin: 0 }}>Download Data</h2>
          <button type="button" className="linklike" onClick={() => actions.setDownloadsOpen(false)} aria-label="Close downloads">
            ✕ Close
          </button>
        </div>
        <p className="muted">
          Complete datasets, regenerated automatically whenever the data changes. Data as of{" "}
          {new Date(manifest.generated).toLocaleDateString()}: {manifest.counts["sites.json"]?.toLocaleString()} sites,{" "}
          {manifest.counts["literature.json"]?.toLocaleString()} literature surveys,{" "}
          {manifest.counts["literature_entries.json"]?.toLocaleString()} literature entries.
        </p>
        <ul className="download-list">
          {FILES.map((f) => (
            <li key={f.name}>
              <a href={`${RELEASE_BASE}/${f.name}`}>
                <b>{f.label}</b>
                <span className="muted"> · {f.note}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="muted">
          To export just the records you have filtered, use the <b>Actions</b> menu above the results table (CSV, GeoJSON,
          Shapefile).
        </p>
        <p className="muted">
          The data and application live at <a href={REPO} target="_blank" rel="noopener noreferrer">USACE-WRISES/resst-dev</a>.
          Corrections and additions are welcome as pull requests; see the repository's data-editing guide.
        </p>
      </div>
    </div>
  );
}
