// A simple lotus-and-line ornament used as a section divider.
export function Motif({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 24"
      aria-hidden="true"
      className={`mx-auto h-5 w-48 text-gold-500 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M0 12h92M148 12h92" />
      <path d="M120 3c-5 4-7 7-7 9s3 6 7 9c4-3 7-6 7-9s-2-5-7-9z" />
      <path d="M113 12c-6-4-11-4-15-2 3 4 9 5 15 2zM127 12c6-4 11-4 15-2-3 4-9 5-15 2z" />
      <circle cx="96" cy="12" r="1.6" fill="currentColor" />
      <circle cx="144" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}
