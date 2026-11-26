/** Icônes SVG légères (trait 1.8, couleur courante). */
import type { ReactNode, SVGProps } from 'react';

function Icon(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const MapIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </Icon>
);
export const ToolsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="m14 7 3-3 3 3-3 3" />
    <path d="M17 4 8.5 12.5" />
    <path d="M4 20l6-6M6 14l4 4" />
  </Icon>
);
export const AgoraIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M3 9 12 4l9 5" />
    <path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18" />
  </Icon>
);
export const CoinsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <ellipse cx="9" cy="7" rx="5" ry="2.5" />
    <path d="M4 7v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" />
    <path d="M10 17.4c.6.1 1.3.1 2 .1 2.8 0 5-1.1 5-2.5V10" />
    <path d="M17 10c2.8 0 3-1.1 3-2.5" />
  </Icon>
);
export const NewsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
    <path d="M17 9h3v8a2 2 0 0 1-2 2" />
    <path d="M7 9h7M7 12h7M7 15h4" />
  </Icon>
);
export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Icon>
);
export const SwordsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M14 4h6v6L9 21l-3-3L17 7" />
    <path d="M4 4h6v6" />
    <path d="M4 4l7 7" />
  </Icon>
);
export const BoltIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Icon>
);
export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </Icon>
);
export const InstallIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3" />
  </Icon>
);
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
