import type { ButtonHTMLAttributes } from 'react';
import { ArrowUpRightIcon } from './icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  /** Primary only: a separate arrow circle beside the label, as on the Woodhall site. */
  arrow?: boolean;
}

export function Button({ variant = 'primary', arrow = false, className = '', children, ...rest }: ButtonProps) {
  if (variant === 'primary' && arrow) {
    return (
      <button
        type="button"
        className={`group inline-flex cursor-pointer items-center gap-1.5 font-body disabled:cursor-not-allowed ${className}`}
        {...rest}
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-[15px] font-semibold text-white transition group-hover:bg-primary-dark group-disabled:opacity-70">
          {children}
        </span>
        <span className="grid size-[46px] shrink-0 place-items-center rounded-full bg-primary text-white transition group-hover:bg-primary-dark group-disabled:opacity-70">
          <ArrowUpRightIcon className="size-[18px]" />
        </span>
      </button>
    );
  }
  const base =
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-7 py-3 font-body text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-70';
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-dark disabled:hover:bg-primary'
      : 'border border-primary bg-transparent text-primary hover:bg-primary/5';
  return (
    <button type="button" className={`${base} ${styles} ${className}`} {...rest}>
      {children}
    </button>
  );
}
