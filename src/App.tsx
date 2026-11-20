import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { AuthGateScreen } from './components/AuthGateScreen';
import { BottomDock } from './components/BottomDock';
import { CreatePlaylistModal } from './components/CreatePlaylistModal';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import { QueueDrawerModal } from './components/QueueDrawerModal';
import { SocialInvitePopupModal } from './components/SocialInvitePopupModal';
import { TopBar } from './components/TopBar';
import { ActivityView } from './components/views/ActivityView';
import { ArtistProfileView } from './components/views/ArtistProfileView';
import { HomeView } from './components/views/HomeView';
import { LibraryView } from './components/views/LibraryView';
import { SearchView } from './components/views/SearchView';
import { getLocalDateKey } from './data/catalog';
import {
  auth,
  isFirebaseConfigured,
  isFirestoreOfflineError,
  signOutFirebase,
  testConnection,
} from './services/firebase';
import { playerEngine } from './services/playerEngine';
import {
  LikedSongsCustomization,
  ListenPartyMessage,
  ListeningLogEntry,
  ListeningStatsState,
  LyricLine,
  NavTab,
  PendingInvitePopup,
  PlaylistItem,
  RepeatMode,
  SocialUser,
  TopFilterTab,
  Track,
  UserAccount,
  UserPreferences,
} from './types/music';
import { computeInitials } from './utils/avatarImage';
import {
  deleteDownloadFromFirestore,
  hydrateUserFromFirestore,
  loadLocalUserCache,
  syncDownloadToFirestore,
  syncFriendToFirestore,
  syncPlaylistToFirestore,
  syncUserProfileToFirestore,
} from './utils/firestoreSync';
import { generateKlynAiBlend } from './utils/klynAiBlend';
import { fetchSyncedLyrics } from './utils/lrclibApi';
import {
  clearAllOfflineDownloadedTracks,
  loadOfflineDownloadedTracks,
  removeOfflineDownloadedTrack,
  saveOfflineDownloadedTrack,
} from './utils/offlineDownloads';
import {
  DEFAULT_LIKED_SONGS_CUSTOMIZATION,
  EMPTY_LISTENING_STATS,
  clearActiveUserSession,
  loadCentralizedAppState,
  saveCentralizedAppState,
} from './utils/storage';

const DEFAULT_PREFERENCES: UserPreferences = {
  streamingQuality: 'Lossless',
  downloadQuality: 'Lossless',
  spatialEnabled: true,
  normalizeVolume: true,
  gaplessPlayback: true,
  crossfadeSeconds: 6,
  autoplaySimilar: true,
  autoScrollLyrics: true,
  notifyNewReleases: true,
  notifyWrappedWeekly: true,
  notifyPlaylistUpdates: true,
  notifyPushAlerts: false,
  notifySocialInvites: true,
  notifyStreakAlerts: true,
  listeningVisibility: true,
  privateSession: false,
  shareArtistAnalytics: true,
};

