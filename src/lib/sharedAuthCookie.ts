const SHARED_AUTH_COOKIE_NAME = 'janso_authenticated';
const SHARED_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 1 || parts[parts.length - 1] === 'localhost') {
    return '';
  }

  return parts.slice(-2).join('.');
}

export function setSharedAuthCookie(isAuthenticated: boolean) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  const rootDomain = getRootDomain(window.location.hostname);
  const domainFlag = rootDomain ? `; Domain=.${rootDomain}` : '';
  const maxAge = isAuthenticated ? SHARED_AUTH_COOKIE_MAX_AGE_SECONDS : 0;
  const value = isAuthenticated ? '1' : '0';

  document.cookie = `${SHARED_AUTH_COOKIE_NAME}=${value}; Max-Age=${maxAge}; Path=/${domainFlag}; SameSite=Lax${secureFlag}`;
}

export function readSharedAuthCookie(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${SHARED_AUTH_COOKIE_NAME}=`));

  return match?.split('=')[1] === '1';
}
