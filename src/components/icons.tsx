import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const IconGrip = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>);
export const IconIndent = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 4h18M11 12h10M3 20h18M3 9l4 3-4 3" /></svg>);
export const IconOutdent = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 4h18M11 12h10M3 20h18M7 9l-4 3 4 3" /></svg>);
export const IconUp = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 19V5M5 12l7-7 7 7" /></svg>);
export const IconDown = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12l7 7 7-7" /></svg>);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>);
export const IconUpload = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 21V9M7 14l5-5 5 5M4 3h16" /></svg>);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="1" /><path d="M5 15V4a1 1 0 0 1 1-1h11" /></svg>);
export const IconEdit = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>);
export const IconReset = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>);
export const IconBack = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 18l-6-6 6-6" /></svg>);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>);
export const IconUndo = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>);
export const IconRedo = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>);
export const IconPresent = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20h8M12 16v4M10 8l4 2-4 2z" /></svg>);
export const IconHelp = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" /></svg>);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>);
export const IconLink = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const IconPrev = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>);
export const IconNext = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconExpand = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>);
export const IconSparkle = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></svg>);
export const IconSend = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconStop = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>);
export const IconWand = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 20L15 9M13 7l2-2 4 4-2 2M17 3v2M21 7h-2M8 3l.5 1.5L10 5l-1.5.5L8 7l-.5-1.5L6 5l1.5-.5z" /></svg>);
