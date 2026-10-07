import type { ReactNode } from 'react';

export function inputClass(hasError: boolean): string {
  return (
    'w-full rounded-xl border bg-white px-3.5 py-2.5 font-body text-[15px] transition disabled:bg-cream disabled:text-ink/60 ' +
    (hasError ? 'border-error' : 'border-[#d9d0c6] hover:border-primary/50')
  );
}

interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="mb-5">
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block font-semibold">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 mb-0 text-[13px] text-ink/60">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 mb-0 text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
