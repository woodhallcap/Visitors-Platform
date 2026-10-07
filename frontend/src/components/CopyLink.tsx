import { useRef, useState } from 'react';
import { Button } from './Button';
import { inputClass } from './Field';

export function CopyLink({ url }: { url: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access (insecure context or permission denied): select it for a manual copy.
      inputRef.current?.select();
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input ref={inputRef} readOnly value={url} aria-label="Set-password link" onFocus={(e) => e.currentTarget.select()} className={inputClass(false)} />
      <Button onClick={copy} className="shrink-0">
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}
