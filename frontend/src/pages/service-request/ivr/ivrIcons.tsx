/**
 * Line icons for the IVR inbox. Inline SVG so they stay crisp at any size and
 * take the text colour (currentColor) — emoji render differently on every OS
 * and blur at small sizes.
 */
import React from "react";

type IconProps = { size?: number; className?: string; title?: string };

const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({
  size = 16,
  className,
  title,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden={title ? undefined : true}
    role={title ? "img" : undefined}
  >
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

const HANDSET =
  "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z";

export const IconPhone: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d={HANDSET} />
  </Svg>
);

export const IconPhoneMissed: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M23 1l-6 6M17 1l6 6" />
    <path d={HANDSET} />
  </Svg>
);

export const IconPhoneIncoming: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M16 2v6h6M22 2l-6 6" />
    <path d={HANDSET} />
  </Svg>
);

export const IconPhoneOutgoing: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M22 8V2h-6M16 8l6-6" />
    <path d={HANDSET} />
  </Svg>
);

export const IconMic: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
  </Svg>
);

export const IconNote: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Svg>
);

export const IconTicket: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 7v2a3 3 0 1 1 0 6v2c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 1 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
    <path d="M13 5v2M13 17v2M13 11v2" />
  </Svg>
);

export const IconClock: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);

export const IconCalendar: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
);

export const IconAlert: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconCheck: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Svg>
);

export const IconChevronRight: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M9 18l6-6-6-6" />
  </Svg>
);
