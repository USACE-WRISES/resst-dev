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

export function DocumentIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 1.75h5.25L12.5 5v8.25a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1z" {...stroke} />
      <path d="M9 2v3.25h3.25M5.75 8.5h4.5M5.75 11h4.5" {...stroke} />
    </svg>
  );
}
