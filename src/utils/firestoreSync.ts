import {
  collection,
  deleteDoc,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  QuerySnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  db,
  isFirebaseConfigured,
  isFirestoreOfflineError,
  logFirestoreError,
  OperationType,
} from '../services/firebase';
import {
  LikedSongsCustomization,
  ListeningStatsState,
  PlaylistItem,
  SocialUser,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';
import { DEFAULT_LIKED_SONGS_CUSTOMIZATION, EMPTY_LISTENING_STATS } from './storage';

const USER_CACHE_KEY_PREFIX = 'klyn_user_cache_';

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || `item_${Date.now()}`;
}

function clampString(val: string | undefined, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' && val.trim().length > 0 ? val.trim() : fallback;
  return str.slice(0, maxLen);
}

function sanitizeStatsForFirestore(stats: ListeningStatsState): ListeningStatsState {
  return {
    dailyMinutes: (stats.dailyMinutes ?? [0, 0, 0, 0, 0, 0, 0]).slice(0, 7),
    dailyMinutesByDate: Object.fromEntries(
      Object.entries(stats.dailyMinutesByDate ?? {}).slice(-90),
    ),
    activeDates: (stats.activeDates ?? []).slice(-90),
    playEvents: (stats.playEvents ?? []).slice(0, 50),
    artistPlayCounts: Object.fromEntries(
      Object.entries(stats.artistPlayCounts ?? {}).slice(0, 120),
    ),
    trackPlayCounts: Object.fromEntries(
      Object.entries(stats.trackPlayCounts ?? {}).slice(0, 200),
    ),
    recentTrackIds: (stats.recentTrackIds ?? []).slice(0, 20),
    recentLog: (stats.recentLog ?? []).slice(0, 20),
    streakDays: typeof stats.streakDays === 'number' ? stats.streakDays : 0,
  };
}

export interface HydratedFirestoreAccount {
  isNewUser: boolean;
  user: UserAccount;
  likedTrackIds: string[];
  followedArtistIds: string[];
  downloadedTrackIds: string[];
  playlists: PlaylistItem[];
  downloadedTracks: Track[];
  socialUsers: SocialUser[];
  preferences?: Partial<UserPreferences>;
  likedSongsCustomization?: LikedSongsCustomization;
  activeDeviceId?: string;
  listeningStats?: ListeningStatsState;
}

export interface ProfileSyncPayload {
  user: UserAccount;
  likedTrackIds: string[];
  followedArtistIds: string[];
  downloadedTrackIds: string[];
  preferences: UserPreferences;
  likedSongsCustomization: LikedSongsCustomization;
  activeDeviceId: string;
  listeningStats: ListeningStatsState;
}

