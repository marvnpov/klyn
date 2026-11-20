import {
  collection,
  deleteDoc,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  limit,
  onSnapshot,
  orderBy,
  query,
  QuerySnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  isFirebaseConfigured,
  isFirestoreOfflineError,
  logFirestoreError,
  OperationType,
} from '../services/firebase';
import {
  AccountDeviceRecord,
  ConnectedAppEntry,
  ConnectedAppProvider,
  LikedSongsCustomization,
  ListeningStatsState,
  PlaylistItem,
  ShowProgressEntry,
  SocialUser,
  Track,
  UserAccount,
  UserPreferences,
} from '../types/music';
import { DEFAULT_LIKED_SONGS_CUSTOMIZATION, EMPTY_LISTENING_STATS } from './storage';

const USER_CACHE_KEY_PREFIX = 'klyn_user_cache_v4_';

export function sanitizeFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return cleaned || `item_${Date.now()}`;
}

function hasAuthenticatedUser(expectedUid?: string): boolean {
  if (!isFirebaseConfigured || !db || !auth?.currentUser || auth.currentUser.isAnonymous) {
    return false;
  }
  if (expectedUid) {
    return sanitizeFirestoreId(auth.currentUser.uid) === sanitizeFirestoreId(expectedUid);
  }
  return true;
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
  if (!hasAuthenticatedUser(uid) || !db) {
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
        favoriteGenres: (fallbackUser.favoriteGenres ?? []).slice(0, 16),
        likedTrackIds: fallbackExtras.likedTrackIds.slice(0, 500),
        followedArtistIds: fallbackExtras.followedArtistIds.slice(0, 200),
        downloadedTrackIds: fallbackExtras.downloadedTrackIds.slice(0, 500),
        recentSearches: (fallbackUser.recentSearches ?? []).slice(0, 40),
        activeDeviceId:
          clampString(fallbackExtras.activeDeviceId, 128, 'system-default') || 'system-default',
        hasCompletedOnboarding: Boolean(fallbackUser.hasCompletedOnboarding),
        notificationsEnabled: Boolean(fallbackUser.notificationsEnabled),
        connectedApps: fallbackUser.connectedApps ?? {},
        preferences: fallbackExtras.preferences,
        likedSongsCustomization: fallbackExtras.likedSongsCustomization,
        listeningStats: sanitizeStatsForFirestore(fallbackExtras.listeningStats),
        showProgress: fallbackUser.showProgress ?? {},
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
            sourceProvider:
              raw.sourceProvider === 'spotify' ||
              raw.sourceProvider === 'audiomack' ||
              raw.sourceProvider === 'soundcloud' ||
              raw.sourceProvider === 'tunesimo'
                ? raw.sourceProvider
                : undefined,
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
            category: raw.category === 'Mixes' ? 'Mixes' : 'Music',
            quality:
              raw.quality === 'Hi-Res Lossless' || raw.quality === 'Dolby Atmos'
                ? 'Hi-Res Lossless'
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
      notificationsEnabled:
        typeof data.notificationsEnabled === 'boolean' ? data.notificationsEnabled : false,
      connectedApps:
        data.connectedApps && typeof data.connectedApps === 'object'
          ? (data.connectedApps as Partial<Record<ConnectedAppProvider, ConnectedAppEntry>>)
          : {},
      recentSearches: Array.isArray(data.recentSearches)
        ? (data.recentSearches as string[])
        : [],
      showProgress:
        data.showProgress && typeof data.showProgress === 'object'
          ? (data.showProgress as Record<string, ShowProgressEntry>)
          : {},
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

  if (!hasAuthenticatedUser(uid) || !db) return;
  const userDocRef = doc(db, 'users', safeUid);
  const patch: Record<string, unknown> = {
    name: clampString(payload.user.name, 100, 'Listener') || 'Listener',
    handle: clampString(payload.user.handle, 64, '@listener') || '@listener',
    email: clampString(payload.user.email, 200, 'listener@klyn.audio') || 'listener@klyn.audio',
    initials: clampString(payload.user.initials, 4, 'KL') || 'KL',
    avatarStyle: payload.user.avatarStyle ?? 'monogram',
    accentColor: clampString(payload.user.accentColor, 32, '#C27838') || '#C27838',
    favoriteGenres: (payload.user.favoriteGenres ?? []).slice(0, 16),
    likedTrackIds: payload.likedTrackIds.slice(0, 500),
    followedArtistIds: payload.followedArtistIds.slice(0, 200),
    downloadedTrackIds: payload.downloadedTrackIds.slice(0, 500),
    recentSearches: (payload.user.recentSearches ?? []).slice(0, 40),
    activeDeviceId: clampString(payload.activeDeviceId, 128, 'system-default') || 'system-default',
    hasCompletedOnboarding: Boolean(payload.user.hasCompletedOnboarding),
    notificationsEnabled: Boolean(payload.user.notificationsEnabled),
    connectedApps: payload.user.connectedApps ?? {},
    preferences: payload.preferences,
    likedSongsCustomization: payload.likedSongsCustomization,
    listeningStats: sanitizeStatsForFirestore(payload.listeningStats),
    showProgress: payload.user.showProgress ?? {},
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

export async function syncPublicProfileToFirestore(user: UserAccount): Promise<void> {
  if (!hasAuthenticatedUser(user.uid) || !db || !user.uid) return;
  const safeUid = sanitizeFirestoreId(user.uid);
  const ref = doc(db, 'public_profiles', safeUid);
  const payload: Record<string, unknown> = {
    uid: safeUid,
    name: clampString(user.name, 100, 'Listener') || 'Listener',
    handle: clampString(user.handle, 64, '@listener') || '@listener',
    initials: clampString(user.initials, 4, 'KL') || 'KL',
    accentColor: clampString(user.accentColor, 32, '#C27838') || '#C27838',
    updatedAt: serverTimestamp(),
  };
  if (user.avatarUrl && user.avatarUrl.length <= 120000) {
    payload.avatarUrl = user.avatarUrl;
  } else {
    payload.avatarUrl = '';
  }

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    if (!isFirestoreOfflineError(error)) {
      logFirestoreError(error, OperationType.WRITE, `public_profiles/${safeUid}`);
    }
  }
}

export async function searchPublicProfilesFromFirestore(
  searchTerm: string,
  excludeUid?: string,
): Promise<SocialUser[]> {
  if (!hasAuthenticatedUser() || !db) return [];
  const clean = searchTerm.trim().toLowerCase().replace(/^@+/, '');
  if (!clean) return [];

  try {
    const q = query(collection(db, 'public_profiles'), orderBy('updatedAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as Record<string, unknown>)
      .filter((raw) => {
        const uid = String(raw.uid ?? '');
        if (!uid || (excludeUid && uid === excludeUid)) return false;
        const name = String(raw.name ?? '').toLowerCase();
        const handle = String(raw.handle ?? '').toLowerCase();
        return name.includes(clean) || handle.includes(clean);
      })
      .map((raw) => ({
        id: String(raw.uid),
        name: String(raw.name ?? 'Listener'),
        handle: String(raw.handle ?? '@listener'),
        initials: String(raw.initials ?? 'KL'),
        avatarUrl: typeof raw.avatarUrl === 'string' && raw.avatarUrl ? raw.avatarUrl : undefined,
        isFriend: false,
        isOnline: true,
        currentTrackId: '',
        lastActiveLabel: 'KLYN Member',
        topTrackIds: [],
        tasteMatchPct: 88,
        accentColor: String(raw.accentColor ?? '#C27838'),
      }));
  } catch (error) {
    if (!isFirestoreOfflineError(error)) {
      logFirestoreError(error, OperationType.LIST, 'public_profiles');
    }
    return [];
  }
}

export async function syncDeviceHeartbeatToFirestore(
  uid: string,
  device: AccountDeviceRecord,
): Promise<void> {
  if (!hasAuthenticatedUser(uid) || !db || !uid || !device.deviceId) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeDeviceId = sanitizeFirestoreId(device.deviceId);
  const ref = doc(db, 'users', safeUid, 'devices', safeDeviceId);

  const payload: Record<string, unknown> = {
    deviceId: safeDeviceId,
    ownerId: safeUid,
    name: clampString(device.name, 120, 'Web Device') || 'Web Device',
    platform: clampString(device.platform, 80, 'Web'),
    isPlaying: Boolean(device.isPlaying),
    activeTrackId: clampString(device.activeTrackId, 128),
    activeTrackTitle: clampString(device.activeTrackTitle, 200),
    activeTrackArtist: clampString(device.activeTrackArtist, 150),
    playbackPosition:
      typeof device.playbackPosition === 'number' && Number.isFinite(device.playbackPosition)
        ? Math.min(86400, Math.max(0, device.playbackPosition))
        : 0,
    batteryLevel:
      typeof device.batteryLevel === 'number' && Number.isFinite(device.batteryLevel)
        ? Math.min(100, Math.max(0, Math.round(device.batteryLevel)))
        : null,
    batteryCharging:
      typeof device.batteryCharging === 'boolean' ? device.batteryCharging : null,
    bluetoothDeviceName: clampString(device.bluetoothDeviceName, 120),
    bluetoothBatteryLevel:
      typeof device.bluetoothBatteryLevel === 'number' && Number.isFinite(device.bluetoothBatteryLevel)
        ? Math.min(100, Math.max(0, Math.round(device.bluetoothBatteryLevel)))
        : null,
    lastSeen: Number.isFinite(device.lastSeen) ? device.lastSeen : Date.now(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    if (!isFirestoreOfflineError(error)) {
      logFirestoreError(error, OperationType.WRITE, `users/${safeUid}/devices/${safeDeviceId}`);
    }
  }
}

export function subscribeAccountDevicesFromFirestore(
  uid: string,
  currentDeviceId: string,
  onUpdate: (devices: AccountDeviceRecord[]) => void,
): () => void {
  if (!hasAuthenticatedUser(uid) || !db || !uid) return () => {};
  const safeUid = sanitizeFirestoreId(uid);
  const colRef = collection(db, 'users', safeUid, 'devices');
  try {
    return onSnapshot(
      colRef,
      (snap) => {
        const list: AccountDeviceRecord[] = snap.docs
          .map((d) => {
            const raw = d.data() as Record<string, unknown>;
            const deviceId = String(raw.deviceId ?? d.id);
            return {
              deviceId,
              name: String(raw.name ?? 'Web Browser'),
              platform: String(raw.platform ?? 'Web'),
              isCurrentDevice: deviceId === sanitizeFirestoreId(currentDeviceId),
              isPlaying: Boolean(raw.isPlaying),
              activeTrackId:
                typeof raw.activeTrackId === 'string' ? raw.activeTrackId : undefined,
              activeTrackTitle:
                typeof raw.activeTrackTitle === 'string' ? raw.activeTrackTitle : undefined,
              activeTrackArtist:
                typeof raw.activeTrackArtist === 'string' ? raw.activeTrackArtist : undefined,
              playbackPosition:
                typeof raw.playbackPosition === 'number' ? raw.playbackPosition : 0,
              batteryLevel: typeof raw.batteryLevel === 'number' ? raw.batteryLevel : null,
              batteryCharging:
                typeof raw.batteryCharging === 'boolean' ? raw.batteryCharging : null,
              bluetoothDeviceName:
                typeof raw.bluetoothDeviceName === 'string' ? raw.bluetoothDeviceName : undefined,
              bluetoothBatteryLevel:
                typeof raw.bluetoothBatteryLevel === 'number' ? raw.bluetoothBatteryLevel : null,
              lastSeen: typeof raw.lastSeen === 'number' ? raw.lastSeen : 0,
            };
          })
          .sort((a, b) => b.lastSeen - a.lastSeen);
        onUpdate(list);
      },
      (err) => {
        if (!isFirestoreOfflineError(err)) {
          logFirestoreError(err, OperationType.LIST, `users/${safeUid}/devices`);
        }
      },
    );
  } catch {
    return () => {};
  }
}

export async function syncPlaylistToFirestore(
  uid: string,
  playlist: PlaylistItem,
): Promise<void> {
  if (!hasAuthenticatedUser(uid) || !db) return;
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
  if (playlist.sourceProvider) {
    updateFields.sourceProvider = clampString(playlist.sourceProvider, 32);
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
  if (!hasAuthenticatedUser(uid) || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(playlistId);
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'playlists', safeId));
  } catch (error) {
    logFirestoreError(error, OperationType.DELETE, `users/${safeUid}/playlists/${safeId}`);
  }
}

export async function syncDownloadToFirestore(uid: string, track: Track): Promise<void> {
  if (!hasAuthenticatedUser(uid) || !db) return;
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
    category: track.category === 'Mixes' ? 'Mixes' : 'Music',
    quality: track.quality === 'Hi-Res Lossless' ? 'Hi-Res Lossless' : 'Lossless',
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
  if (!hasAuthenticatedUser(uid) || !db) return;
  const safeUid = sanitizeFirestoreId(uid);
  const safeId = sanitizeFirestoreId(trackId);
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'downloads', safeId));
  } catch (error) {
    logFirestoreError(error, OperationType.DELETE, `users/${safeUid}/downloads/${safeId}`);
  }
}

export async function syncFriendToFirestore(uid: string, friend: SocialUser): Promise<void> {
  if (!hasAuthenticatedUser(uid) || !db) return;
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

export interface FriendRequestRecord {
  id: string;
  fromUid: string;
  fromName: string;
  fromHandle: string;
  toUid: string;
  kind: 'friend' | 'blend' | 'listen-party';
  status: 'pending' | 'accepted' | 'declined';
  trackId?: string;
}

export async function sendSocialInviteToFirestore(
  request: Omit<FriendRequestRecord, 'status'>,
): Promise<void> {
  if (!hasAuthenticatedUser(request.fromUid) || !db) return;
  const safeId = sanitizeFirestoreId(request.id);
  const safeFrom = sanitizeFirestoreId(request.fromUid);
  const safeTo = sanitizeFirestoreId(request.toUid);
  if (!safeTo || safeTo === safeFrom) return;

  const ref = doc(db, 'friend_requests', safeId);
  const payload: Record<string, unknown> = {
    id: safeId,
    fromUid: safeFrom,
    fromName: clampString(request.fromName, 100, 'Listener') || 'Listener',
    fromHandle: clampString(request.fromHandle, 64, '@listener') || '@listener',
    toUid: safeTo,
    kind: request.kind,
    status: 'pending',
    trackId: clampString(request.trackId, 128),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload);
  } catch (error) {
    logFirestoreError(error, OperationType.CREATE, `friend_requests/${safeId}`);
  }
}

export async function respondToSocialInviteInFirestore(
  requestId: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  if (!hasAuthenticatedUser() || !db) return;
  const safeId = sanitizeFirestoreId(requestId);
  try {
    await updateDoc(doc(db, 'friend_requests', safeId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logFirestoreError(error, OperationType.UPDATE, `friend_requests/${safeId}`);
  }
}

export function subscribeIncomingSocialInvites(
  uid: string,
  onUpdate: (requests: FriendRequestRecord[]) => void,
): () => void {
  if (!hasAuthenticatedUser(uid) || !db || !uid) return () => {};
  const safeUid = sanitizeFirestoreId(uid);
  const q = query(
    collection(db, 'friend_requests'),
    where('toUid', '==', safeUid),
    limit(20),
  );
  try {
    return onSnapshot(
      q,
      (snap) => {
        const items: FriendRequestRecord[] = snap.docs
          .map((d): FriendRequestRecord => {
            const raw = d.data() as Record<string, unknown>;
            const kind: FriendRequestRecord['kind'] =
              raw.kind === 'blend' || raw.kind === 'listen-party' ? raw.kind : 'friend';
            const status: FriendRequestRecord['status'] =
              raw.status === 'accepted' || raw.status === 'declined' ? raw.status : 'pending';
            return {
              id: String(raw.id ?? d.id),
              fromUid: String(raw.fromUid ?? ''),
              fromName: String(raw.fromName ?? 'Listener'),
              fromHandle: String(raw.fromHandle ?? '@listener'),
              toUid: String(raw.toUid ?? safeUid),
              kind,
              status,
              trackId: typeof raw.trackId === 'string' ? raw.trackId : undefined,
            };
          })
          .filter((item) => item.status === 'pending');
        onUpdate(items);
      },
      (err) => {
        if (!isFirestoreOfflineError(err)) {
          logFirestoreError(err, OperationType.LIST, 'friend_requests');
        }
      },
    );
  } catch {
    return () => {};
  }
}

export interface ListenPartyDocRecord {
  id: string;
  hostUid: string;
  guestUid: string;
  status: 'active' | 'ended';
  activeTrackId: string;
  activeTrackTitle: string;
  activeTrackArtist: string;
  isPlaying: boolean;
  messages: Array<{ id: string; sender: string; text: string; timeLabel: string }>;
}

export async function syncListenPartyToFirestore(party: ListenPartyDocRecord): Promise<void> {
  if (!hasAuthenticatedUser() || !db) return;
  const safeId = sanitizeFirestoreId(party.id);
  const ref = doc(db, 'listen_parties', safeId);
  const payload = {
    id: safeId,
    hostUid: sanitizeFirestoreId(party.hostUid),
    guestUid: sanitizeFirestoreId(party.guestUid),
    status: party.status,
    activeTrackId: clampString(party.activeTrackId, 128),
    activeTrackTitle: clampString(party.activeTrackTitle, 200),
    activeTrackArtist: clampString(party.activeTrackArtist, 150),
    isPlaying: Boolean(party.isPlaying),
    messages: (party.messages ?? []).slice(-30).map((m) => ({
      id: clampString(m.id, 64),
      sender: clampString(m.sender, 80),
      text: clampString(m.text, 400),
      timeLabel: clampString(m.timeLabel, 32),
    })),
    updatedAt: serverTimestamp(),
  };

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        status: payload.status,
        activeTrackId: payload.activeTrackId,
        activeTrackTitle: payload.activeTrackTitle,
        activeTrackArtist: payload.activeTrackArtist,
        isPlaying: payload.isPlaying,
        messages: payload.messages,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, `listen_parties/${safeId}`);
  }
}
