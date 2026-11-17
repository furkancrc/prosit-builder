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
