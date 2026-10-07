import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="mb-1">{title}</h1>
        {description && <p className="mb-0 text-ink/70">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
