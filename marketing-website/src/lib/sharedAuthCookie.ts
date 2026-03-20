const SHARED_AUTH_COOKIE_NAME = "janso_authenticated";
const SHARED_AUTH_PROFILE_COOKIE_NAME = "janso_profile";

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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return match ? match.slice(name.length + 1) : null;
}

function decodeProfile(rawValue: string | null): SharedAuthProfile | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(rawValue)) as Partial<SharedAuthProfile>;
    return {
      displayName: typeof parsed.displayName === "string" && parsed.displayName.trim() ? parsed.displayName.trim() : null,
      avatarUrl: typeof parsed.avatarUrl === "string" && parsed.avatarUrl.trim() ? parsed.avatarUrl.trim() : null,
      activeChannelTitle:
        typeof parsed.activeChannelTitle === "string" && parsed.activeChannelTitle.trim()
          ? parsed.activeChannelTitle.trim()
          : null,
      totalChannels: Number.isFinite(parsed.totalChannels) ? Math.max(0, Number(parsed.totalChannels)) : 0,
    };
  } catch {
    return null;
  }
}

export function readSharedAuthState(): SharedAuthState {
  const isAuthenticated = readCookie(SHARED_AUTH_COOKIE_NAME) === "1";
  const profile = decodeProfile(readCookie(SHARED_AUTH_PROFILE_COOKIE_NAME));

  return {
    isAuthenticated,
    profile: isAuthenticated ? profile : null,
  };
}
