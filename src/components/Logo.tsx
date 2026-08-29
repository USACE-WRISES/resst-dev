// The RESST brand mark: a vector remaster of the original logo art (water
// surface, sediment settling through the water column, cobble bed), bolded
// and simplified so it stays legible at favicon size. Keep in sync with
// public/logo.svg — the standalone favicon copy of the same artwork.

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="62" height="62" rx="12" fill="#3f8ec4" stroke="#14212c" strokeWidth="2" />
      <g fill="none" stroke="#14212c" strokeWidth="2.8" strokeLinecap="round">
        <path d="M7 11 q5 -4 10 0 t10 0 t10 0 t10 0 t10 0" />
        <path d="M12 19 q5 -4 10 0 t10 0 t10 0 t10 0" />
      </g>
      <g fill="#14212c">
        <path transform="translate(20,25)" d="M-2 0 h4 v9 h2.5 L0 17 L-4.5 9 h2.5 z" />
        <path transform="translate(41,27)" d="M-2 0 h4 v9 h2.5 L0 17 L-4.5 9 h2.5 z" />
      </g>
      <g fill="#f6f4ee" stroke="#14212c" strokeWidth="1.6" strokeLinejoin="round">
        <path transform="translate(31,33)" d="M0 -3.2 L3 -1 L1.9 2.7 L-1.9 2.7 L-3 -1 Z" />
        <path transform="translate(51,29)" d="M0 -2.7 L2.5 -0.8 L1.6 2.3 L-1.6 2.3 L-2.5 -0.8 Z" />
      </g>
      <g stroke="#14212c" strokeWidth="2">
        <circle cx="12" cy="53.5" r="6.5" fill="#f6f4ee" />
        <circle cx="25.5" cy="55.5" r="6" fill="#e0913f" />
        <circle cx="38.5" cy="53" r="6.5" fill="#f6f4ee" />
        <circle cx="51.5" cy="55.5" r="6" fill="#e0913f" />
        <circle cx="58" cy="48" r="4.4" fill="#f6f4ee" />
      </g>
    </svg>
  );
}
