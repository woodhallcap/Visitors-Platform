import type { ReactNode } from 'react';

const TONES = {
  error: 'border-error/30 bg-error/5 text-error',
  success: 'border-primary/25 bg-primary/5 text-primary',
  info: 'border-accent bg-cream text-ink',
};

interface BannerProps {
  tone: keyof typeof TONES;
  children: ReactNode;
  onDismiss?: () => void;
}

export function Banner({ tone, children, onDismiss }: BannerProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-5 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${TONES[tone]}`}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="cursor-pointer bg-transparent text-lg leading-none">
          ×
        </button>
      )}
    </div>
  );
}
