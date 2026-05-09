const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(tokenFn: () => string | null, unauthorized: () => void) {
  getToken = tokenFn;
  onUnauthorized = unauthorized;
}

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Auto-add idempotency key for mutating requests (if not already set)
  const method = (options.method ?? 'GET').toUpperCase();
  if (IDEMPOTENT_METHODS.has(method) && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = crypto.randomUUID();
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    onUnauthorized();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
