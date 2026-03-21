export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function getUser(): User | null {
  const data = localStorage.getItem('auth_user');
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: User): void {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function getLoginUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback');
  return `${apiUrl}/auth/google?redirect_uri=${redirectUri}`;
}
