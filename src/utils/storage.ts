import {
  LikedSongsCustomization,
  ListeningStatsState,
  PlaylistItem,
  ShowProgressEntry,
  SocialUser,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';

const APP_STATE_PREFIX = 'klyn_v4_';
const SAVED_PROFILES_KEY = 'klyn_saved_accounts_v4';
const DEVICE_IDENTITY_KEY = 'klyn_device_identity_v1';

let activeScopeUid: string | null = null;

function sanitizeScope(uid: string | null): string {
  const clean = (uid ?? '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean || 'guest';
}

function getScopedStateKey(uid: string | null = activeScopeUid): string {
  return `${APP_STATE_PREFIX}${sanitizeScope(uid)}_state`;
}

export function setActiveStorageUserScope(uid: string | null): void {
  activeScopeUid = uid && uid.trim() ? uid.trim() : null;
}

export function getActiveStorageUserScope(): string | null {
  return activeScopeUid;
}

export interface LocalDeviceIdentity {
  deviceId: string;
  name: string;
  platform: string;
}

export function getOrCreateLocalDeviceIdentity(): LocalDeviceIdentity {
  const fallbackName = (() => {
    if (typeof navigator === 'undefined') return 'Web Browser';
    const ua = navigator.userAgent || '';
    const browser = ua.includes('Edg/')
      ? 'Edge'
      : ua.includes('Chrome/') && !ua.includes('Edg/')
        ? 'Chrome'
        : ua.includes('Firefox/')
          ? 'Firefox'
          : ua.includes('Safari/') && !ua.includes('Chrome/')
            ? 'Safari'
            : 'Browser';
    const os = /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Web';
    return `${browser} on ${os}`;
  })();

  const platform =
    typeof navigator !== 'undefined'
      ? /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? 'iOS'
        : /Android/i.test(navigator.userAgent)
          ? 'Android'
          : 'Desktop'
      : 'Web';

  if (typeof window === 'undefined') {
    return { deviceId: 'web-session', name: fallbackName, platform };
  }

  try {
    const raw = window.localStorage.getItem(DEVICE_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalDeviceIdentity>;
      if (parsed.deviceId && parsed.name) {
        return {
          deviceId: parsed.deviceId,
          name: parsed.name,
          platform: parsed.platform || platform,
        };
      }
    }
    const deviceId = `klyn_dev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    const identity: LocalDeviceIdentity = { deviceId, name: fallbackName, platform };
    window.localStorage.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  } catch {
    return { deviceId: 'web-session', name: fallbackName, platform };
  }
}

export interface CentralizedAppState {
  user: UserAccount | null;
  likedTrackIds: string[];
  playlists: PlaylistItem[];
  likedSongsCustomization: LikedSongsCustomization;
  followedArtistIds: string[];
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  listeningStats: ListeningStatsState;
  settings: UserPreferences;
  activeDeviceId: string;
  socialUsers: SocialUser[];
  discoveredTracks: Track[];
  recentSearches?: string[];
  showProgress?: Record<string, ShowProgressEntry>;
}

export const EMPTY_LISTENING_STATS: ListeningStatsState = {
  dailyMinutes: [0, 0, 0, 0, 0, 0, 0],
  dailyMinutesByDate: {},
  activeDates: [],
  playEvents: [],
  artistPlayCounts: {},
  trackPlayCounts: {},
  recentTrackIds: [],
  recentLog: [],
  streakDays: 0,
};

export const DEFAULT_LIKED_SONGS_CUSTOMIZATION: LikedSongsCustomization = {
  title: 'Liked Songs',
  description: 'Your saved favorites',
  pinned: true,
  accentGradient:
    'linear-gradient(135deg, rgba(244,63,94,0.75) 0%, rgba(168,85,247,0.65) 52%, rgba(67,56,202,0.8) 100%)',
  displayMode: 'comfortable',
  showQualityBadges: true,
};

const LEGACY_MOCK_TRACK_IDS = new Set([
  'obsidian-echoes',
  'velvet-horizon',
  'rain-on-shibuya',
  'solar-caustics',
  'nordic-static',
  'crimson-nocturne',
  'afterhours-dub',
  'monolith-spatial',
]);

function isLegacyFakeCover(url?: string): boolean {
  return Boolean(url && url.includes('/src/assets/images/cover_'));
}

function sanitizeLoadedState(raw: CentralizedAppState): CentralizedAppState {
  const realQueue = (raw.queue ?? []).filter(
    (t) => t && !LEGACY_MOCK_TRACK_IDS.has(t.id) && !isLegacyFakeCover(t.coverUrl),
  );
  const realDiscovered = (raw.discoveredTracks ?? []).filter(
    (t) => t && !LEGACY_MOCK_TRACK_IDS.has(t.id) && !isLegacyFakeCover(t.coverUrl),
  );
  const realCurrentTrack =
    raw.currentTrack &&
    !LEGACY_MOCK_TRACK_IDS.has(raw.currentTrack.id) &&
    !isLegacyFakeCover(raw.currentTrack.coverUrl)
      ? raw.currentTrack
      : null;

  const realLikedIds = (raw.likedTrackIds ?? []).filter((id) => !LEGACY_MOCK_TRACK_IDS.has(id));
  const realPlaylists = (raw.playlists ?? []).map((pl) => ({
    ...pl,
    trackIds: (pl.trackIds ?? []).filter((id) => !LEGACY_MOCK_TRACK_IDS.has(id)),
    coverUrl: isLegacyFakeCover(pl.coverUrl) ? '' : pl.coverUrl,
  }));

  return {
    ...raw,
    activeDeviceId:
      !raw.activeDeviceId || raw.activeDeviceId === 'web-studio'
        ? 'system-default'
        : raw.activeDeviceId,
    likedTrackIds: realLikedIds,
    playlists: realPlaylists,
    followedArtistIds: raw.followedArtistIds ?? [],
    queue: realQueue,
    discoveredTracks: realDiscovered,
    currentTrack: realCurrentTrack,
    currentTime: realCurrentTrack ? raw.currentTime ?? 0 : 0,
    listeningStats: raw.listeningStats ?? { ...EMPTY_LISTENING_STATS },
    socialUsers: raw.socialUsers ?? [],
    recentSearches: Array.isArray(raw.recentSearches) ? raw.recentSearches.slice(0, 30) : [],
    showProgress: raw.showProgress ?? {},
  };
}

export function loadCentralizedAppState(uid: string | null = activeScopeUid): CentralizedAppState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getScopedStateKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CentralizedAppState;
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizeLoadedState(parsed);
  } catch {
    return null;
  }
}

export function saveCentralizedAppState(
  state: CentralizedAppState,
  uid: string | null = state.user?.uid ?? activeScopeUid,
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getScopedStateKey(uid);
    window.localStorage.setItem(key, JSON.stringify(state));
    if (state.user) {
      const saved = loadSavedAccounts().filter(
        (a) => a.email.toLowerCase() !== state.user!.email.toLowerCase(),
      );
      window.localStorage.setItem(
        SAVED_PROFILES_KEY,
        JSON.stringify([state.user, ...saved].slice(0, 12)),
      );
    }
  } catch {
    // ignore storage quota errors
  }
}

export function clearActiveUserSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getScopedStateKey(activeScopeUid);
    const existing = loadCentralizedAppState(activeScopeUid);
    if (existing) {
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...existing, user: null, isPlaying: false }),
      );
    }
    const guestKey = getScopedStateKey(null);
    window.localStorage.removeItem(guestKey);
    activeScopeUid = null;
  } catch {
    activeScopeUid = null;
  }
}

export function clearCurrentUserRuntimeCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const scopedPrefix = `${APP_STATE_PREFIX}${sanitizeScope(activeScopeUid)}_`;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith(scopedPrefix) || k.startsWith('klyn_user_cache_'))) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export function loadSavedAccounts(): UserAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UserAccount[]) : [];
  } catch {
    return [];
  }
}
