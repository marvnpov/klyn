import {
  LikedSongsCustomization,
  ListeningStatsState,
  PlaylistItem,
  SocialUser,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';

const APP_STATE_KEY = 'klyn_app_state_v1';
const SAVED_PROFILES_KEY = 'klyn_saved_accounts_v1';

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

const LEGACY_MOCK_PLAYLIST_IDS = new Set([
  'pl-midnight',
  'pl-drive',
  'pl-focus',
  'pl-silk',
]);

const LEGACY_MOCK_ARTISTS = new Set([
  'Kaelen Vance',
  'Sora & The Nocturnes',
  'Sora & The Waves',
  'Ren Takahashi',
  'Elara & Mylo',
  'Hafdis Lind',
  'Valerie Noir',
]);

const LEGACY_MOCK_SOCIAL_IDS = new Set([
  'user-aria',
  'user-julian',
  'user-nina',
  'user-kenji',
  'user-claire',
]);

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
  const realPlaylists = (raw.playlists ?? [])
    .filter((pl) => !LEGACY_MOCK_PLAYLIST_IDS.has(pl.id))
    .map((pl) => ({
      ...pl,
      trackIds: pl.trackIds.filter((id) => !LEGACY_MOCK_TRACK_IDS.has(id)),
      coverUrl: isLegacyFakeCover(pl.coverUrl) ? '' : pl.coverUrl,
    }));

  const realFollowed = (raw.followedArtistIds ?? []).filter(
    (name) => !LEGACY_MOCK_ARTISTS.has(name),
  );

  const realSocialUsers = (raw.socialUsers ?? []).filter(
    (u) => !LEGACY_MOCK_SOCIAL_IDS.has(u.id),
  );

  const rawStats = raw.listeningStats;
  const cleanTrackCounts: Record<string, number> = {};
  Object.entries(rawStats?.trackPlayCounts ?? {}).forEach(([id, count]) => {
    if (!LEGACY_MOCK_TRACK_IDS.has(id) && typeof count === 'number' && count > 0) {
      cleanTrackCounts[id] = count;
    }
  });

  const cleanArtistCounts: Record<string, number> = {};
  Object.entries(rawStats?.artistPlayCounts ?? {}).forEach(([artist, count]) => {
    if (!LEGACY_MOCK_ARTISTS.has(artist) && typeof count === 'number' && count > 0) {
      cleanArtistCounts[artist] = count;
    }
  });

  const cleanRecentLog = (rawStats?.recentLog ?? []).filter(
    (entry) => entry && !LEGACY_MOCK_TRACK_IDS.has(entry.trackId),
  );

  const cleanPlayEvents = (rawStats?.playEvents ?? []).filter(
    (ev) => ev && !LEGACY_MOCK_TRACK_IDS.has(ev.trackId) && !LEGACY_MOCK_ARTISTS.has(ev.artist),
  );

  const hasAnyRealActivity =
    cleanRecentLog.length > 0 ||
    Object.keys(cleanTrackCounts).length > 0 ||
    (rawStats?.activeDates?.length ?? 0) > 0;

  const sanitizedStats: ListeningStatsState = hasAnyRealActivity
    ? {
        dailyMinutes:
          Array.isArray(rawStats?.dailyMinutes) && rawStats.dailyMinutes.length === 7
            ? rawStats.dailyMinutes
            : [0, 0, 0, 0, 0, 0, 0],
        dailyMinutesByDate: rawStats?.dailyMinutesByDate ?? {},
        activeDates: Array.isArray(rawStats?.activeDates) ? rawStats.activeDates : [],
        playEvents: cleanPlayEvents,
        artistPlayCounts: cleanArtistCounts,
        trackPlayCounts: cleanTrackCounts,
        recentTrackIds: cleanRecentLog.map((e) => e.trackId),
        recentLog: cleanRecentLog,
        streakDays: typeof rawStats?.streakDays === 'number' ? rawStats.streakDays : 0,
      }
    : { ...EMPTY_LISTENING_STATS };

  return {
    ...raw,
    activeDeviceId:
      !raw.activeDeviceId || raw.activeDeviceId === 'web-studio'
        ? 'system-default'
        : raw.activeDeviceId,
    likedTrackIds: realLikedIds,
    playlists: realPlaylists,
    followedArtistIds: realFollowed,
    queue: realQueue,
    discoveredTracks: realDiscovered,
    currentTrack: realCurrentTrack,
    currentTime: realCurrentTrack ? raw.currentTime ?? 0 : 0,
    listeningStats: sanitizedStats,
    socialUsers: realSocialUsers,
  };
}

export function loadCentralizedAppState(): CentralizedAppState | null {
  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CentralizedAppState;
    if (!parsed || typeof parsed !== 'object') return null;
    return sanitizeLoadedState(parsed);
  } catch {
    return null;
  }
}

export function saveCentralizedAppState(state: CentralizedAppState): void {
  try {
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
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
  try {
    const existing = loadCentralizedAppState();
    if (existing) {
      window.localStorage.setItem(
        APP_STATE_KEY,
        JSON.stringify({ ...existing, user: null, isPlaying: false }),
      );
    }
  } catch {
    // ignore
  }
}

export function loadSavedAccounts(): UserAccount[] {
  try {
    const raw = window.localStorage.getItem(SAVED_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UserAccount[]) : [];
  } catch {
    return [];
  }
}
