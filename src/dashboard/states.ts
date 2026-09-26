// US states as the Dashboard's tile grid: postal codes, and each state's cell
// in the familiar 8-row by 12-column tile layout (Alaska and Maine in the
// top corners, Hawaii bottom left, Florida bottom right). The inventory names
// states in full ("Kansas"); this maps them to codes. Pure: unit-tested.

export const STATE_CODES: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Puerto Rico": "PR",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(Object.entries(STATE_CODES).map(([name, code]) => [code, name]));

/** Full state name for a code ("KS" → "Kansas"). */
export const stateName = (code: string): string => NAME_BY_CODE[code] ?? code;

/** Postal code for an inventory state name (case-insensitive), or null. */
export function codeForName(name: string): string | null {
  const key = name.trim().toLowerCase();
  for (const [n, code] of Object.entries(STATE_CODES)) if (n.toLowerCase() === key) return code;
  return null;
}

export interface StateTile {
  code: string;
  /** 1-based grid row and column. */
  row: number;
  col: number;
}

export const GRID_ROWS = 8;
export const GRID_COLS = 12;

/** One cell per state (plus DC and Puerto Rico), no two in the same cell. */
export const STATE_TILES: StateTile[] = [
  { code: "AK", row: 1, col: 1 },
  { code: "ME", row: 1, col: 12 },
  { code: "WI", row: 2, col: 7 },
  { code: "VT", row: 2, col: 11 },
  { code: "NH", row: 2, col: 12 },
  { code: "WA", row: 3, col: 2 },
  { code: "ID", row: 3, col: 3 },
  { code: "MT", row: 3, col: 4 },
  { code: "ND", row: 3, col: 5 },
  { code: "MN", row: 3, col: 6 },
  { code: "IL", row: 3, col: 7 },
  { code: "MI", row: 3, col: 8 },
  { code: "NY", row: 3, col: 10 },
  { code: "MA", row: 3, col: 11 },
  { code: "OR", row: 4, col: 2 },
  { code: "NV", row: 4, col: 3 },
  { code: "WY", row: 4, col: 4 },
  { code: "SD", row: 4, col: 5 },
  { code: "IA", row: 4, col: 6 },
  { code: "IN", row: 4, col: 7 },
  { code: "OH", row: 4, col: 8 },
  { code: "PA", row: 4, col: 9 },
  { code: "NJ", row: 4, col: 10 },
  { code: "CT", row: 4, col: 11 },
  { code: "RI", row: 4, col: 12 },
  { code: "CA", row: 5, col: 2 },
  { code: "UT", row: 5, col: 3 },
  { code: "CO", row: 5, col: 4 },
  { code: "NE", row: 5, col: 5 },
  { code: "MO", row: 5, col: 6 },
  { code: "KY", row: 5, col: 7 },
  { code: "WV", row: 5, col: 8 },
  { code: "VA", row: 5, col: 9 },
  { code: "MD", row: 5, col: 10 },
  { code: "DE", row: 5, col: 11 },
  { code: "AZ", row: 6, col: 3 },
  { code: "NM", row: 6, col: 4 },
  { code: "KS", row: 6, col: 5 },
  { code: "AR", row: 6, col: 6 },
  { code: "TN", row: 6, col: 7 },
  { code: "NC", row: 6, col: 8 },
  { code: "SC", row: 6, col: 9 },
  { code: "DC", row: 6, col: 10 },
  { code: "OK", row: 7, col: 5 },
  { code: "LA", row: 7, col: 6 },
  { code: "MS", row: 7, col: 7 },
  { code: "AL", row: 7, col: 8 },
  { code: "GA", row: 7, col: 9 },
  { code: "HI", row: 8, col: 1 },
  { code: "TX", row: 8, col: 5 },
  { code: "FL", row: 8, col: 10 },
  { code: "PR", row: 8, col: 12 },
];
