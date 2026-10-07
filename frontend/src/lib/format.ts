const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Server datetimes are already WAT ('YYYY-MM-DD HH:MM:SS'), so format them as-is, not via the browser's timezone. */
export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
}
