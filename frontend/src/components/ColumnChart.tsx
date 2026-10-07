import { useState } from 'react';

export interface ColumnDatum {
  label: string;
  value: number;
  tooltip: string;
}

interface ColumnChartProps {
  title: string;
  description?: string;
  data: ColumnDatum[];
  /** Show every Nth x-axis label (defaults to about 12 labels in total). */
  labelEvery?: number;
}

/** One series of vertical columns: ≤24px thick, 4px rounded tops, 2px gaps, hover/focus tooltip and a hidden table. */
export function ColumnChart({ title, description, data, labelEvery }: ColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 12));

  return (
    <figure aria-label={title} className="m-0 rounded-brand bg-white p-5 shadow-card sm:p-6">
      <figcaption className="mb-4">
        <span className="block font-heading text-xl text-primary">{title}</span>
        {description && <span className="block text-sm text-ink/60">{description}</span>}
      </figcaption>
      <div className="relative">
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className="flex h-44 flex-col justify-between text-right text-xs text-ink/50">
            <span>{max}</span>
            <span>0</span>
          </div>
          <div className="relative flex h-44 flex-1 items-end gap-[2px] border-b border-ink/15">
            {data.map((d, i) => (
              <div key={d.label} className="relative flex h-full flex-1 items-end justify-center">
                <div
                  role="img"
                  aria-label={d.tooltip}
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="w-full max-w-6 cursor-default rounded-t bg-chart outline-offset-2 transition-opacity hover:opacity-80"
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
                />
                {active === i && (
                  <div role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-card">
                    {d.tooltip}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="mt-1 ml-9 flex gap-[2px] text-[11px] text-ink/60">
          {data.map((d, i) => (
            <span key={d.label} className="flex-1 overflow-visible text-center whitespace-nowrap">
              {i % every === 0 ? <span data-testid="x-label">{d.label}</span> : ''}
            </span>
          ))}
        </div>
      </div>
      <table aria-label={title} className="sr-only">
        <thead>
          <tr>
            <th>Label</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
