import type { ReactNode } from 'react';

const TONES = {
  neutral: 'border-primary/25 text-primary',
  accent: 'border-accent bg-accent/40 text-primary',
  muted: 'border-ink/15 bg-cream text-ink/60',
  error: 'border-error/30 bg-error/5 text-error',
};

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[13px] font-medium whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}
