interface IconProps {
  className?: string;
}

export function ArrowUpRightIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

export function CheckIcon({ className = '' }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12.5 10 17 19 7.5" />
    </svg>
  );
}
