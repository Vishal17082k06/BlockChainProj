import type { SVGProps } from 'react'

// A small hand-drawn set: 16px grid, 1.75 stroke, round joins. No icon library, so every glyph is ours.
export type IconName =
  | 'check'
  | 'alert'
  | 'gap'
  | 'removed'
  | 'dash'
  | 'conflict'
  | 'offline'
  | 'copy'
  | 'external'
  | 'close'
  | 'chevron'
  | 'anchor'
  | 'bolt'
  | 'scan'
  | 'edit'

const PATHS: Record<IconName, React.ReactNode> = {
  check: <path d="M3.2 8.6l3.1 3.1 6.5-7.4" />,
  alert: (
    <>
      <path d="M8 2.1l6.1 10.9H1.9L8 2.1z" />
      <path d="M8 6.4v3" />
      <path d="M8 11.3h.01" />
    </>
  ),
  gap: <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="2.2" strokeDasharray="2.2 2.2" />,
  removed: (
    <>
      <path d="M3 4.6h10" />
      <path d="M6.3 4.6V3h3.4v1.6" />
      <path d="M4.4 4.6l.6 8.2h6l.6-8.2" />
    </>
  ),
  dash: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M5.6 8h4.8" />
    </>
  ),
  conflict: (
    <>
      <path d="M3 5.6h9.2l-2.2-2.2" />
      <path d="M13 10.4H3.8l2.2 2.2" />
    </>
  ),
  offline: (
    <>
      <path d="M1.8 6.2a8.6 8.6 0 0 1 12.4 0" />
      <path d="M4.4 8.9a5 5 0 0 1 7.2 0" />
      <path d="M8 12.4h.01" />
      <path d="M2.4 2.4l11.2 11.2" />
    </>
  ),
  copy: (
    <>
      <rect x="5.4" y="5.4" width="8" height="8" rx="1.8" />
      <path d="M10.6 5.4V4.2a1.8 1.8 0 0 0-1.8-1.8H4.2a1.8 1.8 0 0 0-1.8 1.8v4.6a1.8 1.8 0 0 0 1.8 1.8h1.2" />
    </>
  ),
  external: (
    <>
      <path d="M9.4 2.6h4v4" />
      <path d="M13.4 2.6L7.6 8.4" />
      <path d="M11.6 9.4v2.6a1.4 1.4 0 0 1-1.4 1.4H4a1.4 1.4 0 0 1-1.4-1.4V5.8A1.4 1.4 0 0 1 4 4.4h2.6" />
    </>
  ),
  close: <path d="M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" />,
  chevron: <path d="M4 6.2l4 4 4-4" />,
  anchor: (
    <>
      <circle cx="8" cy="3.6" r="1.4" />
      <path d="M8 5v8.4" />
      <path d="M4 9.4c.3 2.3 1.9 4 4 4s3.7-1.7 4-4" />
      <path d="M5.6 7.8H3m10 0h-2.6" />
    </>
  ),
  bolt: <path d="M9.2 1.8L3.6 9h4.2l-1 5.2L12.4 7H8.2l1-5.2z" />,
  scan: (
    <>
      <path d="M2.4 5.4V3.6a1.2 1.2 0 0 1 1.2-1.2h1.8" />
      <path d="M10.6 2.4h1.8a1.2 1.2 0 0 1 1.2 1.2v1.8" />
      <path d="M13.6 10.6v1.8a1.2 1.2 0 0 1-1.2 1.2h-1.8" />
      <path d="M5.4 13.6H3.6a1.2 1.2 0 0 1-1.2-1.2v-1.8" />
      <path d="M5.6 8.2l1.7 1.7 3.2-3.6" />
    </>
  ),
  edit: (
    <>
      <path d="M10.4 3.2l2.4 2.4" />
      <path d="M2.8 13.2l.6-2.8 7-7 2.2 2.2-7 7-2.8.6z" />
    </>
  ),
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
