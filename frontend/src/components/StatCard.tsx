export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-2xl bg-white p-5 shadow-card">
      <p className="mb-2 text-sm text-ink/60">{label}</p>
      <p className="mb-0 font-heading text-[2rem] leading-none text-primary">{value}</p>
      {hint && <p className="mt-2 mb-0 text-xs text-ink/50">{hint}</p>}
    </div>
  );
}
