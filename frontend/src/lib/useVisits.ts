import { useCallback, useEffect, useState } from 'react';
import type { Visit } from '../types';
import { api, messageOf } from './api';

/** Loads /visits{query}; refreshes every refreshMs when given. Mutators keep the list in step with actions. */
export function useVisits(query: string | null, refreshMs?: number) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (query === null) return;
    try {
      const r = await api<{ visits: Visit[] }>('GET', `/visits${query}`);
      setVisits(r.visits);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [query]);

  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const timer = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(timer);
  }, [reload, refreshMs]);

  const replace = useCallback((v: Visit) => setVisits((list) => (list ?? []).map((x) => (x.id === v.id ? v : x))), []);
  const upsert = useCallback(
    (v: Visit) => setVisits((list) => ((list ?? []).some((x) => x.id === v.id) ? (list ?? []).map((x) => (x.id === v.id ? v : x)) : [...(list ?? []), v])),
    [],
  );
  const remove = useCallback((id: number) => setVisits((list) => (list ?? []).filter((x) => x.id !== id)), []);

  return { visits, error, reload, replace, upsert, remove };
}
