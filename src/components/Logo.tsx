// The RESST brand mark: a vector remaster of the original logo art (water
// surface, sediment settling through the water column, cobble bed), bolded
// and simplified so it stays legible at favicon size. Keep in sync with
// public/logo.svg — the standalone favicon copy of the same artwork.

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="62" height="62" rx="12" fill="#3f8ec4" stroke="#14212c" strokeWidth="2" />
      <path d="M7 12 q6 -4.5 12 0 t12 0 t12 0 t12 0" fill="none" stroke="#14212c" strokeWidth="3.2" strokeLinecap="round" />
      <path transform="translate(32,20)" d="M-3 0 h6 v14 h4 L0 24 L-7 14 h4 z" fill="#14212c" />
      <g fill="#f6f4ee" stroke="#14212c" strokeWidth="1.8" strokeLinejoin="round">
        <path transform="translate(48,29)" d="M0 -4.2 L3.9 -1.3 L2.4 3.4 L-2.4 3.4 L-3.9 -1.3 Z" />
        <path transform="translate(15.5,33)" d="M0 -3.7 L3.4 -1.1 L2.1 3 L-2.1 3 L-3.4 -1.1 Z" />
      </g>
      <g stroke="#14212c" strokeWidth="2">
        <circle cx="12" cy="54" r="7" fill="#f6f4ee" />
        <circle cx="28" cy="55.5" r="8" fill="#e0913f" />
        <circle cx="44.5" cy="54" r="7.5" fill="#f6f4ee" />
        <circle cx="57.5" cy="55.5" r="5.5" fill="#e0913f" />
      </g>
    </svg>
  );
}
