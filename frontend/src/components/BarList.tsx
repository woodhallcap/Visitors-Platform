interface BarListProps {
  title: string;
  /** A one-line takeaway under the title. */
  summary?: string;
  data: { label: string; value: number }[];
  empty: string;
}

/** Horizontal bars with the label above and the value at the tip; every value is visible, so no tooltip is needed. */
export function BarList({ title, summary, data, empty }: BarListProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <section className="rounded-brand bg-white p-5 shadow-card sm:p-6">
      <h2 className={`text-xl ${summary ? 'mb-1' : 'mb-4'}`}>{title}</h2>
      {summary && <p className="mb-4 text-sm text-ink/60">{summary}</p>}
      {data.length === 0 ? (
        <p className="mb-0 text-sm text-ink/60">{empty}</p>
      ) : (
        <ul aria-label={title} className="m-0 list-none space-y-3 p-0">
          {data.map((d) => (
            <li key={d.label}>
              <div className="mb-1 text-sm text-ink/80">{d.label}</div>
              <div className="flex items-center gap-2">
                <div className="h-3 rounded-r bg-chart" style={{ width: `${(d.value / max) * 85}%`, minWidth: d.value > 0 ? 2 : 0 }} />
                <span className="text-sm font-semibold text-ink">{d.value}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
