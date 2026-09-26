// Inline SVG icons (the app's pattern: no icon font or library). Decorative
// only: every icon is aria-hidden and paints with currentColor, so the
// surrounding control carries the accessible name and the colour.

type IconProps = { size?: number; className?: string };

const svgProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  "aria-hidden": true as const,
  focusable: "false" as const,
  className: className ? `icon ${className}` : "icon",
});

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A cursor arrow: "click here" (the Dashboard's hints). */
export function PointerIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4.5 2.5v10l2.8-2.6 1.9 4 1.9-.9-1.9-3.9h3.7z" {...stroke} />
    </svg>
  );
}

export function ChevronDown({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 6l4 4 4-4" {...stroke} />
    </svg>
  );
}

export function ChevronLeft({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M10 3.5L5.5 8l4.5 4.5" {...stroke} />
    </svg>
  );
}

export function ChevronRight({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M6 3.5L10.5 8 6 12.5" {...stroke} />
    </svg>
  );
}

export function ExternalLink({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" {...stroke} />
    </svg>
  );
}

export function CloseIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 4l8 8M12 4l-8 8" {...stroke} />
    </svg>
  );
}

export function FilterIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M2.25 3h11.5L9.25 8.6v4.4l-2.5-1.25V8.6z" {...stroke} />
    </svg>
  );
}

/** Three sliders: the Data Filters panel (distinct from Screening's funnel). */
export function SlidersIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M2 4h12M2 8h12M2 12h12" {...stroke} strokeOpacity={0.55} />
      <circle cx="5.5" cy="4" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="8" r="1.6" fill="currentColor" />
      <circle cx="7" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** A small table: the results table. */
export function TableIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="2" y="2.75" width="12" height="10.5" rx="1.25" {...stroke} />
      <path d="M2 6.25h12M2 9.75h12M6.5 6.25v7" {...stroke} />
    </svg>
  );
}

/** A folded map: the Map view. */
export function MapIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M1.75 3.75l4-1.5 4.5 1.5 4-1.5v10l-4 1.5-4.5-1.5-4 1.5z" {...stroke} />
      <path d="M5.75 2.25v10M10.25 3.75v10" {...stroke} />
    </svg>
  );
}

/** A pie chart: the Dashboard view. */
export function ChartIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="8" cy="8" r="6.25" {...stroke} />
      <path d="M8 1.75V8l4.5 4.25" {...stroke} />
    </svg>
  );
}

/** An open book: the Library view. */
export function BookIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M1.75 2.75h4.5a1.75 1.75 0 0 1 1.75 1.25 1.75 1.75 0 0 1 1.75-1.25h4.5v9.75h-4.75a1.5 1.5 0 0 0-1.5 1 1.5 1.5 0 0 0-1.5-1H1.75z" {...stroke} />
      <path d="M8 4v9.5" {...stroke} />
    </svg>
  );
}

export function DocumentIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 1.75h5.25L12.5 5v8.25a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1z" {...stroke} />
      <path d="M9 2v3.25h3.25M5.75 8.5h4.5M5.75 11h4.5" {...stroke} />
    </svg>
  );
}
