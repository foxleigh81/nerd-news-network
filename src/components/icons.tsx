/* Inline, accessibility-friendly SVG icons. All are decorative by default
   (aria-hidden); the surrounding link/button supplies the accessible name. */

type IconProps = { className?: string; size?: number };

const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
  focusable: false as const,
});

export function IconX({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export function IconFacebook({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
    </svg>
  );
}

export function IconLinkedIn({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" />
    </svg>
  );
}

export function IconReddit({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-6.627-5.373-12-12-12Zm5.01 13.06a1.36 1.36 0 0 1-.013.182 4.07 4.07 0 0 1 .026.46c0 2.353-2.74 4.262-6.12 4.262-3.379 0-6.119-1.909-6.119-4.262 0-.158.01-.314.029-.468a1.36 1.36 0 1 1 1.51-2.187 6.01 6.01 0 0 1 3.28-1.038l.62-2.916a.272.272 0 0 1 .322-.21l2.05.436a.952.952 0 1 1-.114.49l-1.83-.39-.553 2.604a6 6 0 0 1 3.234 1.04 1.36 1.36 0 1 1 1.781 2.485Zm-6.87.78a.952.952 0 1 0 0-1.904.952.952 0 0 0 0 1.904Zm3.72 0a.952.952 0 1 0 0-1.904.952.952 0 0 0 0 1.904Zm.085 1.882a.272.272 0 0 0-.384.005 2.42 2.42 0 0 1-1.75.616 2.42 2.42 0 0 1-1.74-.616.272.272 0 1 0-.38.39 2.95 2.95 0 0 0 2.12.756 2.95 2.95 0 0 0 2.13-.756.272.272 0 0 0 .004-.385l-.01-.01Z" />
    </svg>
  );
}

export function IconRss({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <path d="M3.429 5.1v3.085c6.452 0 11.686 5.234 11.686 11.686H18.2C18.2 11.86 11.54 5.1 3.429 5.1Zm0 6.171v3.086a5.572 5.572 0 0 1 5.514 5.514h3.086c0-4.744-3.857-8.6-8.6-8.6ZM5.5 17.014a2.057 2.057 0 1 0 0 4.114 2.057 2.057 0 0 0 0-4.114Z" />
    </svg>
  );
}

export function IconEmail({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
      <path d="m3 6 9 6.5L21 6" />
    </svg>
  );
}

export function IconLink({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function IconCheck({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export function IconSun({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function IconMoon({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor">
      <path d="M21.64 13a9 9 0 1 1-9.64-12 7 7 0 0 0 9.64 12Z" />
    </svg>
  );
}

export function IconArrow({ className, size }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
