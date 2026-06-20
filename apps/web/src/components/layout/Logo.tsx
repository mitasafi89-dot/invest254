import Link from 'next/link';

const BLUE = '#2f6bff';

/** PrintPesa brand lockup — P mark + two-tone wordmark, theme-aware via currentColor. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="PrintPesa home"
      className={`flex items-center gap-2 text-fg ${className}`}
    >
      <svg
        viewBox="0 0 44 48"
        className="h-7 w-7 shrink-0"
        role="img"
        aria-hidden
        fill="none"
      >
        {/* Navy "P" letterform (inherits text colour; counter cut with evenodd). */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 4a2 2 0 0 0-2 2v36a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V32h9a14 14 0 0 0 0-28H10Zm8 8v12h7a6 6 0 0 0 0-12h-7Z"
          fill="currentColor"
        />
        {/* Blue folded-page accent over the lower stem. */}
        <path
          d="M5.6 23.2l8.8-3.1a1.8 1.8 0 0 1 2.4 1.7v14.4a1.8 1.8 0 0 1-1.2 1.7l-8.8 3.1A1.8 1.8 0 0 1 4.4 39.3V24.9a1.8 1.8 0 0 1 1.2-1.7Z"
          fill={BLUE}
        />
      </svg>
      <span className="text-lg font-extrabold tracking-tight leading-none">
        <span>Print</span>
        <span style={{ color: BLUE }}>Pesa</span>
      </span>
    </Link>
  );
}
