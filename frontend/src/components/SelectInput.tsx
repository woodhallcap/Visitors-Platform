import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Field, inputClass } from './Field';

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function SelectInput({ label, name, error, hint, id, children, ...rest }: SelectInputProps) {
  const selectId = id ?? name;
  return (
    <Field label={label} htmlFor={selectId} error={error} hint={hint}>
      <select id={selectId} name={name} className={inputClass(!!error)} aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
    </Field>
  );
}
