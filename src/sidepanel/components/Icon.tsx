// Small inline icons (stroke-based, 16px grid). Inline SVG keeps the panel fully offline.
const PATHS = {
  risk: "M8 1.8 15 14H1L8 1.8Zm0 4.7v3.6m0 2.1v.1",
  relate: "M2.5 3.5h11v7.5H7l-3.2 2.5V11H2.5V3.5Z",
  avoid: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM3.4 3.4l9.2 9.2",
  copy: "M5.5 5.5V2.5h8v8h-3M2.5 5.5h8v8h-8z",
  check: "m3 8.5 3.2 3L13 4.5",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The product mark: a 2×2 matrix with one highlighted cell. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" rx="2.5" fill="currentColor" opacity=".25" />
      <rect x="12" y="1" width="9" height="9" rx="2.5" fill="currentColor" opacity=".25" />
      <rect x="1" y="12" width="9" height="9" rx="2.5" fill="currentColor" opacity=".25" />
      <rect x="12" y="12" width="9" height="9" rx="2.5" fill="currentColor" />
    </svg>
  );
}
