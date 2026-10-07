export class ApiError extends Error {
  status: number;
  code: string;
  fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

let csrfToken: string | null = null;
const unauthenticatedListeners = new Set<() => void>();

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Called when the server says the session is gone (expired, signed out elsewhere, or account disabled). */
export function onUnauthenticated(fn: () => void): () => void {
  unauthenticatedListeners.add(fn);
  return () => {
    unauthenticatedListeners.delete(fn);
  };
}

export async function api<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', "Couldn't reach the server. Check your connection and try again.");
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    const apiError = new ApiError(res.status, error?.code ?? 'server_error', error?.message ?? FALLBACK_MESSAGE, error?.fields ?? {});
    if (apiError.code === 'unauthenticated') unauthenticatedListeners.forEach((fn) => fn());
    throw apiError;
  }
  return data as T;
}

export function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : FALLBACK_MESSAGE;
}
