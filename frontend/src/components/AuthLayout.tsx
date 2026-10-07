import type { ReactNode } from 'react';
import { BrandPanel } from './BrandPanel';

interface AuthLayoutProps {
  title: string;
  text: string;
  children: ReactNode;
}

/** The KYC two-column layout: brand panel left, white form card right. */
export function AuthLayout({ title, text, children }: AuthLayoutProps) {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 sm:px-6 lg:py-10">
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-stretch">
        <BrandPanel title={title} text={text} />
        <main className="rounded-brand bg-white p-5 shadow-card sm:p-9">{children}</main>
      </div>
    </div>
  );
}
