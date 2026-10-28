interface IconProps {
  /** Drawn at the current text colour so icons follow the theme. */
  size?: number
}

function Svg({ size = 15, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const PlayIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4.5 2.8 13 8l-8.5 5.2z" fill="currentColor" stroke="none" />
  </Svg>
)

export const BugIcon = (props: IconProps) => (
  <Svg {...props}>
    <path
      d="M5.2 7a2.8 2.8 0 0 1 5.6 0v2.4a2.8 2.8 0 0 1-5.6 0z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M5.6 5.2 4.3 3.9M10.4 5.2l1.3-1.3M5 7.6H2.4M11 7.6h2.6M5.2 10.6 3.2 12M10.8 10.6 12.8 12" />
  </Svg>
)

/** Continue: run on until the next breakpoint. */
export const ContinueIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 3 10 8l-7 5z" fill="currentColor" stroke="none" />
    <path d="M12.6 3v10" strokeWidth="1.8" />
  </Svg>
)

/** Step: run the next line. */
export const StepIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3.2 10.6a4.8 4.8 0 0 1 9.4-1.4" />
    <path d="M12.9 5.6v3.6H9.4" />
    <circle cx="8" cy="12.4" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
)

export const StopIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" stroke="none" />
  </Svg>
)

export const FormatIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2.5 4h11M2.5 7.5h7M2.5 11h9" />
  </Svg>
)

export const TrashIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.4 4.5l.6 8.1h6l.6-8.1M6.8 7v3.2M9.2 7v3.2" />
  </Svg>
)

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Svg>
)

export const CloseIcon = (props: IconProps) => (
  <Svg {...props} size={props.size ?? 12}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
)

export const ChevronIcon = (props: IconProps) => (
  <Svg {...props} size={props.size ?? 11}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Svg>
)