export function loadLocalUserCache(uid: string): HydratedFirestoreAccount | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw =
      window.localStorage.getItem(`${USER_CACHE_KEY_PREFIX}${uid}`) ??
      window.localStorage.getItem(`${USER_CACHE_KEY_PREFIX}${sanitizeFirestoreId(uid)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HydratedFirestoreAccount;
    if (!parsed || !parsed.user || typeof parsed.user !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalUserCache(uid: string, account: HydratedFirestoreAccount): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const serialized = JSON.stringify(account);
    window.localStorage.setItem(`${USER_CACHE_KEY_PREFIX}${uid}`, serialized);
    const safeUid = sanitizeFirestoreId(uid);
    if (safeUid !== uid) {
      window.localStorage.setItem(`${USER_CACHE_KEY_PREFIX}${safeUid}`, serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function buildFallbackHydration(
  uid: string,
  fallbackUser: UserAccount,
  fallbackExtras: {
    likedTrackIds: string[];
    followedArtistIds: string[];
    downloadedTrackIds: string[];
    preferences: UserPreferences;
    likedSongsCustomization: LikedSongsCustomization;
    activeDeviceId: string;
    listeningStats: ListeningStatsState;
  },
): HydratedFirestoreAccount {
  const cached = loadLocalUserCache(uid);
  if (cached) {
    return {
      ...cached,
      isNewUser: false,
      user: {
        ...cached.user,
        uid,
        authProvider: fallbackUser.authProvider ?? cached.user.authProvider ?? 'google',
      },
    };
  }

  return {
    isNewUser: true,
    user: {
      ...fallbackUser,
      uid,
      authProvider: fallbackUser.authProvider ?? 'google',
    },
    likedTrackIds: fallbackExtras.likedTrackIds,
    followedArtistIds: fallbackExtras.followedArtistIds,
    downloadedTrackIds: fallbackExtras.downloadedTrackIds,
    playlists: [],
    downloadedTracks: [],
    socialUsers: [],
    preferences: fallbackExtras.preferences,
    likedSongsCustomization: fallbackExtras.likedSongsCustomization,
    activeDeviceId: fallbackExtras.activeDeviceId,
    listeningStats: fallbackExtras.listeningStats,
  };
}

async function getCollectionOfflineSafe(pathSegments: [string, string, string]): Promise<QuerySnapshot | null> {
  if (!db) return null;
  const colRef = collection(db, ...pathSegments);
  try {
    return await getDocs(colRef);
  } catch (err) {
    if (isFirestoreOfflineError(err)) {
      try {
        return await getDocsFromCache(colRef);
      } catch {
        return null;
      }
    }
    logFirestoreError(err, OperationType.LIST, pathSegments.join('/'));
    return null;
  }
}

export async function hydrateUserFromFirestore(
  uid: string,
  fallbackUser: UserAccount,
  fallbackExtras: {
    likedTrackIds: string[];
    followedArtistIds: string[];
    downloadedTrackIds: string[];
    preferences: UserPreferences;
    likedSongsCustomization: LikedSongsCustomization;
    activeDeviceId: string;
    listeningStats: ListeningStatsState;
  },
): Promise<HydratedFirestoreAccount> {
  if (!isFirebaseConfigured || !db) {
    return buildFallbackHydration(uid, fallbackUser, fallbackExtras);
  }

  const safeUid = sanitizeFirestoreId(uid);
  const userDocRef = doc(db, 'users', safeUid);

  let snap: DocumentSnapshot | null = null;
  let fromOfflineFallback = false;

  try {
    snap = await getDoc(userDocRef);
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      fromOfflineFallback = true;
      try {
        snap = await getDocFromCache(userDocRef);
      } catch {
        snap = null;
      }
      if (!snap || !snap.exists()) {
        return buildFallbackHydration(safeUid, fallbackUser, fallbackExtras);
      }
    } else {
      logFirestoreError(error, OperationType.GET, `users/${safeUid}`);
      return buildFallbackHydration(safeUid, fallbackUser, fallbackExtras);
    }
  }

  try {
    if (!snap || !snap.exists()) {
      if (fromOfflineFallback) {
        return buildFallbackHydration(safeUid, fallbackUser, fallbackExtras);
      }

      const initialProfileDoc: Record<string, unknown> = {
        uid: safeUid,
        name: clampString(fallbackUser.name, 100, 'Listener') || 'Listener',
        handle: clampString(fallbackUser.handle, 64, '@listener') || '@listener',
        email: clampString(fallbackUser.email, 200, 'listener@klyn.audio') || 'listener@klyn.audio',
        initials: clampString(fallbackUser.initials, 4, 'KL') || 'KL',
        avatarStyle: fallbackUser.avatarStyle ?? 'monogram',
        accentColor: clampString(fallbackUser.accentColor, 32, '#C27838') || '#C27838',
        favoriteGenres: (fallbackUser.favoriteGenres ?? ['Electronic', 'Spatial']).slice(0, 12),
        likedTrackIds: fallbackExtras.likedTrackIds.slice(0, 500),
        followedArtistIds: fallbackExtras.followedArtistIds.slice(0, 200),
        downloadedTrackIds: fallbackExtras.downloadedTrackIds.slice(0, 500),
        activeDeviceId:
          clampString(fallbackExtras.activeDeviceId, 64, 'system-default') || 'system-default',
        hasCompletedOnboarding: Boolean(fallbackUser.hasCompletedOnboarding),
        preferences: fallbackExtras.preferences,
        likedSongsCustomization: fallbackExtras.likedSongsCustomization,
        listeningStats: sanitizeStatsForFirestore(fallbackExtras.listeningStats),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (fallbackUser.avatarUrl && fallbackUser.avatarUrl.length <= 120000) {
        initialProfileDoc.avatarUrl = fallbackUser.avatarUrl;
      }

      try {
        await setDoc(userDocRef, initialProfileDoc);
      } catch (writeErr) {
        if (!isFirestoreOfflineError(writeErr)) {
          logFirestoreError(writeErr, OperationType.CREATE, `users/${safeUid}`);
        }
      }

      const newResult = buildFallbackHydration(safeUid, fallbackUser, fallbackExtras);
      saveLocalUserCache(safeUid, newResult);
      return newResult;
    }

    const data = snap.data() as Record<string, unknown>;

    const [playlistsSnap, downloadsSnap, friendsSnap] = await Promise.all([
      getCollectionOfflineSafe(['users', safeUid, 'playlists']),
      getCollectionOfflineSafe(['users', safeUid, 'downloads']),
      getCollectionOfflineSafe(['users', safeUid, 'friends']),
    ]);

    const playlists: PlaylistItem[] = playlistsSnap
      ? playlistsSnap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            id: String(raw.id ?? d.id),
            title: String(raw.title ?? 'Playlist'),
            curator: String(raw.curator ?? 'Personal Playlist'),
            description: String(raw.description ?? ''),
            trackIds: Array.isArray(raw.trackIds) ? (raw.trackIds as string[]) : [],
            coverUrl: String(raw.coverUrl ?? ''),
            pinned: Boolean(raw.pinned),
            downloaded: Boolean(raw.downloaded),
            accentGradient:
              typeof raw.accentGradient === 'string' ? raw.accentGradient : undefined,
            displayMode: raw.displayMode === 'compact' ? 'compact' : 'comfortable',
            showQualityBadges:
              typeof raw.showQualityBadges === 'boolean' ? raw.showQualityBadges : true,
            isAiBlend: Boolean(raw.isAiBlend),
            blendMatchPct:
              typeof raw.blendMatchPct === 'number' ? raw.blendMatchPct : undefined,
            sharedWithFriendId:
              typeof raw.sharedWithFriendId === 'string' ? raw.sharedWithFriendId : undefined,
          };
        })
      : [];

    const downloadedTracks: Track[] = downloadsSnap
      ? downloadsSnap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            id: String(raw.id ?? d.id),
            title: String(raw.title ?? 'Untitled'),
            artist: String(raw.artist ?? 'Unknown Artist'),
            album: String(raw.album ?? 'Single'),
            duration: typeof raw.duration === 'number' ? raw.duration : 180,
            primaryColor: String(raw.primaryColor ?? '#B93848'),
            secondaryColor: String(raw.secondaryColor ?? '#1E1B2E'),
            genre: String(raw.genre ?? 'Music'),
            category:
              raw.category === 'Spatial' || raw.category === 'Mixes' ? raw.category : 'Music',
            quality:
              raw.quality === 'Dolby Atmos' || raw.quality === 'Hi-Res Lossless'
                ? raw.quality
                : 'Lossless',
            coverUrl: String(raw.coverUrl ?? ''),
            fallbackGradient: String(
              raw.fallbackGradient ?? 'linear-gradient(135deg, #27272a 0%, #09090b 100%)',
            ),
            playlistName: String(raw.playlistName ?? 'App Downloads'),
            year: typeof raw.year === 'number' ? raw.year : new Date().getFullYear(),
            plays: 0,
            downloaded: true,
            youtubeId: typeof raw.youtubeId === 'string' ? raw.youtubeId : undefined,
            lyrics: [],
          };
        })
      : [];

    const socialUsers: SocialUser[] = friendsSnap
      ? friendsSnap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            id: String(raw.id ?? d.id),
            name: String(raw.name ?? 'Friend'),
            handle: String(raw.handle ?? '@friend'),
            initials: String(raw.initials ?? 'FR'),
            avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
            isFriend: Boolean(raw.isFriend ?? true),
            isOnline: false,
            currentTrackId: '',
            lastActiveLabel: String(raw.lastActiveLabel ?? 'Saved friend'),
            topTrackIds: [],
            tasteMatchPct: typeof raw.tasteMatchPct === 'number' ? raw.tasteMatchPct : 85,
            accentColor: String(raw.accentColor ?? '#C27838'),
          };
        })
      : [];

    const savedAvatarUrl =
      typeof data.avatarUrl === 'string' && data.avatarUrl.trim().length > 0
        ? data.avatarUrl
        : fallbackUser.avatarUrl;

    const hydratedUser: UserAccount = {
      id: fallbackUser.id || safeUid,
      uid: safeUid,
      authProvider: fallbackUser.authProvider ?? 'google',
      name: typeof data.name === 'string' && data.name ? data.name : fallbackUser.name,
      handle: typeof data.handle === 'string' && data.handle ? data.handle : fallbackUser.handle,
      email: typeof data.email === 'string' && data.email ? data.email : fallbackUser.email,
      initials:
        typeof data.initials === 'string' && data.initials ? data.initials : fallbackUser.initials,
      avatarUrl: savedAvatarUrl,
      avatarStyle:
        data.avatarStyle === 'obsidian-ring' ||
        data.avatarStyle === 'glass-emblem' ||
        data.avatarStyle === 'halo'
          ? data.avatarStyle
          : 'monogram',
      accentColor:
        typeof data.accentColor === 'string' && data.accentColor
          ? data.accentColor
          : '#C27838',
      favoriteGenres: Array.isArray(data.favoriteGenres)
        ? (data.favoriteGenres as string[])
        : fallbackUser.favoriteGenres,
      hasCompletedOnboarding: Boolean(data.hasCompletedOnboarding),
      createdAt: fallbackUser.createdAt,
    };

    const likedTrackIds = Array.isArray(data.likedTrackIds)
      ? (data.likedTrackIds as string[])
      : [];
    const followedArtistIds = Array.isArray(data.followedArtistIds)
      ? (data.followedArtistIds as string[])
      : [];
    const downloadedTrackIds = Array.isArray(data.downloadedTrackIds)
      ? (data.downloadedTrackIds as string[])
      : downloadedTracks.map((t) => t.id);

    const resolved: HydratedFirestoreAccount = {
      isNewUser: false,
      user: hydratedUser,
      likedTrackIds,
      followedArtistIds,
      downloadedTrackIds,
      playlists,
      downloadedTracks,
      socialUsers,
      preferences: (data.preferences as Partial<UserPreferences>) ?? undefined,
      likedSongsCustomization:
        (data.likedSongsCustomization as LikedSongsCustomization) ??
        DEFAULT_LIKED_SONGS_CUSTOMIZATION,
      activeDeviceId:
        typeof data.activeDeviceId === 'string' ? data.activeDeviceId : 'system-default',
      listeningStats:
        (data.listeningStats as ListeningStatsState) ?? EMPTY_LISTENING_STATS,
    };

    saveLocalUserCache(safeUid, resolved);
    return resolved;
  } catch (error) {
    if (!isFirestoreOfflineError(error)) {
      logFirestoreError(error, OperationType.GET, `users/${safeUid}`);
    }
    return buildFallbackHydration(safeUid, fallbackUser, fallbackExtras);
  }
}

export async function syncUserProfileToFirestore(
  uid: string,
  payload: ProfileSyncPayload,
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid);

  const existingLocal = loadLocalUserCache(safeUid);
  saveLocalUserCache(safeUid, {
    isNewUser: false,
    user: payload.user,
    likedTrackIds: payload.likedTrackIds,
    followedArtistIds: payload.followedArtistIds,
    downloadedTrackIds: payload.downloadedTrackIds,
    playlists: existingLocal?.playlists ?? [],
    downloadedTracks: existingLocal?.downloadedTracks ?? [],
    socialUsers: existingLocal?.socialUsers ?? [],
    preferences: payload.preferences,
    likedSongsCustomization: payload.likedSongsCustomization,
    activeDeviceId: payload.activeDeviceId,
    listeningStats: payload.listeningStats,
  });

  if (!isFirebaseConfigured || !db) return;
  const userDocRef = doc(db, 'users', safeUid);
  const patch: Record<string, unknown> = {
    name: clampString(payload.user.name, 100, 'Listener') || 'Listener',
    handle: clampString(payload.user.handle, 64, '@listener') || '@listener',
    email: clampString(payload.user.email, 200, 'listener@klyn.audio') || 'listener@klyn.audio',
    initials: clampString(payload.user.initials, 4, 'KL') || 'KL',
    avatarStyle: payload.user.avatarStyle ?? 'monogram',
    accentColor: clampString(payload.user.accentColor, 32, '#C27838') || '#C27838',
    favoriteGenres: (payload.user.favoriteGenres ?? []).slice(0, 12),
    likedTrackIds: payload.likedTrackIds.slice(0, 500),
    followedArtistIds: payload.followedArtistIds.slice(0, 200),
    downloadedTrackIds: payload.downloadedTrackIds.slice(0, 500),
    activeDeviceId: clampString(payload.activeDeviceId, 64, 'system-default') || 'system-default',
    hasCompletedOnboarding: Boolean(payload.user.hasCompletedOnboarding),
    preferences: payload.preferences,
    likedSongsCustomization: payload.likedSongsCustomization,
    listeningStats: sanitizeStatsForFirestore(payload.listeningStats),
    updatedAt: serverTimestamp(),
  };

  if (payload.user.avatarUrl && payload.user.avatarUrl.length <= 120000) {
    patch.avatarUrl = payload.user.avatarUrl;
  } else {
    patch.avatarUrl = '';
  }

  try {
    await updateDoc(userDocRef, patch);
  } catch (err) {
    if (isFirestoreOfflineError(err)) return;
    try {
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        await setDoc(userDocRef, {
          ...patch,
          uid: safeUid,
          createdAt: serverTimestamp(),
        });
        return;
      }
      logFirestoreError(err, OperationType.UPDATE, `users/${safeUid}`);
    } catch (innerErr) {
      logFirestoreError(innerErr, OperationType.WRITE, `users/${safeUid}`);
    }
  }
}

export async function syncPlaylistToFirestore(
  uid: string,
  playlist: PlaylistItem,
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(playlist.id);
  const ref = doc(db, 'users', safeUid, 'playlists', safeId);

  const updateFields: Record<string, unknown> = {
    title: clampString(playlist.title, 120, 'Playlist') || 'Playlist',
    curator: clampString(playlist.curator, 120),
    description: clampString(playlist.description, 400),
    trackIds: playlist.trackIds.slice(0, 500),
    coverUrl: clampString(playlist.coverUrl, 2000),
    pinned: Boolean(playlist.pinned),
    downloaded: Boolean(playlist.downloaded),
    displayMode: playlist.displayMode === 'compact' ? 'compact' : 'comfortable',
    showQualityBadges: playlist.showQualityBadges ?? true,
    isAiBlend: Boolean(playlist.isAiBlend),
    updatedAt: serverTimestamp(),
  };

  if (playlist.accentGradient) {
    updateFields.accentGradient = clampString(playlist.accentGradient, 300);
  }
  if (typeof playlist.blendMatchPct === 'number') {
    updateFields.blendMatchPct = Math.min(100, Math.max(0, playlist.blendMatchPct));
  }
  if (playlist.sharedWithFriendId) {
    updateFields.sharedWithFriendId = clampString(playlist.sharedWithFriendId, 128);
  }

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, updateFields);
    } else {
      await setDoc(ref, {
        ...updateFields,
        id: safeId,
        ownerId: safeUid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, `users/${safeUid}/playlists/${safeId}`);
  }
}

export async function deletePlaylistFromFirestore(
  uid: string,
  playlistId: string,
): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(playlistId);
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'playlists', safeId));
  } catch (error) {
    logFirestoreError(error, OperationType.DELETE, `users/${safeUid}/playlists/${safeId}`);
  }
}

export async function syncDownloadToFirestore(uid: string, track: Track): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(track.id);
  const ref = doc(db, 'users', safeUid, 'downloads', safeId);

  const safeYear =
    Number.isFinite(track.year) && track.year >= 1900 && track.year <= 2100
      ? Math.round(track.year)
      : new Date().getFullYear();

  const payload: Record<string, unknown> = {
    id: safeId,
    ownerId: safeUid,
    title: clampString(track.title, 200, 'Untitled') || 'Untitled',
    artist: clampString(track.artist, 150, 'Artist') || 'Artist',
    album: clampString(track.album, 200, 'Single') || 'Single',
    duration: Number.isFinite(track.duration) ? Math.min(36000, Math.max(0, track.duration)) : 180,
    primaryColor: clampString(track.primaryColor, 32, '#B93848'),
    secondaryColor: clampString(track.secondaryColor, 32, '#1E1B2E'),
    genre: clampString(track.genre, 64, 'Music'),
    category: track.category,
    quality: track.quality,
    coverUrl: clampString(track.coverUrl, 2000),
    fallbackGradient: clampString(track.fallbackGradient, 300),
    playlistName: clampString(track.playlistName, 120),
    year: safeYear,
    downloadedAt: serverTimestamp(),
  };

  if (track.youtubeId) {
    payload.youtubeId = clampString(track.youtubeId, 32);
  }

  try {
    await setDoc(ref, payload);
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, `users/${safeUid}/downloads/${safeId}`);
  }
}

export async function deleteDownloadFromFirestore(uid: string, trackId: string): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(trackId);
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'downloads', safeId));
  } catch (error) {
    logFirestoreError(error, OperationType.DELETE, `users/${safeUid}/downloads/${safeId}`);
  }
}

export async function syncFriendToFirestore(uid: string, friend: SocialUser): Promise<void> {
  if (!isFirebaseConfigured || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(friend.id);
  const ref = doc(db, 'users', safeUid, 'friends', safeId);

  const updateFields: Record<string, unknown> = {
    name: clampString(friend.name, 100, 'Friend') || 'Friend',
    handle: clampString(friend.handle, 64, '@friend') || '@friend',
    initials: clampString(friend.initials, 4, 'FR') || 'FR',
    isFriend: Boolean(friend.isFriend),
    tasteMatchPct: Math.min(100, Math.max(0, friend.tasteMatchPct ?? 85)),
    accentColor: clampString(friend.accentColor, 32, '#C27838'),
    lastActiveLabel: clampString(friend.lastActiveLabel, 80),
    updatedAt: serverTimestamp(),
  };

  if (friend.avatarUrl && friend.avatarUrl.length <= 120000) {
    updateFields.avatarUrl = friend.avatarUrl;
  }

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, updateFields);
    } else {
      await setDoc(ref, {
        ...updateFields,
        id: safeId,
        ownerId: safeUid,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, `users/${safeUid}/friends/${safeId}`);
  }
}