function computeStreakDays(activeDates: string[]): number {
  if (activeDates.length === 0) return 0;
  const dateSet = new Set(activeDates);
  const cursor = new Date();
  const todayKey = getLocalDateKey(cursor);

  if (!dateSet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(getLocalDateKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (dateSet.has(getLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function App() {
  const initialCentralState = useMemo(() => loadCentralizedAppState(), []);

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(
    () => initialCentralState?.user ?? null,
  );
  const [isReplayOnboardingOpen, setIsReplayOnboardingOpen] = useState(false);

  const [activeNav, setActiveNav] = useState<NavTab>('Home');
  const [topFilter, setTopFilter] = useState<TopFilterTab>('All');

  const [discoveredTracks, setDiscoveredTracks] = useState<Track[]>(
    () => initialCentralState?.discoveredTracks ?? [],
  );
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>(() => {
    const raw = initialCentralState?.queue ?? [];
    return Array.from(new Map(raw.filter(Boolean).map((t) => [t.id, t])).values());
  });
  const [activeTrackId, setActiveTrackId] = useState<string>(
    () => initialCentralState?.currentTrack?.id ?? '',
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(
    () => initialCentralState?.currentTime ?? 0,
  );
  const [liveDuration, setLiveDuration] = useState<number>(0);

  const [lyricsByTrackId, setLyricsByTrackId] = useState<Record<string, LyricLine[]>>({});
  const [lyricsLoadingIds, setLyricsLoadingIds] = useState<Set<string>>(() => new Set());

  const [isPlayerOpen, setIsPlayerOpen] = useState<boolean>(false);
  const [showLyrics, setShowLyrics] = useState<boolean>(false);
  const [isShuffled, setIsShuffled] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('all');

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(initialCentralState?.likedTrackIds ?? []),
  );
  const [playlists, setPlaylists] = useState<PlaylistItem[]>(
    () => initialCentralState?.playlists ?? [],
  );
  const [likedSongsCustomization, setLikedSongsCustomization] =
    useState<LikedSongsCustomization>(
      () => initialCentralState?.likedSongsCustomization ?? DEFAULT_LIKED_SONGS_CUSTOMIZATION,
    );
  const [followedArtists, setFollowedArtists] = useState<Set<string>>(
    () => new Set(initialCentralState?.followedArtistIds ?? []),
  );
  const [listeningStats, setListeningStats] = useState<ListeningStatsState>(
    () => initialCentralState?.listeningStats ?? EMPTY_LISTENING_STATS,
  );

  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState<boolean>(false);
  const [isLibraryQueueOpen, setIsLibraryQueueOpen] = useState<boolean>(false);

  // Social / Friends / Listen Party / Blend Pop-up state (real accounts + added friends)
  const [socialUsers, setSocialUsers] = useState<SocialUser[]>(
    () => initialCentralState?.socialUsers ?? [],
  );
  const [partyMessages, setPartyMessages] = useState<ListenPartyMessage[]>([]);
  const [activePartyFriendId, setActivePartyFriendId] = useState<string | null>(null);
  const [pendingInvitePopup, setPendingInvitePopup] = useState<PendingInvitePopup | null>(null);

  const [activeDeviceId, setActiveDeviceId] = useState<string>(
    () =>
      initialCentralState?.activeDeviceId && initialCentralState.activeDeviceId !== 'web-studio'
        ? initialCentralState.activeDeviceId
        : 'system-default',
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
    ...(initialCentralState?.settings ?? {}),
  }));
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const authSessionEpochRef = useRef<number>(0);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const activeHydrationUidRef = useRef<string | null>(null);
  const activeHydrationPromiseRef = useRef<Promise<void> | null>(null);
  const hydratedFirebaseUidRef = useRef<string | null>(null);
  const pendingAuthMetaRef = useRef<{
    name?: string;
    handle?: string;
    authProvider?: 'google' | 'email';
  } | null>(null);
  const lastSyncedFingerprintRef = useRef<string>('');
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const swRegisteredRef = useRef<boolean>(false);
  const offlineLoadedRef = useRef<boolean>(false);
  const authListenerAttachedRef = useRef<boolean>(false);
  const lastMediaMetadataKeyRef = useRef<string>('');
  const lastMediaPlaybackStateRef = useRef<'playing' | 'paused' | 'none'>('none');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 2800);
  }, []);

  // Load persisted offline downloaded tracks from IndexedDB (klyn_offline_db_v1) once on mount
  useEffect(() => {
    if (offlineLoadedRef.current) return;
    offlineLoadedRef.current = true;
    let active = true;
    loadOfflineDownloadedTracks()
      .then((tracks) => {
        if (active) setOfflineTracks(tracks);
      })
      .catch(() => {
        // Ignore storage access failures in sandboxed frames
      });
    return () => {
      active = false;
    };
  }, []);

  // Register PWA app-shell service worker once on window load (loop-safe & sandbox-safe)
  useEffect(() => {
    if (swRegisteredRef.current) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    swRegisteredRef.current = true;

    const registerSw = () => {
      try {
        void navigator.serviceWorker.register('/sw.js').catch(() => {
          // Ignore in restricted preview iframes
        });
      } catch {
        // Ignore in sandboxed environments
      }
    };

    if (document.readyState === 'complete') {
      registerSw();
      return;
    }

    window.addEventListener('load', registerSw, { once: true });
    return () => {
      window.removeEventListener('load', registerSw);
    };
  }, []);

  const downloadedTrackIds = useMemo(
    () => new Set(offlineTracks.map((t) => t.id)),
    [offlineTracks],
  );

  // Merge offline tracks, discovered tracks, queue tracks, and restored track, enriching with LRCLIB lyrics & download state
  const allKnownTracks = useMemo(() => {
    const map = new Map<string, Track>();
    if (initialCentralState?.currentTrack) {
      map.set(initialCentralState.currentTrack.id, initialCentralState.currentTrack);
    }
    for (const t of offlineTracks) map.set(t.id, t);
    for (const t of discoveredTracks) map.set(t.id, t);
    for (const t of queue) map.set(t.id, t);

    return Array.from(map.values()).map((t) => {
      const cachedLyrics = lyricsByTrackId[t.id];
      const isLoadingLyrics = lyricsLoadingIds.has(t.id);
      const isDownloaded = downloadedTrackIds.has(t.id);
      return {
        ...t,
        downloaded: isDownloaded,
        lyrics: cachedLyrics !== undefined ? cachedLyrics : t.lyrics,
        lyricsLoading: isLoadingLyrics,
      };
    });
  }, [
    initialCentralState?.currentTrack,
    offlineTracks,
    discoveredTracks,
    queue,
    lyricsByTrackId,
    lyricsLoadingIds,
    downloadedTrackIds,
  ]);

  const downloadedTracksList = useMemo(() => {
    const knownMap = new Map(allKnownTracks.map((t) => [t.id, t]));
    return offlineTracks.map((t) => {
      const enriched = knownMap.get(t.id);
      return enriched ? { ...enriched, downloaded: true } : { ...t, downloaded: true };
    });
  }, [offlineTracks, allKnownTracks]);

  const activeTrack = useMemo<Track | null>(() => {
    if (!activeTrackId) return null;
    return (
      allKnownTracks.find((t) => t.id === activeTrackId) ??
      queue.find((t) => t.id === activeTrackId) ??
      null
    );
  }, [allKnownTracks, queue, activeTrackId]);

  const effectiveTrack = useMemo<Track | null>(() => {
    if (!activeTrack) return null;
    if (liveDuration > 0 && Number.isFinite(liveDuration)) {
      return { ...activeTrack, duration: liveDuration };
    }
    return activeTrack;
  }, [activeTrack, liveDuration]);

  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;
  const lyricsByTrackIdRef = useRef(lyricsByTrackId);
  lyricsByTrackIdRef.current = lyricsByTrackId;
  const lyricsFetchTrackRef = useRef<string | null>(null);
  const hasActiveTrack = Boolean(activeTrack);
  const hasEmbeddedLyrics = Boolean(activeTrack && activeTrack.lyrics.length > 0);

  // Fetch real time-synced lyrics from LRCLIB once per track ID (strict 2500ms timeout, no self-abort loop)
  useEffect(() => {
    const track = activeTrackRef.current;
    if (!hasActiveTrack || !track || hasEmbeddedLyrics) return;
    const trackId = track.id;
    if (
      lyricsByTrackIdRef.current[trackId] !== undefined ||
      lyricsFetchTrackRef.current === trackId
    ) {
      return;
    }

    lyricsFetchTrackRef.current = trackId;
    const controller = new AbortController();

    setLyricsLoadingIds((prev) => {
      if (prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });

    void fetchSyncedLyrics(track.title, track.artist, controller.signal, trackId)
      .then((lines) => {
        if (controller.signal.aborted) return;
        setLyricsByTrackId((prev) => {
          if (prev[trackId] !== undefined) return prev;
          return { ...prev, [trackId]: lines };
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLyricsByTrackId((prev) =>
            prev[trackId] !== undefined ? prev : { ...prev, [trackId]: [] },
          );
        }
      })
      .finally(() => {
        if (lyricsFetchTrackRef.current === trackId && controller.signal.aborted) {
          lyricsFetchTrackRef.current = null;
        }
        setLyricsLoadingIds((prev) => {
          if (!prev.has(trackId)) return prev;
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
      });

    return () => {
      controller.abort();
    };
  }, [activeTrackId, hasActiveTrack, hasEmbeddedLyrics]);

  // Accumulate real listening seconds every 5s while actively playing
  useEffect(() => {
    if (!isPlaying || !activeTrack || preferences.privateSession) return;

    const timer = window.setInterval(() => {
      const todayKey = getLocalDateKey();
      const jsDay = new Date().getDay();
      const monSunIdx = jsDay === 0 ? 6 : jsDay - 1;
      const deltaMinutes = 5 / 60;

      setListeningStats((prev) => {
        const nextDailyByDate = {
          ...(prev.dailyMinutesByDate ?? {}),
          [todayKey]: (prev.dailyMinutesByDate?.[todayKey] ?? 0) + deltaMinutes,
        };
        const nextDaily = [...(prev.dailyMinutes.length === 7 ? prev.dailyMinutes : [0, 0, 0, 0, 0, 0, 0])];
        nextDaily[monSunIdx] = (nextDaily[monSunIdx] ?? 0) + deltaMinutes;

        const nextDates = prev.activeDates?.includes(todayKey)
          ? prev.activeDates
          : [...(prev.activeDates ?? []), todayKey];

        const nextEvents = [...(prev.playEvents ?? [])];
        if (nextEvents.length > 0) {
          nextEvents[0] = {
            ...nextEvents[0],
            seconds: (nextEvents[0].seconds ?? 0) + 5,
          };
        }

        return {
          ...prev,
          dailyMinutes: nextDaily,
          dailyMinutesByDate: nextDailyByDate,
          activeDates: nextDates,
          playEvents: nextEvents,
          streakDays: computeStreakDays(nextDates),
        };
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isPlaying, activeTrack, preferences.privateSession]);

  // Register newly discovered real external tracks into state pool
  const handleRegisterDiscoveredTracks = useCallback((incoming: Track[]) => {
    if (incoming.length === 0) return;
    setDiscoveredTracks((prev) => {
      const map = new Map<string, Track>();
      for (const t of prev) map.set(t.id, t);
      let added = false;
      for (const t of incoming) {
        if (!map.has(t.id)) {
          added = true;
          map.set(t.id, t);
        }
      }
      if (!added) return prev;
      return Array.from(map.values()).slice(-180);
    });
  }, []);

  // Centralized localStorage persistence (klyn_app_state_v1)
  useEffect(() => {
    saveCentralizedAppState({
      user: currentUser,
      likedTrackIds: Array.from(favoriteIds),
      playlists,
      likedSongsCustomization,
      followedArtistIds: Array.from(followedArtists),
      queue,
      currentTrack: activeTrack,
      isPlaying,
      currentTime,
      listeningStats,
      settings: preferences,
      activeDeviceId,
      socialUsers,
      discoveredTracks,
    });
  }, [
    currentUser,
    favoriteIds,
    playlists,
    likedSongsCustomization,
    followedArtists,
    queue,
    activeTrack,
    isPlaying,
    currentTime,
    listeningStats,
    preferences,
    activeDeviceId,
    socialUsers,
    discoveredTracks,
  ]);

  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;
  const allKnownTracksRef = useRef(allKnownTracks);
  allKnownTracksRef.current = allKnownTracks;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // Multi-tab BroadcastChannel sync for Listen Party track switches & Blend updates
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('klyn_social_sync');
    broadcastRef.current = channel;
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: 'party-track'; trackId: string; actorName: string }
        | { type: 'party-toggle-play'; isPlaying: boolean };
      if (!data) return;
      if (data.type === 'party-track') {
        const partyTrack = allKnownTracksRef.current.find((t) => t.id === data.trackId);
        setActiveTrackId(data.trackId);
        setCurrentTime(0);
        setLiveDuration(0);
        setIsPlaying(true);
        if (partyTrack) {
          void playerEngine.playTrack(partyTrack, 0);
        }
      } else if (data.type === 'party-toggle-play') {
        setIsPlaying(data.isPlaying);
        if (data.isPlaying) {
          if (playerEngine.getSource() === 'idle' && activeTrackRef.current) {
            void playerEngine.playTrack(activeTrackRef.current, currentTimeRef.current);
          } else {
            void playerEngine.resume();
          }
        } else {
          playerEngine.pause();
        }
      }
    };
    return () => {
      channel.close();
      broadcastRef.current = null;
    };
  }, []);

  // Keep player volume synced with user audio normalization preference
  useEffect(() => {
    playerEngine.setVolume(preferences.normalizeVolume ? 0.85 : 0.96);
  }, [preferences.normalizeVolume]);

  const isVerifiedFirebaseSession = useCallback(() => {
    return Boolean(
      isFirebaseConfigured &&
        auth &&
        currentUser?.uid &&
        auth.currentUser?.uid === currentUser.uid &&
        !auth.currentUser.isAnonymous,
    );
  }, [currentUser?.uid]);

  const hydrateFirebaseUserSession = useCallback(
    async (
      firebaseUser: FirebaseUser,
      showWelcomeToast: boolean,
      meta?: { name?: string; handle?: string; authProvider?: 'google' | 'email' },
    ) => {
      const uid = firebaseUser.uid;
      if (!uid || !isMountedRef.current) return;
      const sessionEpoch = authSessionEpochRef.current;

      if (meta) {
        pendingAuthMetaRef.current = meta;
      }

      // If onAuthStateChanged started hydrating this same uid, await it cleanly instead of skipping early
      if (activeHydrationUidRef.current === uid && activeHydrationPromiseRef.current) {
        try {
          await activeHydrationPromiseRef.current;
        } catch {
          // Continue to ensure currentUser is set cleanly
        }
      }

      if (!isMountedRef.current || authSessionEpochRef.current !== sessionEpoch) return;

      // Already hydrated for this uid — merge any fresh signup metadata & ensure user state is active
      if (hydratedFirebaseUidRef.current === uid) {
        if (meta?.name || meta?.handle || meta?.authProvider) {
          setCurrentUser((prev) => {
            if (!prev || prev.uid !== uid) return prev;
            const cleanName = meta.name?.trim() || prev.name;
            const rawH = meta.handle?.trim();
            const cleanHandle = rawH
              ? rawH.startsWith('@')
                ? rawH
                : `@${rawH}`
              : prev.handle;
            return {
              ...prev,
              name: cleanName,
              initials: computeInitials(cleanName),
              handle: cleanHandle,
              authProvider: meta.authProvider ?? prev.authProvider,
            };
          });
        }
        return;
      }

      const resolvedMeta = meta ?? pendingAuthMetaRef.current ?? undefined;
      const provider: 'google' | 'email' =
        resolvedMeta?.authProvider ??
        (firebaseUser.providerData.some((p) => p.providerId === 'google.com')
          ? 'google'
          : 'email');
      const displayName =
        resolvedMeta?.name?.trim() ||
        firebaseUser.displayName?.trim() ||
        firebaseUser.email?.split('@')[0] ||
        'Listener';
      const rawHandle = resolvedMeta?.handle?.trim();
      const cleanHandle = rawHandle
        ? rawHandle.startsWith('@')
          ? rawHandle
          : `@${rawHandle}`
        : `@${displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'listener'}`;

      const fallbackUser: UserAccount = {
        id: uid,
        uid,
        authProvider: provider,
        name: displayName,
        handle: cleanHandle,
        email: firebaseUser.email ?? 'listener@klyn.audio',
        initials: computeInitials(displayName),
        avatarUrl: firebaseUser.photoURL ?? undefined,
        avatarStyle: 'monogram',
        accentColor: '#C27838',
        favoriteGenres: ['Electronic', 'Spatial'],
        hasCompletedOnboarding: false,
        createdAt: new Date().toISOString(),
      };

      const runHydration = async () => {
        try {
          const hydrated = await hydrateUserFromFirestore(uid, fallbackUser, {
            likedTrackIds: Array.from(favoriteIds),
            followedArtistIds: Array.from(followedArtists),
            downloadedTrackIds: offlineTracks.map((t) => t.id),
            preferences,
            likedSongsCustomization,
            activeDeviceId,
            listeningStats,
          });

          if (!isMountedRef.current || authSessionEpochRef.current !== sessionEpoch) return;

          hydratedFirebaseUidRef.current = uid;
          pendingAuthMetaRef.current = null;
          setCurrentUser(hydrated.user);

          if (!hydrated.isNewUser) {
            const nextPrefs = hydrated.preferences
              ? { ...preferences, ...hydrated.preferences }
              : preferences;
            const nextLikedCust =
              hydrated.likedSongsCustomization ?? likedSongsCustomization;
            const nextDevice =
              hydrated.activeDeviceId && hydrated.activeDeviceId !== 'web-studio'
                ? hydrated.activeDeviceId
                : activeDeviceId;
            const nextStats = hydrated.listeningStats ?? listeningStats;

            lastSyncedFingerprintRef.current = JSON.stringify({
              user: hydrated.user,
              likedTrackIds: hydrated.likedTrackIds,
              followedArtistIds: hydrated.followedArtistIds,
              downloadedTrackIds: hydrated.downloadedTrackIds,
              preferences: nextPrefs,
              likedSongsCustomization: nextLikedCust,
              activeDeviceId: nextDevice,
              listeningStats: nextStats,
            });

            setPlaylists(hydrated.playlists);
            setFavoriteIds(new Set(hydrated.likedTrackIds));
            setFollowedArtists(new Set(hydrated.followedArtistIds));
            setSocialUsers(
              Array.from(new Map(hydrated.socialUsers.map((u) => [u.id, u])).values()),
            );
            if (hydrated.preferences) {
              setPreferences((prev) => ({ ...prev, ...hydrated.preferences }));
            }
            if (hydrated.likedSongsCustomization) {
              setLikedSongsCustomization(hydrated.likedSongsCustomization);
            }
            if (nextDevice) {
              setActiveDeviceId(nextDevice);
            }
            if (hydrated.listeningStats) {
              setListeningStats(hydrated.listeningStats);
            }

            if (hydrated.downloadedTracks.length > 0) {
              handleRegisterDiscoveredTracks(hydrated.downloadedTracks);
              for (const dlTrack of hydrated.downloadedTracks) {
                void saveOfflineDownloadedTrack(dlTrack).catch(() => {});
              }
              setOfflineTracks((prev) => {
                const map = new Map<string, Track>();
                for (const t of hydrated.downloadedTracks) map.set(t.id, { ...t, downloaded: true });
                for (const t of prev) {
                  if (!map.has(t.id)) map.set(t.id, { ...t, downloaded: true });
                }
                return Array.from(map.values());
              });
            }
          } else {
            lastSyncedFingerprintRef.current = JSON.stringify({
              user: hydrated.user,
              likedTrackIds: Array.from(favoriteIds),
              followedArtistIds: Array.from(followedArtists),
              downloadedTrackIds: offlineTracks.map((t) => t.id),
              preferences,
              likedSongsCustomization,
              activeDeviceId,
              listeningStats,
            });
          }

          if (showWelcomeToast && hydrated.user.hasCompletedOnboarding) {
            showToast(`Welcome back to klyn, ${hydrated.user.name.split(' ')[0]}`);
            if (activeTrackRef.current) {
              void playerEngine.playTrack(activeTrackRef.current, currentTimeRef.current).catch(() => {});
            }
          }
        } catch (err) {
          if (!isMountedRef.current || authSessionEpochRef.current !== sessionEpoch) return;
          if (!isFirestoreOfflineError(err)) {
            console.warn('Firestore hydration fallback active:', err);
          }
          const localCached = loadLocalUserCache(uid);
          const recoveredUser = localCached?.user ?? fallbackUser;
          hydratedFirebaseUidRef.current = uid;
          pendingAuthMetaRef.current = null;
          setCurrentUser(recoveredUser);
          if (localCached?.preferences) {
            setPreferences((prev) => ({ ...prev, ...localCached.preferences }));
          }
          if (localCached?.likedTrackIds?.length) {
            setFavoriteIds(new Set(localCached.likedTrackIds));
          }
          if (localCached?.followedArtistIds?.length) {
            setFollowedArtists(new Set(localCached.followedArtistIds));
          }
          if (localCached?.likedSongsCustomization) {
            setLikedSongsCustomization(localCached.likedSongsCustomization);
          }
          if (localCached?.listeningStats) {
            setListeningStats(localCached.listeningStats);
          }
        } finally {
          if (activeHydrationUidRef.current === uid) {
            activeHydrationUidRef.current = null;
            activeHydrationPromiseRef.current = null;
          }
        }
      };

      activeHydrationUidRef.current = uid;
      const promise = runHydration();
      activeHydrationPromiseRef.current = promise;
      await promise;
    },
    [
      favoriteIds,
      followedArtists,
      offlineTracks,
      preferences,
      likedSongsCustomization,
      activeDeviceId,
      listeningStats,
      handleRegisterDiscoveredTracks,
      showToast,
    ],
  );

  const hydrateFirebaseUserSessionRef = useRef(hydrateFirebaseUserSession);
  hydrateFirebaseUserSessionRef.current = hydrateFirebaseUserSession;

  // Test Firestore connection and restore active Firebase Auth session once on mount
  useEffect(() => {
    if (authListenerAttachedRef.current) return;
    if (!isFirebaseConfigured || !auth) return;
    authListenerAttachedRef.current = true;

    void testConnection().catch(() => false);

    let unsubscribe: () => void = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser && !firebaseUser.isAnonymous && isMountedRef.current) {
          void hydrateFirebaseUserSessionRef
            .current(firebaseUser, false)
            .catch((err) => {
              if (!isFirestoreOfflineError(err)) {
                console.warn('Firebase session restore fallback:', err);
              }
            });
        }
      });
    } catch {
      // Ignore restricted auth state observer errors
    }

    return () => {
      authListenerAttachedRef.current = false;
      try {
        unsubscribe();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  // Debounced Cloud Firestore profile & preferences sync (loop-guarded by payload fingerprint)
  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !currentUser?.uid) return;
    if (!auth.currentUser || auth.currentUser.uid !== currentUser.uid || auth.currentUser.isAnonymous) {
      return;
    }
    if (hydratedFirebaseUidRef.current !== currentUser.uid) {
      return;
    }

    const payload = {
      user: currentUser,
      likedTrackIds: Array.from(favoriteIds),
      followedArtistIds: Array.from(followedArtists),
      downloadedTrackIds: offlineTracks.map((t) => t.id),
      preferences,
      likedSongsCustomization,
      activeDeviceId,
      listeningStats,
    };
    const fingerprint = JSON.stringify(payload);
    if (fingerprint === lastSyncedFingerprintRef.current) {
      return;
    }

    const uid = currentUser.uid;
    const timer = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      lastSyncedFingerprintRef.current = fingerprint;
      void syncUserProfileToFirestore(uid, payload).catch((err) => {
        if (!isFirestoreOfflineError(err)) {
          console.error('Firestore profile sync failed:', err);
        }
      });
    }, 850);

    return () => window.clearTimeout(timer);
  }, [
    currentUser,
    favoriteIds,
    followedArtists,
    offlineTracks,
    preferences,
    likedSongsCustomization,
    activeDeviceId,
    listeningStats,
  ]);

  const handleAuthenticate = useCallback(
    (account: UserAccount) => {
      setCurrentUser(account);
      if (account.hasCompletedOnboarding) {
        showToast(`Welcome back to klyn, ${account.name.split(' ')[0]}`);
        if (activeTrackRef.current) {
          void playerEngine.playTrack(activeTrackRef.current, currentTimeRef.current);
        }
      }
    },
    [showToast],
  );

  const handleFirebaseAuthenticate = useCallback(
    async (
      firebaseUser: FirebaseUser,
      meta?: { name?: string; handle?: string; authProvider?: 'google' | 'email' },
    ) => {
      await hydrateFirebaseUserSession(firebaseUser, true, meta);
    },
    [hydrateFirebaseUserSession],
  );

  const handleCompleteOnboarding = useCallback(
    (updatedUser: UserAccount, updatedPrefs: Partial<UserPreferences>) => {
      setCurrentUser(updatedUser);
      setPreferences((prev) => ({ ...prev, ...updatedPrefs }));
      setIsReplayOnboardingOpen(false);
      showToast(`Your klyn soundstage is ready, ${updatedUser.name.split(' ')[0]}`);
    },
    [showToast],
  );

  const handleSignOut = useCallback(() => {
    authSessionEpochRef.current += 1;
    playerEngine.pause();
    hydratedFirebaseUidRef.current = null;
    activeHydrationUidRef.current = null;
    activeHydrationPromiseRef.current = null;
    pendingAuthMetaRef.current = null;
    lastSyncedFingerprintRef.current = '';
    clearActiveUserSession();
    void signOutFirebase().catch(() => {
      // ignore sign-out errors if running local profile
    });
    setCurrentUser(null);
    setIsReplayOnboardingOpen(false);
    setIsPlayerOpen(false);
    setIsSettingsOpen(false);
    setIsPlaying(false);
  }, []);

  const handleSelectDevice = useCallback((deviceId: string) => {
    setActiveDeviceId(deviceId);
    if (deviceId === 'system-default') {
      void playerEngine.setAudioSinkId('default');
    } else if (deviceId.startsWith('audiooutput:')) {
      const sinkId = deviceId.slice('audiooutput:'.length);
      if (sinkId) void playerEngine.setAudioSinkId(sinkId);
    }
  }, []);

  const activePartyFriend = useMemo(
    () => socialUsers.find((u) => u.id === activePartyFriendId) ?? null,
    [socialUsers, activePartyFriendId],
  );

  const recordTrackPlay = useCallback(
    (track: Track) => {
      if (preferences.privateSession) return;
      handleRegisterDiscoveredTracks([track]);

      const nowTs = Date.now();
      const todayKey = getLocalDateKey(new Date(nowTs));

      setListeningStats((prev) => {
        const existing = prev.recentLog.find((item) => item.trackId === track.id);
        const rest = prev.recentLog.filter((item) => item.trackId !== track.id);
        const updatedEntry: ListeningLogEntry = {
          id: existing?.id ?? `log-${track.id}-${nowTs}`,
          trackId: track.id,
          playedAtLabel: 'Just now',
          playCount: (existing?.playCount ?? 0) + 1,
          timestamp: nowTs,
        };
        const updatedRecentLog = [updatedEntry, ...rest].slice(0, 20);
        const nextActiveDates = prev.activeDates?.includes(todayKey)
          ? prev.activeDates
          : [...(prev.activeDates ?? []), todayKey];

        const nextEvents = [
          {
            ts: nowTs,
            trackId: track.id,
            artist: track.artist,
            album: track.album,
            seconds: 0,
          },
          ...(prev.playEvents ?? []),
        ].slice(0, 500);

        return {
          ...prev,
          activeDates: nextActiveDates,
          playEvents: nextEvents,
          trackPlayCounts: {
            ...prev.trackPlayCounts,
            [track.id]: (prev.trackPlayCounts[track.id] ?? 0) + 1,
          },
          artistPlayCounts: {
            ...prev.artistPlayCounts,
            [track.artist]: (prev.artistPlayCounts[track.artist] ?? 0) + 1,
          },
          recentTrackIds: Array.from(new Set(updatedRecentLog.map((e) => e.trackId))),
          recentLog: updatedRecentLog,
          streakDays: computeStreakDays(nextActiveDates),
        };
      });
    },
    [preferences.privateSession, handleRegisterDiscoveredTracks],
  );

  const goToNextTrack = useCallback(() => {
    if (queue.length === 0) return;
    const currentIndex = activeTrack ? queue.findIndex((t) => t.id === activeTrack.id) : -1;

    if (isShuffled && queue.length > 1) {
      let nextIdx = currentIndex;
      while (nextIdx === currentIndex) {
        nextIdx = Math.floor(Math.random() * queue.length);
      }
      const nextTrack = queue[nextIdx];
      setActiveTrackId(nextTrack.id);
      setCurrentTime(0);
      setLiveDuration(0);
      setIsPlaying(true);
      recordTrackPlay(nextTrack);
      void playerEngine.playTrack(nextTrack, 0);
      return;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex];
      setActiveTrackId(nextTrack.id);
      setCurrentTime(0);
      setLiveDuration(0);
      setIsPlaying(true);
      recordTrackPlay(nextTrack);
      void playerEngine.playTrack(nextTrack, 0);
    } else if (repeatMode === 'all' || preferences.autoplaySimilar) {
      const nextTrack = queue[0];
      setActiveTrackId(nextTrack.id);
      setCurrentTime(0);
      setLiveDuration(0);
      setIsPlaying(true);
      recordTrackPlay(nextTrack);
      void playerEngine.playTrack(nextTrack, 0);
    } else {
      setCurrentTime(0);
      setIsPlaying(false);
      playerEngine.pause();
    }
  }, [queue, activeTrack, isShuffled, repeatMode, preferences.autoplaySimilar, recordTrackPlay]);

  const goToPrevTrack = useCallback(() => {
    if (queue.length === 0) return;
    if (currentTime > 4) {
      setCurrentTime(0);
      playerEngine.seekTo(0);
      return;
    }
    const currentIndex = activeTrack ? queue.findIndex((t) => t.id === activeTrack.id) : 0;
    const prevIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
    const prevTrack = queue[prevIndex];
    setActiveTrackId(prevTrack.id);
    setCurrentTime(0);
    setLiveDuration(0);
    setIsPlaying(true);
    recordTrackPlay(prevTrack);
    void playerEngine.playTrack(prevTrack, 0);
  }, [currentTime, queue, activeTrack, recordTrackPlay]);

  const goToNextTrackRef = useRef(goToNextTrack);
  goToNextTrackRef.current = goToNextTrack;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // Bind real-time playback events once via stable refs
  useEffect(() => {
    playerEngine.setCallbacks({
      onTimeUpdate: (time, duration) => {
        setCurrentTime(time);
        if (duration > 0 && Number.isFinite(duration)) {
          setLiveDuration(duration);
        }
      },
      onStateChange: (playing) => {
        setIsPlaying(playing);
      },
      onEnded: () => {
        if (repeatModeRef.current === 'one' && activeTrackRef.current) {
          setCurrentTime(0);
          void playerEngine.playTrack(activeTrackRef.current, 0);
        } else {
          goToNextTrackRef.current();
        }
      },
      onError: (message) => {
        showToastRef.current(message);
      },
    });
  }, []);

  const handlePlayTrack = useCallback(
    (track: Track, newQueueList?: Track[], startAtTime = 0, openFullPlayer = true) => {
      handleRegisterDiscoveredTracks([track]);
      if (newQueueList && newQueueList.length > 0) {
        const dedupedQueue = Array.from(
          new Map(newQueueList.map((item) => [item.id, item])).values(),
        );
        handleRegisterDiscoveredTracks(dedupedQueue);
        setQueue(dedupedQueue);
      } else {
        setQueue((prev) =>
          prev.some((t) => t.id === track.id) ? prev : [track, ...prev],
        );
      }
      setActiveTrackId(track.id);
      setCurrentTime(startAtTime);
      setLiveDuration(0);
      setIsPlaying(true);
      if (openFullPlayer) {
        setIsPlayerOpen(true);
      }
      recordTrackPlay(track);
      void playerEngine.playTrack(track, startAtTime);
      if (activePartyFriendId) {
        broadcastRef.current?.postMessage({
          type: 'party-track',
          trackId: track.id,
          actorName: currentUser?.name ?? 'You',
        });
      }
    },
    [recordTrackPlay, activePartyFriendId, currentUser, handleRegisterDiscoveredTracks],
  );

  const handleTogglePlay = useCallback(() => {
    if (!activeTrackRef.current) return;
    if (playerEngine.getSource() === 'idle') {
      setIsPlaying(true);
      void playerEngine.playTrack(activeTrackRef.current, currentTimeRef.current);
      if (activePartyFriendId) {
        broadcastRef.current?.postMessage({ type: 'party-toggle-play', isPlaying: true });
      }
      return;
    }

    const nextExpected = !playerEngine.getIsPlaying();
    setIsPlaying(nextExpected);
    void playerEngine.togglePlay();
    if (activePartyFriendId) {
      broadcastRef.current?.postMessage({
        type: 'party-toggle-play',
        isPlaying: nextExpected,
      });
    }
  }, [activePartyFriendId]);

  const handleSeek = useCallback(
    (time: number) => {
      const maxDur = effectiveTrack?.duration ?? 0;
      const clamped = maxDur > 0 ? Math.min(maxDur, Math.max(0, time)) : Math.max(0, time);
      setCurrentTime(clamped);
      playerEngine.seekTo(clamped);
    },
    [effectiveTrack?.duration],
  );

  const handleMediaPlay = useCallback(() => {
    if (!activeTrackRef.current) return;
    setIsPlaying(true);
    if (playerEngine.getSource() === 'idle') {
      void playerEngine.playTrack(activeTrackRef.current, currentTimeRef.current);
    } else {
      void playerEngine.resume();
    }
  }, []);

  const handleMediaPause = useCallback(() => {
    setIsPlaying(false);
    playerEngine.pause();
  }, []);

  const mediaSessionHandlersRef = useRef({
    onPlay: handleMediaPlay,
    onPause: handleMediaPause,
    onNext: goToNextTrack,
    onPrev: goToPrevTrack,
    onSeek: handleSeek,
  });
  mediaSessionHandlersRef.current = {
    onPlay: handleMediaPlay,
    onPause: handleMediaPause,
    onNext: goToNextTrack,
    onPrev: goToPrevTrack,
    onSeek: handleSeek,
  };

  // Register OS Media Session action handlers once via stable ref
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeSet = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Unsupported action on current platform
      }
    };

    safeSet('play', () => mediaSessionHandlersRef.current.onPlay());
    safeSet('pause', () => mediaSessionHandlersRef.current.onPause());
    safeSet('nexttrack', () => mediaSessionHandlersRef.current.onNext());
    safeSet('previoustrack', () => mediaSessionHandlersRef.current.onPrev());
    safeSet('seekto', (details) => {
      if (typeof details.seekTime === 'number' && Number.isFinite(details.seekTime)) {
        mediaSessionHandlersRef.current.onSeek(details.seekTime);
      }
    });
    safeSet('seekbackward', (details) => {
      const offset = details.seekOffset ?? 10;
      mediaSessionHandlersRef.current.onSeek(Math.max(0, currentTimeRef.current - offset));
    });
    safeSet('seekforward', (details) => {
      const offset = details.seekOffset ?? 10;
      mediaSessionHandlersRef.current.onSeek(currentTimeRef.current + offset);
    });

    return () => {
      safeSet('play', null);
      safeSet('pause', null);
      safeSet('nexttrack', null);
      safeSet('previoustrack', null);
      safeSet('seekto', null);
      safeSet('seekbackward', null);
      safeSet('seekforward', null);
    };
  }, []);

  // Update OS Media Session metadata & playbackState only when track identity, artwork, or play state changes
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    const trackKey = activeTrack
      ? `${activeTrack.id}::${activeTrack.title}::${activeTrack.artist}::${activeTrack.album}::${activeTrack.coverUrl}`
      : '';

    if (trackKey !== lastMediaMetadataKeyRef.current) {
      lastMediaMetadataKeyRef.current = trackKey;
      try {
        if (activeTrack && typeof MediaMetadata !== 'undefined') {
          const artwork: MediaImage[] = activeTrack.coverUrl
            ? [
                { src: activeTrack.coverUrl, sizes: '96x96', type: 'image/jpeg' },
                { src: activeTrack.coverUrl, sizes: '256x256', type: 'image/jpeg' },
                { src: activeTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' },
              ]
            : [];
          ms.metadata = new MediaMetadata({
            title: activeTrack.title,
            artist: activeTrack.artist,
            album: activeTrack.album,
            artwork,
          });
        } else {
          ms.metadata = null;
        }
      } catch {
        // Ignore MediaMetadata errors in unsupported frames
      }
    }

    const nextPlaybackState: 'playing' | 'paused' | 'none' = activeTrack
      ? isPlaying
        ? 'playing'
        : 'paused'
      : 'none';
    if (nextPlaybackState !== lastMediaPlaybackStateRef.current) {
      lastMediaPlaybackStateRef.current = nextPlaybackState;
      try {
        ms.playbackState = nextPlaybackState;
      } catch {
        // Ignore
      }
    }
  }, [
    activeTrack?.id,
    activeTrack?.title,
    activeTrack?.artist,
    activeTrack?.album,
    activeTrack?.coverUrl,
    isPlaying,
  ]);

  const handleToggleFavorite = useCallback((trackId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  // Offline App Downloads Management (IndexedDB + localStorage + Cloud Firestore)
  const handleToggleDownload = useCallback(
    (track: Track) => {
      const isAlreadyDownloaded = downloadedTrackIds.has(track.id);
      if (isAlreadyDownloaded) {
        setOfflineTracks((prev) => prev.filter((t) => t.id !== track.id));
        void removeOfflineDownloadedTrack(track.id);
        if (currentUser?.uid && isVerifiedFirebaseSession()) {
          void deleteDownloadFromFirestore(currentUser.uid, track.id).catch((err) => {
            console.error('Firestore delete download failed:', err);
          });
        }
        showToast(`Removed "${track.title}" from App Downloads`);
        return;
      }

      const downloadedCopy: Track = { ...track, downloaded: true };
      handleRegisterDiscoveredTracks([downloadedCopy]);
      setOfflineTracks((prev) => [
        downloadedCopy,
        ...prev.filter((t) => t.id !== downloadedCopy.id),
      ]);
      void saveOfflineDownloadedTrack(downloadedCopy);
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncDownloadToFirestore(currentUser.uid, downloadedCopy).catch((err) => {
          console.error('Firestore save download failed:', err);
        });
      }
      showToast(`Saved "${track.title}" to App Downloads`);
    },
    [
      downloadedTrackIds,
      currentUser?.uid,
      isVerifiedFirebaseSession,
      handleRegisterDiscoveredTracks,
      showToast,
    ],
  );

  const handleDownloadTracks = useCallback(
    (tracksToSave: Track[], label?: string) => {
      const fresh = tracksToSave.filter((t) => !downloadedTrackIds.has(t.id));
      if (fresh.length === 0) {
        showToast(
          label ? `"${label}" is already saved to App Downloads` : 'Tracks already saved to App Downloads',
        );
        return;
      }

      const copies = fresh.map((t) => ({ ...t, downloaded: true }));
      handleRegisterDiscoveredTracks(copies);
      setOfflineTracks((prev) => {
        const map = new Map<string, Track>();
        for (const c of copies) map.set(c.id, c);
        for (const p of prev) {
          if (!map.has(p.id)) map.set(p.id, p);
        }
        return Array.from(map.values());
      });

      for (const copy of copies) {
        void saveOfflineDownloadedTrack(copy);
        if (currentUser?.uid && isVerifiedFirebaseSession()) {
          void syncDownloadToFirestore(currentUser.uid, copy).catch((err) => {
            console.error('Firestore batch download failed:', err);
          });
        }
      }

      showToast(
        `Saved ${copies.length} ${copies.length === 1 ? 'track' : 'tracks'} to App Downloads`,
      );
    },
    [
      downloadedTrackIds,
      currentUser?.uid,
      isVerifiedFirebaseSession,
      handleRegisterDiscoveredTracks,
      showToast,
    ],
  );

  const handleClearDownloads = useCallback(() => {
    const idsToRemove = offlineTracks.map((t) => t.id);
    setOfflineTracks([]);
    void clearAllOfflineDownloadedTracks();
    if (currentUser?.uid && isVerifiedFirebaseSession()) {
      for (const trackId of idsToRemove) {
        void deleteDownloadFromFirestore(currentUser.uid, trackId).catch((err) => {
          console.error('Firestore clear download failed:', err);
        });
      }
    }
    showToast('Cleared all App Downloads');
  }, [offlineTracks, currentUser?.uid, isVerifiedFirebaseSession, showToast]);

  // Queue Management Handlers
  const handleAddToQueue = useCallback(
    (track: Track) => {
      handleRegisterDiscoveredTracks([track]);
      setQueue((prev) => {
        const activeIdx = prev.findIndex((t) => t.id === activeTrackId);
        const filtered = prev.filter((t) => t.id !== track.id);
        if (track.id === activeTrackId) return prev;
        const insertAt = activeIdx >= 0 ? activeIdx + 1 : filtered.length;
        const next = [...filtered];
        next.splice(Math.min(insertAt, next.length), 0, track);
        return next;
      });
      showToast(`Added "${track.title}" to Up Next`);
    },
    [activeTrackId, showToast, handleRegisterDiscoveredTracks],
  );

  const handleMoveQueueTrack = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const handleRemoveQueueTrack = useCallback(
    (index: number) => {
      setQueue((prev) => {
        const target = prev[index];
        if (!target || target.id === activeTrackId) return prev;
        const next = [...prev];
        next.splice(index, 1);
        showToast(`Removed "${target.title}" from queue`);
        return next;
      });
    },
    [activeTrackId, showToast],
  );

  const handleClearUpcomingQueue = useCallback(() => {
    setQueue((prev) => prev.filter((t) => t.id === activeTrackId));
    showToast('Cleared upcoming queue');
  }, [activeTrackId, showToast]);

  // Playlist & Liked Songs Handlers
  const handleToggleTrackInPlaylist = useCallback(
    (playlistId: string, track: Track) => {
      handleRegisterDiscoveredTracks([track]);
      const target = playlists.find((pl) => pl.id === playlistId);
      if (!target) return;

      const exists = target.trackIds.includes(track.id);
      const updatedTarget: PlaylistItem = {
        ...target,
        trackIds: exists
          ? target.trackIds.filter((id) => id !== track.id)
          : [...target.trackIds, track.id],
      };

      setPlaylists((prev) =>
        prev.map((pl) => (pl.id === playlistId ? updatedTarget : pl)),
      );
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncPlaylistToFirestore(currentUser.uid, updatedTarget).catch((err) => {
          console.error('Firestore playlist sync failed:', err);
        });
      }
      showToast(`${exists ? 'Removed from' : 'Added to'} "${target.title}"`);
    },
    [
      playlists,
      currentUser?.uid,
      isVerifiedFirebaseSession,
      showToast,
      handleRegisterDiscoveredTracks,
    ],
  );

  const handleCreatePlaylistWithTrack = useCallback(
    (title: string, track: Track) => {
      handleRegisterDiscoveredTracks([track]);
      const newPlaylist: PlaylistItem = {
        id: `pl-${Date.now()}`,
        title,
        curator: currentUser?.name ?? 'Personal Playlist',
        description: 'Custom Liquid Glass playlist',
        trackIds: [track.id],
        coverUrl: track.coverUrl,
        pinned: false,
        downloaded: false,
      };
      setPlaylists((prev) => [newPlaylist, ...prev]);
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncPlaylistToFirestore(currentUser.uid, newPlaylist).catch((err) => {
          console.error('Firestore playlist sync failed:', err);
        });
      }
      showToast(`Created "${title}" and added "${track.title}"`);
    },
    [currentUser, isVerifiedFirebaseSession, showToast, handleRegisterDiscoveredTracks],
  );

  const handleCreatePlaylistFromLibrary = useCallback(
    (payload: { title: string; description: string; coverUrl: string; trackIds: string[] }) => {
      const newPlaylist: PlaylistItem = {
        id: `pl-${Date.now()}`,
        title: payload.title,
        curator: currentUser?.name ?? 'Personal Playlist',
        description: payload.description,
        trackIds: Array.from(new Set(payload.trackIds)),
        coverUrl: payload.coverUrl,
        pinned: false,
        downloaded: false,
      };
      setPlaylists((prev) => [newPlaylist, ...prev]);
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncPlaylistToFirestore(currentUser.uid, newPlaylist).catch((err) => {
          console.error('Firestore playlist sync failed:', err);
        });
      }
      showToast(`Created playlist "${payload.title}"`);
    },
    [currentUser, isVerifiedFirebaseSession, showToast],
  );

  const handleTogglePinPlaylist = useCallback(
    (playlistId: string) => {
      const target = playlists.find((pl) => pl.id === playlistId);
      if (!target) return;
      const nextPinned = !target.pinned;
      const updatedTarget: PlaylistItem = { ...target, pinned: nextPinned };
      setPlaylists((prev) =>
        prev.map((pl) => (pl.id === playlistId ? updatedTarget : pl)),
      );
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncPlaylistToFirestore(currentUser.uid, updatedTarget).catch((err) => {
          console.error('Firestore playlist sync failed:', err);
        });
      }
      showToast(nextPinned ? `Pinned "${target.title}"` : `Unpinned "${target.title}"`);
    },
    [playlists, currentUser?.uid, isVerifiedFirebaseSession, showToast],
  );

  const handleTogglePinLikedSongs = useCallback(() => {
    setLikedSongsCustomization((prev) => {
      const nextPinned = !prev.pinned;
      showToast(nextPinned ? `Pinned "${prev.title}"` : `Unpinned "${prev.title}"`);
      return { ...prev, pinned: nextPinned };
    });
  }, [showToast]);

  const handleUpdatePlaylist = useCallback(
    (playlistId: string, patch: Partial<PlaylistItem>) => {
      const target = playlists.find((pl) => pl.id === playlistId);
      if (!target) return;
      const updatedTarget: PlaylistItem = { ...target, ...patch };
      setPlaylists((prev) =>
        prev.map((pl) => (pl.id === playlistId ? updatedTarget : pl)),
      );
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncPlaylistToFirestore(currentUser.uid, updatedTarget).catch((err) => {
          console.error('Firestore playlist sync failed:', err);
        });
      }
      showToast('Saved playlist customization');
    },
    [playlists, currentUser?.uid, isVerifiedFirebaseSession, showToast],
  );

  const handleUpdateLikedSongsCustomization = useCallback(
    (patch: Partial<LikedSongsCustomization>) => {
      setLikedSongsCustomization((prev) => ({ ...prev, ...patch }));
      showToast('Saved Liked Songs customization');
    },
    [showToast],
  );

  // Artist Follow Handler
  const handleToggleFollow = useCallback(
    (artistName: string) => {
      setFollowedArtists((prev) => {
        const next = new Set(prev);
        if (next.has(artistName)) {
          next.delete(artistName);
          showToast(`Unfollowed ${artistName}`);
        } else {
          next.add(artistName);
          setPreferences((p) => ({ ...p, notifyNewReleases: true }));
          showToast(`Following ${artistName} — you'll get notified on new releases`);
        }
        return next;
      });
    },
    [showToast],
  );

  // Social / Friends / Add Real Friend / Instant Blend / Listen Party Handlers
  const handleToggleFriend = useCallback(
    (userId: string) => {
      const target = socialUsers.find((u) => u.id === userId);
      if (!target) return;
      const nextFriend = !target.isFriend;
      const updatedTarget: SocialUser = { ...target, isFriend: nextFriend };
      setSocialUsers((prev) =>
        prev.map((u) => (u.id === userId ? updatedTarget : u)),
      );
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncFriendToFirestore(currentUser.uid, updatedTarget).catch((err) => {
          console.error('Firestore friend sync failed:', err);
        });
      }
      showToast(
        nextFriend ? `Added ${target.name} as a friend` : `Removed ${target.name} from friends`,
      );
    },
    [socialUsers, currentUser?.uid, isVerifiedFirebaseSession, showToast],
  );

  const handleAddCustomFriend = useCallback(
    (nameOrHandle: string, prebuilt?: SocialUser) => {
      const raw = nameOrHandle.trim().replace(/^@+/, '');
      if (!raw && !prebuilt) return;
      const handle =
        prebuilt?.handle ?? `@${raw.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'friend'}`;
      const displayName =
        prebuilt?.name ??
        raw
          .split(/[\s._-]+/)
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');
      const initials =
        prebuilt?.initials ??
        (displayName
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0].toUpperCase())
          .join('') || 'FR');

      const existing = socialUsers.find(
        (u) =>
          (prebuilt && u.id === prebuilt.id) ||
          u.handle.toLowerCase() === handle.toLowerCase(),
      );

      const syncedEntry: SocialUser = existing
        ? { ...existing, isFriend: true }
        : prebuilt
          ? { ...prebuilt, isFriend: true }
          : {
              id: `friend-${Date.now()}`,
              name: displayName || raw,
              handle,
              initials,
              isFriend: true,
              isOnline: true,
              currentTrackId: activeTrackRef.current?.id ?? '',
              lastActiveLabel: 'Added just now',
              topTrackIds: allKnownTracksRef.current.slice(0, 3).map((t) => t.id),
              tasteMatchPct: 86,
              accentColor: '#7D2332',
            };

      setSocialUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === syncedEntry.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = syncedEntry;
          return next;
        }
        return [syncedEntry, ...prev];
      });
      if (currentUser?.uid && isVerifiedFirebaseSession()) {
        void syncFriendToFirestore(currentUser.uid, syncedEntry).catch((err) => {
          console.error('Firestore friend sync failed:', err);
        });
      }
      showToast(`Added ${displayName || handle} to friends`);
    },
    [socialUsers, currentUser?.uid, isVerifiedFirebaseSession, showToast],
  );

  const handleReactToFriend = useCallback(
    (userId: string, reaction: string) => {
      setSocialUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          const nextReaction = u.reaction ? undefined : reaction;
          if (nextReaction) showToast(`Sent reaction to ${u.name}`);
          return { ...u, reaction: nextReaction };
        }),
      );
    },
    [showToast],
  );

  const handleRequestBlendPopup = useCallback((friend: SocialUser) => {
    setPendingInvitePopup({
      type: 'blend',
      id: `inv-blend-${Date.now()}`,
      friend,
      matchPct: friend.tasteMatchPct,
      sentAtLabel: 'Just now',
    });
  }, []);

  const handleRequestListenPartyPopup = useCallback(
    (friend: SocialUser) => {
      const friendTrack =
        allKnownTracks.find((t) => t.id === friend.currentTrackId) ??
        activeTrack ??
        allKnownTracks[0];
      if (!friendTrack) {
        showToast('Play or load a track first to start a Listen Party');
        return;
      }
      setPendingInvitePopup({
        type: 'listen-party',
        id: `inv-party-${Date.now()}`,
        friend,
        track: friendTrack,
        sentAtLabel: 'Just now',
      });
    },
    [allKnownTracks, activeTrack, showToast],
  );

  const handleAcceptInvitePopup = useCallback(
    (invite: PendingInvitePopup) => {
      if (!currentUser) return;

      if (invite.type === 'blend') {
        const result = generateKlynAiBlend({
          user: currentUser,
          friend: invite.friend,
          tracks: allKnownTracks,
          favoriteIds,
          playCounts: listeningStats.trackPlayCounts,
        });

        setPlaylists((prev) => [result.playlist, ...prev]);
        if (currentUser.uid && isVerifiedFirebaseSession()) {
          void syncPlaylistToFirestore(currentUser.uid, result.playlist).catch((err) => {
            console.error('Firestore blend playlist sync failed:', err);
          });
        }

        setSocialUsers((prev) =>
          prev.map((u) => {
            if (u.id !== invite.friend.id) return u;
            const existing = u.sharedLibraryPlaylists ?? [];
            return {
              ...u,
              sharedLibraryPlaylists: [
                {
                  id: result.playlist.id,
                  title: result.playlist.title,
                  matchPct: result.matchPct,
                  trackIds: result.playlist.trackIds,
                  createdAtLabel: 'Just now',
                },
                ...existing,
              ],
            };
          }),
        );

        setPendingInvitePopup(null);
        showToast(
          `Klyn AI saved "${result.playlist.title}" to both your and ${invite.friend.name.split(' ')[0]}'s libraries`,
        );
      } else {
        setActivePartyFriendId(invite.friend.id);
        handlePlayTrack(invite.track, allKnownTracks, 0, false);
        setPartyMessages((prev) => [
          ...prev,
          {
            id: `pm-join-${Date.now()}`,
            sender: invite.friend.name,
            text: `Accepted Listen Party · listening in sync to ${invite.track.title}.`,
            timeLabel: 'Just now',
          },
        ]);
        setPendingInvitePopup(null);
        showToast(`Listen Party live with ${invite.friend.name}`);
      }
    },
    [
      currentUser,
      isVerifiedFirebaseSession,
      allKnownTracks,
      favoriteIds,
      listeningStats.trackPlayCounts,
      handlePlayTrack,
      showToast,
    ],
  );

  const handleDeclineInvitePopup = useCallback(
    (invite: PendingInvitePopup) => {
      setPendingInvitePopup(null);
      showToast(
        `${invite.friend.name.split(' ')[0]} declined the ${
          invite.type === 'blend' ? 'Blend' : 'Listen Party'
        } invite`,
      );
    },
    [showToast],
  );

  const handleSwitchPartyTrack = useCallback(
    (track: Track, actorName: string) => {
      handlePlayTrack(track, allKnownTracks, 0, false);
      setPartyMessages((prev) => [
        ...prev,
        {
          id: `pm-switch-${Date.now()}`,
          sender: actorName,
          text: `Switched synced song to "${track.title}" by ${track.artist}`,
          timeLabel: 'Just now',
        },
      ]);
      showToast(`${actorName} switched party track to "${track.title}"`);
    },
    [handlePlayTrack, allKnownTracks, showToast],
  );

  const handleSendPartyMessage = useCallback(
    (text: string) => {
      const msg: ListenPartyMessage = {
        id: `pm-${Date.now()}`,
        sender: currentUser?.name.split(' ')[0] ?? 'You',
        text,
        timeLabel: 'Just now',
      };
      setPartyMessages((prev) => [...prev, msg]);
    },
    [currentUser],
  );

  const handleSaveBlendPlaylist = useCallback(
    (friend: SocialUser, trackIds: string[], matchPct: number) => {
      if (!currentUser) return;
      const title = `Blend · ${currentUser.name.split(' ')[0]} + ${friend.name.split(' ')[0]}`;
      const existing = playlists.find((p) => p.title === title);
      if (existing) {
        showToast(`"${title}" is already in your Library`);
        return;
      }
      const coverTrack =
        allKnownTracks.find((t) => t.id === friend.currentTrackId) ??
        allKnownTracks.find((t) => trackIds.includes(t.id)) ??
        activeTrack;

      const blendPlaylist: PlaylistItem = {
        id: `pl-blend-${Date.now()}`,
        title,
        curator: `klyn Blend · ${matchPct}% Match`,
        description: `Shared favorites with ${friend.name}`,
        trackIds,
        coverUrl: coverTrack?.coverUrl ?? '',
        pinned: true,
        downloaded: false,
      };
      setPlaylists((prev) => [blendPlaylist, ...prev]);
      if (currentUser.uid && isVerifiedFirebaseSession()) {
        void syncPlaylistToFirestore(currentUser.uid, blendPlaylist).catch((err) => {
          console.error('Firestore blend playlist sync failed:', err);
        });
      }
      showToast(`Saved "${title}" to Library`);
    },
    [
      currentUser,
      isVerifiedFirebaseSession,
      playlists,
      allKnownTracks,
      activeTrack,
      showToast,
    ],
  );

  const handleCycleRepeat = useCallback(() => {
    setRepeatMode((prev) => (prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off'));
  }, []);

  const handleFilterChange = useCallback((filter: TopFilterTab) => {
    setTopFilter(filter);
    setSelectedArtistName(null);
    if (filter !== 'All') {
      setActiveNav((prev) =>
        prev === 'Search' || prev === 'Library' || prev === 'Activity' ? 'Home' : prev,
      );
    }
  }, []);

  const handleNavChange = useCallback((nav: NavTab) => {
    setSelectedArtistName(null);
    setActiveNav(nav);
  }, []);

  const handleUpdatePreferences = useCallback((patch: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateUser = useCallback(
    (updatedUser: UserAccount) => {
      setCurrentUser(updatedUser);
      showToast('Profile updated');
    },
    [showToast],
  );

  const audioStatusLabel = [
    preferences.streamingQuality,
    preferences.spatialEnabled ? 'Spatial Audio' : 'Stereo',
  ].join(' · ');

  const scrollMainToTop = useCallback(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    scrollMainToTop();
  }, [activeNav, selectedArtistName, currentUser?.hasCompletedOnboarding, scrollMainToTop]);

  // 1. MANDATORY FIRST-ENTRY LOG IN / SIGN UP GATE
  if (!currentUser) {
    return (
      <AuthGateScreen
        onAuthenticate={handleAuthenticate}
        onFirebaseAuthenticate={handleFirebaseAuthenticate}
      />
    );
  }

  // 2. FIRST-TIME OR REPLAYED ONBOARDING FLOW
  if (!currentUser.hasCompletedOnboarding || isReplayOnboardingOpen) {
    return (
      <OnboardingFlow
        user={currentUser}
        preferences={preferences}
        isReplay={isReplayOnboardingOpen && currentUser.hasCompletedOnboarding}
        onCancelReplay={() => setIsReplayOnboardingOpen(false)}
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  const ambientPrimary = activeTrack?.primaryColor ?? '#27272a';
  const ambientSecondary = activeTrack?.secondaryColor ?? '#09090b';

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#000000] text-white">
      {/* Adaptive Ambient Glow */}
      <div
        aria-hidden="true"
        className="ambient-glow-transition pointer-events-none fixed inset-0 z-0 opacity-[0.24] blur-[120px]"
        style={{
          background: `radial-gradient(circle at 50% 15%, ${ambientPrimary} 0%, ${ambientSecondary} 42%, #000000 82%)`,
        }}
      />

      {/* Unified Upper Floating Pill Bar */}
      <TopBar
        activeFilter={topFilter}
        onFilterChange={handleFilterChange}
        onOpenProfile={() => setIsSettingsOpen(true)}
        isProfileOpen={isSettingsOpen}
        userName={currentUser.name}
        userInitials={currentUser.initials}
        userAvatarUrl={currentUser.avatarUrl}
        userAvatarStyle={currentUser.avatarStyle}
        userAccentColor={currentUser.accentColor}
      />

      {/* Main Responsive Scroll Canvas */}
      <main
        ref={mainScrollRef}
        className="glass-scroll relative z-10 h-full w-full overflow-y-auto scroll-pt-24 scroll-pb-52"
      >
        <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8 pt-[calc(5.25rem+env(safe-area-inset-top))] sm:pt-24 pb-[calc(12.5rem+env(safe-area-inset-bottom))] sm:pb-48">
          {selectedArtistName ? (
            <ArtistProfileView
              artistName={selectedArtistName}
              tracks={allKnownTracks}
              activeTrackId={activeTrack?.id ?? ''}
              isPlaying={isPlaying}
              isFollowing={followedArtists.has(selectedArtistName)}
              favoriteIds={favoriteIds}
              downloadedTrackIds={downloadedTrackIds}
              onBack={() => setSelectedArtistName(null)}
              onToggleFollow={handleToggleFollow}
              onPlayTrack={handlePlayTrack}
              onTogglePlay={handleTogglePlay}
              onOpenPlayer={() => setIsPlayerOpen(true)}
              onToggleFavorite={handleToggleFavorite}
              onToggleDownload={handleToggleDownload}
              onOpenAddToPlaylist={setPlaylistModalTrack}
              onRegisterTracks={handleRegisterDiscoveredTracks}
            />
          ) : (
            <>
              {activeNav === 'Home' && (
                <HomeView
                  tracks={allKnownTracks}
                  currentUser={currentUser}
                  favoriteIds={favoriteIds}
                  playCounts={listeningStats.trackPlayCounts}
                  artistPlayCounts={listeningStats.artistPlayCounts}
                  playlists={playlists}
                  recentLog={listeningStats.recentLog}
                  followedArtists={followedArtists}
                  topFilter={topFilter}
                  activeTrackId={activeTrack?.id ?? ''}
                  isPlaying={isPlaying}
                  audioQuality={audioStatusLabel}
                  onPlayTrack={handlePlayTrack}
                  onTogglePlay={handleTogglePlay}
                  onOpenPlayer={() => setIsPlayerOpen(true)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenArtist={setSelectedArtistName}
                  onOpenAddToPlaylist={setPlaylistModalTrack}
                  onRegisterTracks={handleRegisterDiscoveredTracks}
                />
              )}

              {activeNav === 'Activity' && (
                <ActivityView
                  tracks={allKnownTracks}
                  currentUser={currentUser}
                  listeningStats={listeningStats}
                  recentLog={listeningStats.recentLog}
                  favoriteIds={favoriteIds}
                  activeTrackId={activeTrack?.id ?? ''}
                  activeTrack={effectiveTrack}
                  isPlaying={isPlaying}
                  socialUsers={socialUsers}
                  partyMessages={partyMessages}
                  activePartyFriend={activePartyFriend}
                  onPlayTrack={handlePlayTrack}
                  onTogglePlay={handleTogglePlay}
                  onOpenPlayer={() => setIsPlayerOpen(true)}
                  onOpenArtist={setSelectedArtistName}
                  onOpenAddToPlaylist={setPlaylistModalTrack}
                  onToggleFriend={handleToggleFriend}
                  onAddCustomFriend={handleAddCustomFriend}
                  onReactToFriend={handleReactToFriend}
                  onRequestListenPartyPopup={handleRequestListenPartyPopup}
                  onRequestBlendPopup={handleRequestBlendPopup}
                  onEndListenParty={() => {
                    setActivePartyFriendId(null);
                    showToast('Left Listen Party');
                  }}
                  onSwitchPartyTrack={handleSwitchPartyTrack}
                  onSendPartyMessage={handleSendPartyMessage}
                  onSaveBlendPlaylist={handleSaveBlendPlaylist}
                  onSubPageChange={scrollMainToTop}
                />
              )}

              {activeNav === 'Search' && (
                <SearchView
                  tracks={allKnownTracks}
                  activeTrackId={activeTrack?.id ?? ''}
                  isPlaying={isPlaying}
                  downloadedTrackIds={downloadedTrackIds}
                  onPlayTrack={handlePlayTrack}
                  onTogglePlay={handleTogglePlay}
                  onOpenPlayer={() => setIsPlayerOpen(true)}
                  onOpenArtist={setSelectedArtistName}
                  onOpenAddToPlaylist={setPlaylistModalTrack}
                  onToggleDownload={handleToggleDownload}
                  onRegisterTracks={handleRegisterDiscoveredTracks}
                />
              )}

              {activeNav === 'Library' && (
                <LibraryView
                  tracks={allKnownTracks}
                  playlists={playlists}
                  likedSongsCustomization={likedSongsCustomization}
                  activeTrackId={activeTrack?.id ?? ''}
                  isPlaying={isPlaying}
                  favoriteIds={favoriteIds}
                  followedArtists={followedArtists}
                  downloadedTrackIds={downloadedTrackIds}
                  onPlayTrack={handlePlayTrack}
                  onTogglePlay={handleTogglePlay}
                  onOpenPlayer={() => setIsPlayerOpen(true)}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleDownload={handleToggleDownload}
                  onDownloadTracks={handleDownloadTracks}
                  onClearDownloads={handleClearDownloads}
                  onOpenArtist={setSelectedArtistName}
                  onOpenAddToPlaylist={setPlaylistModalTrack}
                  onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
                  onOpenQueue={() => setIsLibraryQueueOpen(true)}
                  onTogglePinPlaylist={handleTogglePinPlaylist}
                  onTogglePinLikedSongs={handleTogglePinLikedSongs}
                  onUpdatePlaylist={handleUpdatePlaylist}
                  onUpdateLikedSongsCustomization={handleUpdateLikedSongsCustomization}
                  onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Action Feedback Pill */}
      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 bottom-40 z-[90] flex justify-center px-4">
          <div className="liquid-glass-elevated rounded-full px-4 py-2 text-xs font-semibold text-white shadow-2xl">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Bottom Floating Mini-Player + Nav Dock */}
      <BottomDock
        activeTrack={effectiveTrack}
        isPlaying={isPlaying}
        currentTime={currentTime}
        activeNav={activeNav}
        onNavChange={handleNavChange}
        onTogglePlay={handleTogglePlay}
        onNextTrack={goToNextTrack}
        onOpenPlayer={() => setIsPlayerOpen(true)}
      />

      {/* Full-Screen Music Player & Time-Synced Lyrics Overlay */}
      <FullScreenPlayer
        isOpen={isPlayerOpen}
        track={effectiveTrack}
        queue={queue}
        allTracks={allKnownTracks}
        isPlaying={isPlaying}
        currentTime={currentTime}
        isShuffled={isShuffled}
        repeatMode={repeatMode}
        isFavorite={Boolean(activeTrack && favoriteIds.has(activeTrack.id))}
        isDownloaded={Boolean(activeTrack && downloadedTrackIds.has(activeTrack.id))}
        activeDeviceId={activeDeviceId}
        showLyrics={showLyrics}
        streamingQuality={preferences.streamingQuality}
        spatialEnabled={preferences.spatialEnabled}
        autoScrollLyrics={preferences.autoScrollLyrics}
        onClose={() => {
          setIsPlayerOpen(false);
          setShowLyrics(false);
        }}
        onToggleLyrics={setShowLyrics}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onPrevTrack={goToPrevTrack}
        onNextTrack={goToNextTrack}
        onToggleShuffle={() => setIsShuffled((s) => !s)}
        onCycleRepeat={handleCycleRepeat}
        onToggleFavorite={handleToggleFavorite}
        onToggleDownload={handleToggleDownload}
        onSelectTrackFromQueue={(t) => handlePlayTrack(t, queue)}
        onMoveQueueTrack={handleMoveQueueTrack}
        onRemoveQueueTrack={handleRemoveQueueTrack}
        onClearUpcomingQueue={handleClearUpcomingQueue}
        onSelectDevice={handleSelectDevice}
        onAddToQueue={handleAddToQueue}
        onOpenAddToPlaylist={setPlaylistModalTrack}
        onOpenArtist={setSelectedArtistName}
      />

      {/* Library-Accessible Queue Management Modal */}
      <QueueDrawerModal
        isOpen={isLibraryQueueOpen}
        onClose={() => setIsLibraryQueueOpen(false)}
        activeTrack={activeTrack}
        queue={queue}
        allTracks={allKnownTracks}
        onSelectTrack={(t) => handlePlayTrack(t, queue)}
        onMoveTrack={handleMoveQueueTrack}
        onRemoveTrack={handleRemoveQueueTrack}
        onClearUpcoming={handleClearUpcomingQueue}
        onAddTrack={handleAddToQueue}
      />

      {/* Instant Blend & Listen Party Pop-up Notification Modal */}
      <SocialInvitePopupModal
        invite={pendingInvitePopup}
        currentUser={currentUser}
        onAccept={handleAcceptInvitePopup}
        onDecline={handleDeclineInvitePopup}
        onDismiss={() => setPendingInvitePopup(null)}
      />

      {/* Library Create Playlist Modal */}
      <CreatePlaylistModal
        isOpen={isCreatePlaylistOpen}
        tracks={allKnownTracks}
        onClose={() => setIsCreatePlaylistOpen(false)}
        onCreatePlaylist={handleCreatePlaylistFromLibrary}
      />

      {/* Liquid Glass Add-to-Playlist Sheet */}
      <AddToPlaylistModal
        track={playlistModalTrack}
        playlists={playlists}
        onClose={() => setPlaylistModalTrack(null)}
        onToggleTrackInPlaylist={handleToggleTrackInPlaylist}
        onCreatePlaylistWithTrack={handleCreatePlaylistWithTrack}
      />

      {/* Full Liquid Glass Profile & Settings Page */}
      <ProfileSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentUser={currentUser}
        onUpdateUser={handleUpdateUser}
        preferences={preferences}
        onUpdatePreferences={handleUpdatePreferences}
        followedArtists={followedArtists}
        playlistsCount={playlists.length}
        downloadedTracks={downloadedTracksList}
        activeTrackId={activeTrack?.id ?? ''}
        isPlaying={isPlaying}
        onPlayTrack={handlePlayTrack}
        onTogglePlay={handleTogglePlay}
        onRemoveDownload={(trackId) => {
          const target =
            allKnownTracks.find((t) => t.id === trackId) ??
            offlineTracks.find((t) => t.id === trackId);
          if (target) handleToggleDownload(target);
        }}
        onClearDownloads={handleClearDownloads}
        onSignOut={handleSignOut}
        onClearHistory={() =>
          setListeningStats((prev) => ({
            ...prev,
            recentTrackIds: [],
            recentLog: [],
          }))
        }
        activeDeviceId={activeDeviceId}
        onSelectDevice={handleSelectDevice}
        onOpenArtist={setSelectedArtistName}
        onReplayOnboarding={() => setIsReplayOnboardingOpen(true)}
        tracks={allKnownTracks}
      />
    </div>
  );
}
