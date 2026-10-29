import Link from "next/link";

/** The Taskforge wordmark: three stacked bars, like cards in a column. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md font-heading text-lg font-semibold tracking-tight">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5 text-primary">
        <rect x="2" y="2" width="16" height="4" rx="1.5" fill="currentColor" />
        <rect x="2" y="8" width="11" height="4" rx="1.5" fill="currentColor" opacity="0.7" />
        <rect x="2" y="14" width="7" height="4" rx="1.5" fill="currentColor" opacity="0.45" />
      </svg>
      Taskforge
    </Link>
  );
}
