const SHARED_AUTH_COOKIE_NAME = 'janso_authenticated';
const SHARED_AUTH_PROFILE_COOKIE_NAME = 'janso_profile';
const SHARED_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SharedAuthProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  activeChannelTitle: string | null;
  totalChannels: number;
};

export type SharedAuthState = {
  isAuthenticated: boolean;
  profile: SharedAuthProfile | null;
};

function getRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 1 || parts[parts.length - 1] === 'localhost') {
    return '';
  }

  return parts.slice(-2).join('.');
}

function setCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : '';
  const rootDomain = getRootDomain(window.location.hostname);
  const domainFlag = rootDomain ? `; Domain=.${rootDomain}` : '';
  document.cookie = `${name}=${value}; Max-Age=${maxAge}; Path=/${domainFlag}; SameSite=Lax${secureFlag}`;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));

  return match ? match.slice(name.length + 1) : null;
}

function encodeProfile(profile: SharedAuthProfile): string {
  return encodeURIComponent(JSON.stringify(profile));
}

function decodeProfile(rawValue: string | null): SharedAuthProfile | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<SharedAuthProfile>;
    return {
      displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim() ? parsed.displayName.trim() : null,
      avatarUrl: typeof parsed.avatarUrl === 'string' && parsed.avatarUrl.trim() ? parsed.avatarUrl.trim() : null,
      activeChannelTitle:
        typeof parsed.activeChannelTitle === 'string' && parsed.activeChannelTitle.trim()
          ? parsed.activeChannelTitle.trim()
          : null,
      totalChannels: Number.isFinite(parsed.totalChannels) ? Math.max(0, Number(parsed.totalChannels)) : 0,
    };
  } catch {
    return null;
  }
}

export function setSharedAuthState(state: SharedAuthState) {
  const maxAge = state.isAuthenticated ? SHARED_AUTH_COOKIE_MAX_AGE_SECONDS : 0;
  setCookie(SHARED_AUTH_COOKIE_NAME, state.isAuthenticated ? '1' : '0', maxAge);

  if (state.isAuthenticated && state.profile) {
    setCookie(SHARED_AUTH_PROFILE_COOKIE_NAME, encodeProfile(state.profile), maxAge);
    return;
  }

  setCookie(SHARED_AUTH_PROFILE_COOKIE_NAME, '', 0);
}

export function readSharedAuthState(): SharedAuthState {
  const isAuthenticated = readCookie(SHARED_AUTH_COOKIE_NAME) === '1';
  const profile = decodeProfile(readCookie(SHARED_AUTH_PROFILE_COOKIE_NAME));

  return {
    isAuthenticated,
    profile: isAuthenticated ? profile : null,
  };
}
