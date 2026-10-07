import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-brand bg-white p-5 shadow-card sm:p-7 ${className}`}>{children}</section>;
}
