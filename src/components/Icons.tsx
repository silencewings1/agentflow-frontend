import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const Icon = {
  /* 品牌标志：两道逐层收窄的门禁 + 一个通过标记。
     语义即产品内核 —— AI 的产出必须穿过验证关卡才算落地。 */
  Logo: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} strokeWidth={1.8} {...r}>
      <path d="M3.5 5.5h17" />
      <path d="M6.5 11h11" />
      <path d="M8 16.5l3 3 5.5-6" />
    </svg>
  ),
  Plus: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Search: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l4.5 4.5" />
    </svg>
  ),
  Branch: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="7" cy="5.5" r="2.2" />
      <circle cx="7" cy="18.5" r="2.2" />
      <circle cx="17.5" cy="8.5" r="2.2" />
      <path d="M7 7.7v8.6M9.2 6.2h3.9a4.4 4.4 0 0 1 4.4 4.4" />
    </svg>
  ),
  Merge: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="7" cy="6" r="2.2" />
      <circle cx="7" cy="18" r="2.2" />
      <circle cx="17" cy="12" r="2.2" />
      <path d="M7 8.2v7.6M9.2 18h2.6a3 3 0 0 0 3-3v-1" />
    </svg>
  ),
  Folder: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.2h7A1.5 1.5 0 0 1 19 9.7v7.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5Z" />
    </svg>
  ),
  File: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5Z" />
      <path d="M13.5 3.5v5h5" />
    </svg>
  ),
  Chevron: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  Terminal: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 9.5l2.6 2.5L7 14.5M12.5 15h4" />
    </svg>
  ),
  Sparkle: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M12 3.5l1.7 4.9 4.8 1.7-4.8 1.7L12 16.7l-1.7-4.9L5.5 10l4.8-1.7Z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" />
    </svg>
  ),
  Cpu: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <path d="M10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" />
    </svg>
  ),
  Shield: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M12 3.5l7 2.4v5.4c0 4.2-2.8 7.4-7 9.2-4.2-1.8-7-5-7-9.2V5.9Z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </svg>
  ),
  Clock: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.6V12l3 1.9" />
    </svg>
  ),
  Sun: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </svg>
  ),
  Moon: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M20 14.6A8.4 8.4 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6Z" />
    </svg>
  ),
  Panel: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M15 4.5v15" />
    </svg>
  ),
  Book: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5Z" />
    </svg>
  ),
  Arrow: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />
    </svg>
  ),
  Check: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M4.5 12.5l4.8 4.8L19.5 7" />
    </svg>
  ),
  X: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Dot: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r} fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  Copy: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15" />
    </svg>
  ),
  Paperclip: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M19 11.5l-7.4 7.4a4.2 4.2 0 0 1-6-6l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.8 1.8 0 0 1-2.6-2.6l7.2-7.2" />
    </svg>
  ),
  Globe: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.8 12h16.4M12 3.8c2.2 2.3 3.3 5 3.3 8.2S14.2 18 12 20.2c-2.2-2.3-3.3-5-3.3-8.2S9.8 6.1 12 3.8Z" />
    </svg>
  ),
  Pencil: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M16.5 4.6l2.9 2.9L8.8 18.1l-4 1.1 1.1-4Z" />
      <path d="M14.4 6.7l2.9 2.9" />
    </svg>
  ),
  Stop: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <rect x="7" y="7" width="10" height="10" rx="1.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  Layers: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M12 3.5l8 4.3-8 4.3-8-4.3Z" />
      <path d="M4 12.2l8 4.3 8-4.3M4 16.4l8 4.3 8-4.3" />
    </svg>
  ),
  Beaker: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M9 3.5h6M10 3.5v6l-4.2 7.2A2 2 0 0 0 7.5 20h9a2 2 0 0 0 1.7-3.3L14 9.5v-6" />
      <path d="M7.6 15h8.8" />
    </svg>
  ),
  Command: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5H9m0 0h6m-6 0v6m6-6h2.5A2.5 2.5 0 1 0 15 6.5V9m0 6v2.5A2.5 2.5 0 1 0 17.5 15H15m0 0H9m0 0v2.5A2.5 2.5 0 1 1 6.5 15H9" />
    </svg>
  ),
  Agent: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <rect x="4.5" y="7.5" width="15" height="11" rx="3" />
      <path d="M12 3.2v4.3M9 12.2v1.4M15 12.2v1.4M9.6 16.4h4.8" />
    </svg>
  ),
  Plug: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M9 3.5v5M15 3.5v5" />
      <path d="M6.5 8.5h11v2.6a5.5 5.5 0 0 1-11 0Z" />
      <path d="M12 16.6v3.9" />
    </svg>
  ),
  Cloud: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M7.5 18.5h9.2a3.8 3.8 0 0 0 .5-7.6 5.3 5.3 0 0 0-10.2-1 3.9 3.9 0 0 0 .5 8.6Z" />
    </svg>
  ),
  Cube: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M12 3.4l7.4 4.1v8.8L12 20.6l-7.4-4.3V7.5Z" />
      <path d="M4.6 7.5L12 11.8l7.4-4.3M12 11.8v8.8" />
    </svg>
  ),
  Nodes: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="12" cy="5.5" r="2.3" />
      <circle cx="5.5" cy="18" r="2.3" />
      <circle cx="18.5" cy="18" r="2.3" />
      <path d="M10.4 7.3L6.9 15.8M13.6 7.3l3.5 8.5M7.8 18h8.4" />
    </svg>
  ),
  Key: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <circle cx="8.5" cy="14.5" r="3.6" />
      <path d="M11.2 12L19 4.5M16.2 7.3l2 2M14 9.5l2 2" />
    </svg>
  ),
  Trash: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7" />
    </svg>
  ),
  Sliders: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M4.5 8h15M4.5 16h15" />
      <circle cx="9.5" cy="8" r="2.1" />
      <circle cx="15" cy="16" r="2.1" />
    </svg>
  ),
  Bolt: ({ size = 16, ...r }: P) => (
    <svg {...base(size)} {...r}>
      <path d="M13.2 3.5L6.5 13.4h4.6l-.9 7.1 7.3-10.2h-4.7Z" />
    </svg>
  ),
};

export type IconName = keyof typeof Icon;

export const iconByKey: Record<string, IconName> = {
  plus: "Plus",
  branch: "Branch",
  merge: "Merge",
  clock: "Clock",
  cpu: "Cpu",
  shield: "Shield",
  terminal: "Terminal",
  book: "Book",
  sun: "Sun",
  panel: "Panel",
  read: "File",
  search: "Search",
  edit: "Pencil",
  shell: "Terminal",
  web: "Globe",
};
