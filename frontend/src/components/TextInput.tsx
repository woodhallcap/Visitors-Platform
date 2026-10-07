import type { InputHTMLAttributes } from 'react';
import { Field, inputClass } from './Field';

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}

export function TextInput({ label, name, error, hint, id, ...rest }: TextInputProps) {
  const inputId = id ?? name;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint}>
      <input id={inputId} name={name} className={inputClass(!!error)} aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}
