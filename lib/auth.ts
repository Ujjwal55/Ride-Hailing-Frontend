import { apiFetch } from './api';
import { User } from './store';

const REFRESH_KEY = 'rh_refresh_token';

export function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function storeRefreshToken(token: string) {
  localStorage.setItem(REFRESH_KEY, token);
}

export function clearRefreshToken() {
  localStorage.removeItem(REFRESH_KEY);
}

export function parseJwtPayload(token: string): { sub: string; role: string; tenantId: string } | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

export async function refreshTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const raw = getStoredRefreshToken();
  if (!raw) return null;
  try {
    const data = await apiFetch<{ accessToken: string; refreshToken: string }>('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: raw }),
    });
    storeRefreshToken(data.refreshToken);
    return data;
  } catch {
    clearRefreshToken();
    return null;
  }
}

export async function apiLogin(email: string, password: string) {
  const data = await apiFetch<{ user: User; accessToken: string; refreshToken: string }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  storeRefreshToken(data.refreshToken);
  return data;
}

export async function apiRegister(payload: { email: string; password: string; role: string; name?: string; phone?: string; vehicleTier?: string }) {
  const data = await apiFetch<{ user: User; accessToken: string; refreshToken: string }>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  storeRefreshToken(data.refreshToken);
  return data;
}

export async function apiLogout(accessToken: string, refreshToken: string | null) {
  await apiFetch('/v1/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => {});
  clearRefreshToken();
}
