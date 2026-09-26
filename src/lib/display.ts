// Display helpers for the Selected Data panel: keyword fields as chips,
// literature source links, and NID values with units. Pure (Node-tested);
// the panel's React components only arrange what these return.

/** Keyword values as chips: comma-split and trimmed, with blanks and "Not
    Applicable" dropped and case-insensitive duplicates removed (first spelling
    wins: "Flood control,Flood Control" is one chip). */
export function splitKeywords(value: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (value ?? "").split(",")) {
    const v = part.trim();
    const key = v.toLowerCase();
    if (!v || key === "not applicable" || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/** A count with thousands separators ("57,307"), locale-fixed so tests and
    users read the same digits. */
export const formatCount = (v: number): string => v.toLocaleString("en-US");

/** A free-text list as prose: the data often omits the space after a comma
    ("USACE,Kansas City District"). */
export const tidyList = (value: string | null | undefined): string => (value ?? "").trim().replace(/\s*,\s*/g, ", ");

/** A literature entry's `doi` field is really a general source reference:
    most are URLs (doi.org, usbr.gov, pubs.usgs.gov), some are bare DOIs, and a
    few are report numbers ("EM 1110-2-1602"). Returns a link target when one
    can be made, otherwise the identifier text to show beside the entry. */
export function literatureLink(raw: string | null | undefined): { href?: string; id?: string } {
  const v = (raw ?? "").trim();
  if (!v) return {};
  if (/^https?:\/\//i.test(v)) return { href: v };
  const doi = /^(?:doi:\s*)?(10\.\d{4,}\/\S+)$/i.exec(v);
  if (doi) return { href: `https://doi.org/${doi[1]}` };
  return { id: v };
}

/** NID numeric fields and the unit each displays with (units move out of the
    labels and onto the values). */
const NID_UNITS: Record<string, string> = {
  nid_height: "ft",
  dam_length: "ft",
  nid_storage: "ac-ft",
  normal_storage: "ac-ft",
  surface_area: "acres",
  drainage_area: "sq mi",
  max_discharge: "cfs",
};

/** One NID value for display, or "" to omit the row: blanks, "Not Available"
    and zero measurements (the NID's placeholder for unknown) are omitted;
    measurements gain thousands separators and their unit. */
export function formatNidValue(field: string, raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || /^not available$/i.test(v)) return "";
  const unit = NID_UNITS[field];
  if (!unit) return v;
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isFinite(n)) return v;
  if (n === 0) return "";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${unit}`;
}
