import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { AddToPlaylistModal } from './components/AddToPlaylistModal';
import { AuthGateScreen } from './components/AuthGateScreen';
import { BottomDock } from './components/BottomDock';
import {
  CollectionDetailModal,
  CollectionDetailTarget,
} from './components/CollectionDetailModal';
import { CreatePlaylistModal } from './components/CreatePlaylistModal';
import { DesktopWorkspace } from './components/DesktopWorkspace';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import { KlynLogo } from './components/KlynLogo';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProfileSettingsModal, SettingsSubPageId } from './components/ProfileSettingsModal';
import { QueueDrawerModal } from './components/QueueDrawerModal';
import { ShowDetailModal } from './components/ShowDetailModal';
import { SocialInvitePopupModal } from './components/SocialInvitePopupModal';
import { TopBar } from './components/TopBar';
import { ActivityView } from './components/views/ActivityView';
import { ArtistProfileView } from './components/views/ArtistProfileView';
import { HomeView } from './components/views/HomeView';
import { LibraryView } from './components/views/LibraryView';
import { ReelsView } from './components/views/ReelsView';
import { SearchView } from './components/views/SearchView';
import { getLocalDateKey } from './data/catalog';
import { useAudioDevices } from './hooks/useAudioDevices';
import { useBatteryStatus } from './hooks/useBatteryStatus';
import { useConnectivity } from './hooks/useConnectivity';
import { useDeviceMode } from './hooks/useDeviceMode';
import { connectAndSyncExternalApp } from './services/connectedApps';
import {
  auth,
  isFirebaseConfigured,
  isFirestoreOfflineError,
  signOutFirebase,
  testConnection,
} from './services/firebase';
import {
  cacheTrackOffline,
  clearDownloadedTracks,
  getDownloadedTracks,
  removeCachedTrack,
  resetOfflineMemoryCaches,
  setOfflineCacheUserScope,
} from './services/offlineCache';
import { playerEngine } from './services/playerEngine';
import { episodeToTrack } from './services/podcastsApi';
import {
  AccountDeviceRecord,
  ConnectedAppProvider,
  LikedSongsCustomization,
  ListenPartyMessage,
  ListeningLogEntry,
  ListeningStatsState,
  LyricLine,
  NavTab,
  PendingInvitePopup,
  PlaylistItem,
  PodcastShow,
  RepeatMode,
  ShowEpisode,
  ShowProgressEntry,
  ShuffleMode,
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
  subscribeAccountDevicesFromFirestore,
  syncDeviceHeartbeatToFirestore,
  syncDownloadToFirestore,
  syncFriendToFirestore,
  syncPlaylistToFirestore,
  syncPublicProfileToFirestore,
  syncUserProfileToFirestore,
} from './utils/firestoreSync';
import { generateKlynAiBlend } from './utils/klynAiBlend';
import { fetchSyncedLyrics } from './utils/lrclibApi';
import { requestNotificationPermission, sendKlynNotification } from './utils/notifications';
import {
  DEFAULT_LIKED_SONGS_CUSTOMIZATION,
  EMPTY_LISTENING_STATS,
  clearActiveUserSession,
  clearCurrentUserRuntimeCaches,
  getOrCreateLocalDeviceIdentity,
  loadCentralizedAppState,
  saveCentralizedAppState,
  setActiveStorageUserScope,
} from './utils/storage';

const DEFAULT_PREFERENCES: UserPreferences = {
  streamingQuality: 'Lossless',
  downloadQuality: 'Lossless',
  spatialEnabled: false,
  normalizeVolume: true,
  gaplessPlayback: true,
  crossfadeSeconds: 6,
  autoplaySimilar: true,
  autoScrollLyrics: true,
  offlineMode: false,
  playbackSpeed: 1,
  notifyNewReleases: true,
  notifyWrappedWeekly: true,
  notifyPlaylistUpdates: true,
  notifyPushAlerts: false,
  notifySocialInvites: true,
  notifyStreakAlerts: false,
  listeningVisibility: true,
  privateSession: false,
  shareArtistAnalytics: true,
  layoutMode: 'auto',
};

export default function App() {
  const initialCentralState = useMemo(() => loadCentralizedAppState(), []);

  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() =>
    Boolean(isFirebaseConfigured && auth),
  );
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(
    () => initialCentralState?.user ?? null,
  );

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
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>('off');
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

  const [shows, setShows] = useState<PodcastShow[]>([]);
  const [selectedShow, setSelectedShow] = useState<PodcastShow | null>(null);
  const [selectedCollection, setSelectedCollection] =
    useState<CollectionDetailTarget | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(
    () => initialCentralState?.recentSearches ?? [],
  );
  const [showProgress, setShowProgress] = useState<Record<string, ShowProgressEntry>>(
    () => initialCentralState?.showProgress ?? {},
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
  const [accountDevices, setAccountDevices] = useState<AccountDeviceRecord[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsInitialSubPage, setSettingsInitialSubPage] = useState<SettingsSubPageId>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    ...DEFAULT_PREFERENCES,
    ...(initialCentralState?.settings ?? {}),
  }));
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { isOnline, showOnlineRestoredBanner } = useConnectivity();
  const battery = useBatteryStatus();
  const { bluetoothState, connectedBluetoothDevice } = useAudioDevices();
  const { isDesktop } = useDeviceMode(preferences.layoutMode ?? 'auto');
  const localDeviceIdentity = useMemo(() => getOrCreateLocalDeviceIdentity(), []);

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
  const playedTrackKeysRef = useRef<Set<string>>(new Set());
  const alertedReleaseIdsRef = useRef<Set<string>>(new Set());

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

  // Load persisted offline downloaded tracks for active user scope once on mount
  useEffect(() => {
    if (offlineLoadedRef.current) return;
    offlineLoadedRef.current = true;
    if (currentUser?.uid) {
      setOfflineCacheUserScope(currentUser.uid);
    }
    let active = true;
    getDownloadedTracks()
      .then((tracks) => {
        if (active) setOfflineTracks(tracks);
      })
      .catch(() => {
        // Ignore storage access failures in sandboxed frames
      });
    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

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
          streakDays: 0,
        };
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isPlaying, activeTrack, preferences.privateSession]);

  // Track show/episode resume progress cleanly while playing podcasts or audiobooks
  useEffect(() => {
    if (!isPlaying || !activeTrack) return;
    if (!(activeTrack.isPodcastEpisode || activeTrack.isAudiobookChapter) || !activeTrack.showId) {
      return;
    }
    const showId = activeTrack.showId;
    const episodeId = activeTrack.id;
    const speed = preferences.playbackSpeed ?? 1;
    setShowProgress((prev) => {
      const existing = prev[showId];
      if (
        existing &&
        existing.episodeId === episodeId &&
        Math.abs(existing.position - currentTime) < 3 &&
        existing.speed === speed
      ) {
        return prev;
      }
      return {
        ...prev,
        [showId]: {
          showId,
          episodeId,
          position: currentTime,
          speed,
          updatedAt: Date.now(),
        },
      };
    });
  }, [isPlaying, activeTrack, currentTime, preferences.playbackSpeed]);

  const followedArtistsRef = useRef(followedArtists);
  followedArtistsRef.current = followedArtists;
  const notifyPrefsRef = useRef({
    notifyNewReleases: preferences.notifyNewReleases,
    notifyPushAlerts: preferences.notifyPushAlerts,
  });
  notifyPrefsRef.current = {
    notifyNewReleases: preferences.notifyNewReleases,
    notifyPushAlerts: preferences.notifyPushAlerts,
  };

  // Register newly discovered real external tracks into state pool & trigger followed artist release notifications
  const handleRegisterDiscoveredTracks = useCallback((incoming: Track[]) => {
    if (incoming.length === 0) return;
    const newFollowedReleases: Track[] = [];
    const currentFollowed = followedArtistsRef.current;

    setDiscoveredTracks((prev) => {
      const map = new Map<string, Track>();
      for (const t of prev) map.set(t.id, t);
      let added = false;
      for (const t of incoming) {
        if (!map.has(t.id)) {
          added = true;
          map.set(t.id, t);
          if (currentFollowed.has(t.artist) && !alertedReleaseIdsRef.current.has(t.id)) {
            alertedReleaseIdsRef.current.add(t.id);
            newFollowedReleases.push(t);
          }
        }
      }
      if (!added) return prev;
      return Array.from(map.values()).slice(-180);
    });

    if (
      newFollowedReleases.length > 0 &&
      notifyPrefsRef.current.notifyNewReleases &&
      notifyPrefsRef.current.notifyPushAlerts
    ) {
      const first = newFollowedReleases[0];
      void sendKlynNotification(
        `New from ${first.artist}`,
        `${first.title} is now streaming on klyn.`,
        `release-${first.id}`,
      );
    }
  }, []);

  // Scoped localStorage persistence per user (no guest leak)
  useEffect(() => {
    if (!currentUser) return;
    const scopeId = currentUser.uid || currentUser.id;
    setActiveStorageUserScope(scopeId);
    saveCentralizedAppState(
      {
        user: {
          ...currentUser,
          recentSearches,
          showProgress,
        },
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
        recentSearches,
        showProgress,
      },
      scopeId,
    );
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
    recentSearches,
    showProgress,
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

  // Keep player volume & playback speed synced with user preferences
  useEffect(() => {
    playerEngine.setVolume(preferences.normalizeVolume ? 0.85 : 0.96);
  }, [preferences.normalizeVolume]);

  useEffect(() => {
    playerEngine.setPlaybackRate(preferences.playbackSpeed ?? 1);
  }, [preferences.playbackSpeed]);

  // Pause main player engine cleanly while browsing KLYN Reels
  useEffect(() => {
    if (activeNav === 'Reels' && isPlaying) {
      playerEngine.pause();
      setIsPlaying(false);
    }
  }, [activeNav, isPlaying]);

  // Prewarm next upcoming track when queue or active track changes
  useEffect(() => {
    if (!activeTrack || queue.length < 2) return;
    const idx = queue.findIndex((t) => t.id === activeTrack.id);
    const nextCandidate = idx >= 0 ? queue[(idx + 1) % queue.length] : queue[0];
    if (nextCandidate && nextCandidate.id !== activeTrack.id && isOnline && !preferences.offlineMode) {
      playerEngine.prewarmTrack(nextCandidate);
    }
  }, [activeTrack, queue, isOnline, preferences.offlineMode]);

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

      // Scope storage & IndexedDB immediately to this Firebase UID
      setActiveStorageUserScope(uid);
      setOfflineCacheUserScope(uid);
      const scopedLocalState = loadCentralizedAppState(uid);
      const scopedDownloads = await getDownloadedTracks().catch(() => []);
      if (!isMountedRef.current || authSessionEpochRef.current !== sessionEpoch) return;

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
        favoriteGenres: ['Trap', 'R&B'],
        hasCompletedOnboarding: false,
        createdAt: new Date().toISOString(),
      };

      const runHydration = async () => {
        try {
          const baseLiked = scopedLocalState?.likedTrackIds ?? [];
          const baseFollowed = scopedLocalState?.followedArtistIds ?? [];
          const baseDownloads = scopedDownloads.map((t) => t.id);
          const basePrefs = scopedLocalState?.settings
            ? { ...DEFAULT_PREFERENCES, ...scopedLocalState.settings }
            : DEFAULT_PREFERENCES;
          const baseLikedCust =
            scopedLocalState?.likedSongsCustomization ?? DEFAULT_LIKED_SONGS_CUSTOMIZATION;
          const baseDevice = scopedLocalState?.activeDeviceId || 'system-default';
          const baseStats = scopedLocalState?.listeningStats ?? EMPTY_LISTENING_STATS;

          const hydrated = await hydrateUserFromFirestore(uid, fallbackUser, {
            likedTrackIds: baseLiked,
            followedArtistIds: baseFollowed,
            downloadedTrackIds: baseDownloads,
            preferences: basePrefs,
            likedSongsCustomization: baseLikedCust,
            activeDeviceId: baseDevice,
            listeningStats: baseStats,
          });

          if (!isMountedRef.current || authSessionEpochRef.current !== sessionEpoch) return;

          hydratedFirebaseUidRef.current = uid;
          pendingAuthMetaRef.current = null;
          setCurrentUser(hydrated.user);
          void syncPublicProfileToFirestore(hydrated.user);

          if (!hydrated.isNewUser) {
            const nextPrefs = hydrated.preferences
              ? { ...DEFAULT_PREFERENCES, ...hydrated.preferences }
              : basePrefs;
            const nextLikedCust = hydrated.likedSongsCustomization ?? baseLikedCust;
            const nextDevice =
              hydrated.activeDeviceId && hydrated.activeDeviceId !== 'web-studio'
                ? hydrated.activeDeviceId
                : baseDevice;
            const nextStats = hydrated.listeningStats ?? baseStats;

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
            setPreferences(nextPrefs);
            setLikedSongsCustomization(nextLikedCust);
            setActiveDeviceId(nextDevice);
            setListeningStats(nextStats);
            setRecentSearches(
              hydrated.user.recentSearches ?? scopedLocalState?.recentSearches ?? [],
            );
            setShowProgress(
              hydrated.user.showProgress ?? scopedLocalState?.showProgress ?? {},
            );

            if (hydrated.downloadedTracks.length > 0) {
              handleRegisterDiscoveredTracks(hydrated.downloadedTracks);
              for (const dlTrack of hydrated.downloadedTracks) {
                void cacheTrackOffline(dlTrack, { isDownloaded: true }).catch(() => {});
              }
              setOfflineTracks((prev) => {
                const map = new Map<string, Track>();
                for (const t of hydrated.downloadedTracks) map.set(t.id, { ...t, downloaded: true });
                for (const t of scopedDownloads) {
                  if (!map.has(t.id)) map.set(t.id, { ...t, downloaded: true });
                }
                for (const t of prev) {
                  if (!map.has(t.id)) map.set(t.id, { ...t, downloaded: true });
                }
                return Array.from(map.values());
              });
            } else {
              setOfflineTracks(scopedDownloads);
            }
          } else {
            setPlaylists(scopedLocalState?.playlists ?? []);
            setFavoriteIds(new Set(baseLiked));
            setFollowedArtists(new Set(baseFollowed));
            setSocialUsers(scopedLocalState?.socialUsers ?? []);
            setPreferences(basePrefs);
            setLikedSongsCustomization(baseLikedCust);
            setActiveDeviceId(baseDevice);
            setListeningStats(baseStats);
            setRecentSearches(scopedLocalState?.recentSearches ?? []);
            setShowProgress(scopedLocalState?.showProgress ?? {});
            setOfflineTracks(scopedDownloads);

            lastSyncedFingerprintRef.current = JSON.stringify({
              user: hydrated.user,
              likedTrackIds: baseLiked,
              followedArtistIds: baseFollowed,
              downloadedTrackIds: baseDownloads,
              preferences: basePrefs,
              likedSongsCustomization: baseLikedCust,
              activeDeviceId: baseDevice,
              listeningStats: baseStats,
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
          setOfflineTracks(scopedDownloads);
          if (localCached?.preferences) {
            setPreferences({ ...DEFAULT_PREFERENCES, ...localCached.preferences });
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
          setRecentSearches(recoveredUser.recentSearches ?? scopedLocalState?.recentSearches ?? []);
          setShowProgress(recoveredUser.showProgress ?? scopedLocalState?.showProgress ?? {});
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
    [handleRegisterDiscoveredTracks, showToast],
  );

  const hydrateFirebaseUserSessionRef = useRef(hydrateFirebaseUserSession);
  hydrateFirebaseUserSessionRef.current = hydrateFirebaseUserSession;

  const resetUserScopedRuntimeState = useCallback(() => {
    setPlaylists([]);
    setFavoriteIds(new Set());
    setFollowedArtists(new Set());
    setSocialUsers([]);
    setOfflineTracks([]);
    setDiscoveredTracks([]);
    setQueue([]);
    setActiveTrackId('');
    setCurrentTime(0);
    setLiveDuration(0);
    setIsPlaying(false);
    setListeningStats(EMPTY_LISTENING_STATS);
    setRecentSearches([]);
    setShowProgress({});
    setAccountDevices([]);
    setSelectedShow(null);
    setSelectedArtistName(null);
    setPreferences(DEFAULT_PREFERENCES);
    setLikedSongsCustomization(DEFAULT_LIKED_SONGS_CUSTOMIZATION);
  }, []);

  // Test Firestore connection and restore active Firebase Auth session once on mount
  useEffect(() => {
    if (authListenerAttachedRef.current) return;
    if (!isFirebaseConfigured || !auth) {
      setIsRestoringSession(false);
      return;
    }
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
            })
            .finally(() => {
              if (isMountedRef.current) setIsRestoringSession(false);
            });
        } else if (isMountedRef.current) {
          hydratedFirebaseUidRef.current = null;
          clearActiveUserSession();
          clearCurrentUserRuntimeCaches();
          resetOfflineMemoryCaches();
          setOfflineCacheUserScope(null);
          setActiveStorageUserScope(null);
          setCurrentUser(null);
          resetUserScopedRuntimeState();
          setIsRestoringSession(false);
        }
      });
    } catch {
      setIsRestoringSession(false);
    }

    return () => {
      authListenerAttachedRef.current = false;
      try {
        unsubscribe();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [resetUserScopedRuntimeState]);

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
      user: {
        ...currentUser,
        recentSearches,
        showProgress,
      },
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
    recentSearches,
    showProgress,
  ]);

  // Firestore Cross-Device Heartbeat & Live Account Devices Subscription
  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !currentUser?.uid) {
      setAccountDevices([]);
      return;
    }
    if (!auth.currentUser || auth.currentUser.uid !== currentUser.uid || auth.currentUser.isAnonymous) {
      return;
    }
    const uid = currentUser.uid;
    const unsubscribe = subscribeAccountDevicesFromFirestore(
      uid,
      localDeviceIdentity.deviceId,
      (devices) => {
        if (isMountedRef.current) setAccountDevices(devices);
      },
    );
    return () => unsubscribe();
  }, [currentUser?.uid, localDeviceIdentity.deviceId]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !currentUser?.uid) return;
    if (!auth.currentUser || auth.currentUser.uid !== currentUser.uid || auth.currentUser.isAnonymous) {
      return;
    }
    const uid = currentUser.uid;

    const sendHeartbeat = () => {
      const track = activeTrackRef.current;
      void syncDeviceHeartbeatToFirestore(uid, {
        deviceId: localDeviceIdentity.deviceId,
        name: localDeviceIdentity.name,
        platform: localDeviceIdentity.platform,
        isCurrentDevice: true,
        isPlaying,
        activeTrackId: track?.id,
        activeTrackTitle: track?.title,
        activeTrackArtist: track?.artist,
        playbackPosition: Math.round(currentTimeRef.current),
        batteryLevel: battery.level,
        batteryCharging: battery.charging,
        bluetoothDeviceName: connectedBluetoothDevice?.name,
        bluetoothBatteryLevel: connectedBluetoothDevice?.batteryLevel ?? null,
        lastSeen: Date.now(),
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 20000);
    return () => window.clearInterval(intervalId);
  }, [
    currentUser?.uid,
    localDeviceIdentity,
    isPlaying,
    activeTrackId,
    battery.level,
    battery.charging,
    connectedBluetoothDevice?.name,
    connectedBluetoothDevice?.batteryLevel,
  ]);

  const handleAuthenticate = useCallback(
    (account: UserAccount) => {
      const scopeId = account.uid || account.id;
      setActiveStorageUserScope(scopeId);
      setOfflineCacheUserScope(scopeId);
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
    (
      updatedUser: UserAccount,
      updatedPrefs: Partial<UserPreferences>,
      importedTracks?: Track[],
      importedPlaylists?: PlaylistItem[],
    ) => {
      setCurrentUser(updatedUser);
      setPreferences((prev) => ({ ...prev, ...updatedPrefs }));
      if (importedTracks && importedTracks.length > 0) {
        handleRegisterDiscoveredTracks(importedTracks);
      }
      if (importedPlaylists && importedPlaylists.length > 0) {
        setPlaylists((prev) => [...importedPlaylists, ...prev]);
        if (updatedUser.uid && isFirebaseConfigured && auth?.currentUser?.uid === updatedUser.uid) {
          for (const pl of importedPlaylists) {
            void syncPlaylistToFirestore(updatedUser.uid, pl).catch(() => {});
          }
        }
      }
      void syncPublicProfileToFirestore(updatedUser);
      showToast(`Your klyn soundstage is ready, ${updatedUser.name.split(' ')[0]}`);
    },
    [handleRegisterDiscoveredTracks, showToast],
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
    clearCurrentUserRuntimeCaches();
    resetOfflineMemoryCaches();
    setOfflineCacheUserScope(null);
    setActiveStorageUserScope(null);
    void signOutFirebase().catch(() => {
      // ignore sign-out errors if running local profile
    });
    setCurrentUser(null);
    resetUserScopedRuntimeState();
    setIsPlayerOpen(false);
    setIsSettingsOpen(false);
    setSettingsInitialSubPage(null);
  }, [resetUserScopedRuntimeState]);

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
          streakDays: 0,
        };
      });
    },
    [preferences.privateSession, handleRegisterDiscoveredTracks],
  );

  const pickSmartShuffleCandidate = useCallback(
    (pool: Track[], current: Track | null): Track | null => {
      const candidates = pool.filter(
        (t) =>
          t.id !== current?.id &&
          (!preferences.offlineMode && isOnline ? true : downloadedTrackIds.has(t.id)),
      );
      if (candidates.length === 0) return null;

      let unplayed = candidates.filter((t) => !playedTrackKeysRef.current.has(t.id));
      if (unplayed.length === 0) {
        playedTrackKeysRef.current.clear();
        if (current) playedTrackKeysRef.current.add(current.id);
        unplayed = candidates;
      }

      const genreWeights = new Set((currentUser?.favoriteGenres ?? []).map((g) => g.toLowerCase()));
      const scored = unplayed.map((t) => {
        let score = Math.random() * 1.5;
        if (current && t.genre.toLowerCase() === current.genre.toLowerCase()) score += 4;
        if (genreWeights.has(t.genre.toLowerCase())) score += 2.5;
        if (favoriteIds.has(t.id)) score += 2;
        if (followedArtists.has(t.artist)) score += 2;
        return { track: t, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.track ?? null;
    },
    [
      currentUser?.favoriteGenres,
      downloadedTrackIds,
      favoriteIds,
      followedArtists,
      isOnline,
      preferences.offlineMode,
    ],
  );

  const goToNextTrack = useCallback(() => {
    if (queue.length === 0 && shuffleMode !== 'smart') return;
    const currentIndex = activeTrack ? queue.findIndex((t) => t.id === activeTrack.id) : -1;
    if (activeTrack) playedTrackKeysRef.current.add(activeTrack.id);

    if (shuffleMode === 'smart') {
      const combinedPool = Array.from(
        new Map([...queue, ...allKnownTracksRef.current].map((t) => [t.id, t])).values(),
      );
      const nextTrack = pickSmartShuffleCandidate(combinedPool, activeTrack);
      if (nextTrack) {
        playedTrackKeysRef.current.add(nextTrack.id);
        if (!queue.some((t) => t.id === nextTrack.id)) {
          setQueue((prev) => [...prev, nextTrack]);
        }
        setActiveTrackId(nextTrack.id);
        setCurrentTime(0);
        setLiveDuration(0);
        setIsPlaying(true);
        recordTrackPlay(nextTrack);
        void playerEngine.playTrack(nextTrack, 0);
        return;
      }
    }

    if (shuffleMode === 'shuffle' && queue.length > 1) {
      let unplayed = queue.filter(
        (t) => t.id !== activeTrack?.id && !playedTrackKeysRef.current.has(t.id),
      );
      if (unplayed.length === 0) {
        playedTrackKeysRef.current.clear();
        if (activeTrack) playedTrackKeysRef.current.add(activeTrack.id);
        unplayed = queue.filter((t) => t.id !== activeTrack?.id);
      }
      const nextTrack = unplayed[Math.floor(Math.random() * unplayed.length)] ?? queue[0];
      if ((!isOnline || preferences.offlineMode) && !downloadedTrackIds.has(nextTrack.id)) {
        showToast('Track unavailable offline — download first');
        return;
      }
      playedTrackKeysRef.current.add(nextTrack.id);
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
      if ((!isOnline || preferences.offlineMode) && !downloadedTrackIds.has(nextTrack.id)) {
        showToast('Track unavailable offline — download first');
        return;
      }
      setActiveTrackId(nextTrack.id);
      setCurrentTime(0);
      setLiveDuration(0);
      setIsPlaying(true);
      recordTrackPlay(nextTrack);
      void playerEngine.playTrack(nextTrack, 0);
    } else if (repeatMode === 'all' || preferences.autoplaySimilar) {
      const nextTrack = queue[0];
      if (!nextTrack) return;
      if ((!isOnline || preferences.offlineMode) && !downloadedTrackIds.has(nextTrack.id)) {
        showToast('Track unavailable offline — download first');
        return;
      }
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
  }, [
    queue,
    activeTrack,
    shuffleMode,
    repeatMode,
    preferences.autoplaySimilar,
    preferences.offlineMode,
    isOnline,
    downloadedTrackIds,
    pickSmartShuffleCandidate,
    recordTrackPlay,
    showToast,
  ]);

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
    if ((!isOnline || preferences.offlineMode) && !downloadedTrackIds.has(prevTrack.id)) {
      showToast('Track unavailable offline — download first');
      return;
    }
    setActiveTrackId(prevTrack.id);
    setCurrentTime(0);
    setLiveDuration(0);
    setIsPlaying(true);
    recordTrackPlay(prevTrack);
    void playerEngine.playTrack(prevTrack, 0);
  }, [
    currentTime,
    queue,
    activeTrack,
    isOnline,
    preferences.offlineMode,
    downloadedTrackIds,
    recordTrackPlay,
    showToast,
  ]);

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
      if ((!isOnline || preferences.offlineMode) && !downloadedTrackIds.has(track.id)) {
        showToast('Track unavailable offline — download first');
        return;
      }

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
      playedTrackKeysRef.current.add(track.id);
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
    [
      isOnline,
      preferences.offlineMode,
      downloadedTrackIds,
      recordTrackPlay,
      activePartyFriendId,
      currentUser,
      handleRegisterDiscoveredTracks,
      showToast,
    ],
  );

  const handleTogglePlay = useCallback(() => {
    const current = activeTrackRef.current;
    if (!current) return;
    if (
      !playerEngine.getIsPlaying() &&
      (!isOnline || preferences.offlineMode) &&
      !downloadedTrackIds.has(current.id)
    ) {
      showToast('Track unavailable offline — download first');
      return;
    }

    if (playerEngine.getSource() === 'idle') {
      setIsPlaying(true);
      void playerEngine.playTrack(current, currentTimeRef.current);
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
  }, [activePartyFriendId, isOnline, preferences.offlineMode, downloadedTrackIds, showToast]);

  const handleDismissMiniPlayer = useCallback(() => {
    playerEngine.pause();
    setIsPlaying(false);
    setActiveTrackId('');
  }, []);

  const handleSeek = useCallback(
    (time: number) => {
      const maxDur = effectiveTrack?.duration ?? 0;
      const clamped = maxDur > 0 ? Math.min(maxDur, Math.max(0, time)) : Math.max(0, time);
      setCurrentTime(clamped);
      playerEngine.seekTo(clamped);
    },
    [effectiveTrack?.duration],
  );

  const handleSkipBy = useCallback(
    (seconds: number) => {
      playerEngine.skipBy(seconds);
      setCurrentTime((prev) => Math.max(0, prev + seconds));
    },
    [],
  );

  const handleChangePlaybackSpeed = useCallback((speed: number) => {
    setPreferences((prev) => ({ ...prev, playbackSpeed: speed }));
    playerEngine.setPlaybackRate(speed);
  }, []);

  const handlePlayEpisode = useCallback(
    (show: PodcastShow, episode: ShowEpisode, resumeAt: number, speed: number) => {
      const track = episodeToTrack(show, episode);
      const showQueue = show.episodes.map((ep) => episodeToTrack(show, ep));
      setPreferences((prev) => ({ ...prev, playbackSpeed: speed }));
      playerEngine.setPlaybackRate(speed);
      handlePlayTrack(track, showQueue.length > 0 ? showQueue : [track], resumeAt, false);
    },
    [handlePlayTrack],
  );

  const handleTransferPlaybackToDevice = useCallback(
    (device: AccountDeviceRecord) => {
      if (!device.activeTrackId) return;
      const matched = allKnownTracksRef.current.find((t) => t.id === device.activeTrackId);
      if (!matched) {
        showToast(`Load "${device.activeTrackTitle || 'Track'}" on this device to resume`);
        return;
      }
      handlePlayTrack(matched, queue, device.playbackPosition ?? 0, true);
      showToast(`Handoff from ${device.name}: playing "${matched.title}"`);
    },
    [handlePlayTrack, queue, showToast],
  );

  const handleConnectApp = useCallback(
    async (provider: ConnectedAppProvider, handleOrUrl: string) => {
      if (!currentUser) return;
      const result = await connectAndSyncExternalApp(provider, handleOrUrl);
      if (result.importedTracks.length > 0) {
        handleRegisterDiscoveredTracks(result.importedTracks);
      }
      if (result.importedPlaylist) {
        setPlaylists((prev) => [
          result.importedPlaylist!,
          ...prev.filter((p) => p.sourceProvider !== provider),
        ]);
        if (currentUser.uid && isVerifiedFirebaseSession()) {
          void syncPlaylistToFirestore(currentUser.uid, result.importedPlaylist).catch(() => {});
        }
      }
      const updatedUser: UserAccount = {
        ...currentUser,
        connectedApps: {
          ...(currentUser.connectedApps ?? {}),
          [provider]: result.entry,
        },
      };
      setCurrentUser(updatedUser);
      showToast(
        result.importedTracks.length > 0
          ? `Synced ${result.importedTracks.length} tracks from ${provider}`
          : `Connected ${provider}`,
      );
    },
    [currentUser, handleRegisterDiscoveredTracks, isVerifiedFirebaseSession, showToast],
  );

  const handleDisconnectApp = useCallback(
    (provider: ConnectedAppProvider) => {
      if (!currentUser) return;
      const nextApps = { ...(currentUser.connectedApps ?? {}) };
      delete nextApps[provider];
      setCurrentUser({ ...currentUser, connectedApps: nextApps });
      showToast(`Disconnected ${provider}`);
    },
    [currentUser, showToast],
  );

  const handleRequestNotifications = useCallback(async () => {
    const result = await requestNotificationPermission();
    const granted = result === 'granted';
    setPreferences((prev) => ({ ...prev, notifyPushAlerts: granted }));
    if (currentUser) {
      setCurrentUser({ ...currentUser, notificationsEnabled: granted });
    }
    if (granted) {
      showToast('KLYN notifications enabled');
      void sendKlynNotification('KLYN Alerts Active', 'You will be notified of new releases.');
    } else if (result === 'denied') {
      showToast('Notifications blocked in browser settings');
    } else {
      showToast('Notifications unavailable in this browser');
    }
  }, [currentUser, showToast]);

  const handleCycleShuffle = useCallback(() => {
    setShuffleMode((prev) => {
      const next: ShuffleMode = prev === 'off' ? 'shuffle' : prev === 'shuffle' ? 'smart' : 'off';
      showToast(
        next === 'off' ? 'Shuffle Off' : next === 'shuffle' ? 'Shuffle On' : 'Smart Shuffle On',
      );
      return next;
    });
  }, [showToast]);

  const handleAddRecentSearch = useCallback((term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => [
      clean,
      ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase()),
    ].slice(0, 15));
  }, []);

  const handleRemoveRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => prev.filter((t) => t !== term));
  }, []);

  const handleClearRecentSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

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

  // Offline App Downloads Management (IndexedDB offlineCache + Cloud Firestore)
  const handleToggleDownload = useCallback(
    (track: Track) => {
      const isAlreadyDownloaded = downloadedTrackIds.has(track.id);
      if (isAlreadyDownloaded) {
        setOfflineTracks((prev) => prev.filter((t) => t.id !== track.id));
        void removeCachedTrack(track.id);
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
      void cacheTrackOffline(downloadedCopy, { isDownloaded: true });
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
        void cacheTrackOffline(copy, { isDownloaded: true });
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
    void clearDownloadedTracks();
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

      const existing = socialUsers.find(
        (u) =>
          (prebuilt && u.id === prebuilt.id) ||
          u.handle.toLowerCase() === handle.toLowerCase(),
      );

      // Only add verified real users (existing or returned from Firestore public_profiles)
      if (!existing && !prebuilt) {
        showToast('No matching KLYN listener found');
        return;
      }

      const syncedEntry: SocialUser = existing
        ? { ...existing, isFriend: true }
        : { ...prebuilt!, isFriend: true };

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
      showToast(`Added ${syncedEntry.name || handle} to friends`);
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
      void syncPublicProfileToFirestore(updatedUser);
      showToast('Profile updated');
    },
    [showToast],
  );

  const audioStatusLabel = preferences.streamingQuality;

  const scrollMainToTop = useCallback(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    scrollMainToTop();
  }, [activeNav, selectedArtistName, currentUser?.hasCompletedOnboarding, scrollMainToTop]);

  // 0. FIREBASE AUTH SESSION RESTORE SPLASH
  if (isRestoringSession) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-[#000000] text-white">
        <KlynLogo size={76} pulse />
      </div>
    );
  }

  // 1. MANDATORY FIRST-ENTRY LOG IN / SIGN UP GATE
  if (!currentUser) {
    return (
      <AuthGateScreen
        onAuthenticate={handleAuthenticate}
        onFirebaseAuthenticate={handleFirebaseAuthenticate}
      />
    );
  }

  // 2. FIRST-TIME ONBOARDING FLOW (STRICTLY ONCE)
  if (!currentUser.hasCompletedOnboarding) {
    return (
      <OnboardingFlow
        user={currentUser}
        preferences={preferences}
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  const ambientPrimary = activeTrack?.primaryColor ?? '#27272a';
  const ambientSecondary = activeTrack?.secondaryColor ?? '#09090b';
  const isReelsCanvas = activeNav === 'Reels' && !selectedArtistName;

  const activePageContent = selectedArtistName ? (
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
          downloadedTrackIds={downloadedTrackIds}
          playCounts={listeningStats.trackPlayCounts}
          artistPlayCounts={listeningStats.artistPlayCounts}
          playlists={playlists}
          recentLog={listeningStats.recentLog}
          followedArtists={followedArtists}
          topFilter={topFilter}
          onFilterChange={handleFilterChange}
          activeTrackId={activeTrack?.id ?? ''}
          isPlaying={isPlaying}
          isOnline={isOnline}
          offlineMode={Boolean(preferences.offlineMode)}
          audioQuality={audioStatusLabel}
          onPlayTrack={handlePlayTrack}
          onTogglePlay={handleTogglePlay}
          onOpenPlayer={() => setIsPlayerOpen(true)}
          onOpenSettings={() => {
            setSettingsInitialSubPage(null);
            setIsSettingsOpen(true);
          }}
          onOpenArtist={setSelectedArtistName}
          onOpenShow={setSelectedShow}
          onOpenCollection={setSelectedCollection}
          onShowsLoaded={setShows}
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
          downloadedTrackIds={downloadedTrackIds}
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
          isOnline={isOnline}
          offlineMode={Boolean(preferences.offlineMode)}
          downloadedTrackIds={downloadedTrackIds}
          recentSearches={recentSearches}
          onAddRecentSearch={handleAddRecentSearch}
          onRemoveRecentSearch={handleRemoveRecentSearch}
          onClearRecentSearches={handleClearRecentSearches}
          onPlayTrack={handlePlayTrack}
          onTogglePlay={handleTogglePlay}
          onOpenPlayer={() => setIsPlayerOpen(true)}
          onOpenArtist={setSelectedArtistName}
          onOpenShow={setSelectedShow}
          onOpenCollection={setSelectedCollection}
          onOpenAddToPlaylist={setPlaylistModalTrack}
          onToggleDownload={handleToggleDownload}
          onRegisterTracks={handleRegisterDiscoveredTracks}
        />
      )}

      {activeNav === 'Library' && (
        <LibraryView
          tracks={allKnownTracks}
          playlists={playlists}
          shows={shows}
          showProgress={showProgress}
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
          onOpenShow={setSelectedShow}
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
  );

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

      {isDesktop && !isReelsCanvas ? (
        <DesktopWorkspace
          currentUser={currentUser}
          activeNav={activeNav}
          onNavChange={handleNavChange}
          playlists={playlists}
          tracks={allKnownTracks}
          queue={queue}
          activeTrack={effectiveTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          shuffleMode={shuffleMode}
          repeatMode={repeatMode}
          autoScrollLyrics={preferences.autoScrollLyrics}
          isFavorite={Boolean(activeTrack && favoriteIds.has(activeTrack.id))}
          isDownloaded={Boolean(activeTrack && downloadedTrackIds.has(activeTrack.id))}
          activeDeviceId={activeDeviceId}
          isOnline={isOnline}
          showOnlineRestoredBanner={showOnlineRestoredBanner}
          mainScrollRef={mainScrollRef}
          onOpenProfile={() => {
            setSettingsInitialSubPage(null);
            setIsSettingsOpen(true);
          }}
          onOpenCreatePlaylist={() => setIsCreatePlaylistOpen(true)}
          onPlayTrack={handlePlayTrack}
          onTogglePlay={handleTogglePlay}
          onPrevTrack={goToPrevTrack}
          onNextTrack={goToNextTrack}
          onSeek={handleSeek}
          onCycleShuffle={handleCycleShuffle}
          onCycleRepeat={handleCycleRepeat}
          onToggleFavorite={handleToggleFavorite}
          onToggleDownload={handleToggleDownload}
          onOpenAddToPlaylist={setPlaylistModalTrack}
          onOpenArtist={setSelectedArtistName}
          onOpenFullPlayer={() => setIsPlayerOpen(true)}
          onSelectDevice={handleSelectDevice}
        >
          {activePageContent}
        </DesktopWorkspace>
      ) : (
        <>
          {/* Unified Upper Floating Pill Bar */}
          <TopBar
            hidden={isReelsCanvas}
            onOpenProfile={() => {
              setSettingsInitialSubPage(null);
              setIsSettingsOpen(true);
            }}
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
            className={
              isReelsCanvas
                ? 'relative z-10 h-full w-full overflow-hidden'
                : 'glass-scroll relative z-10 h-full w-full overflow-y-auto scroll-pt-24 scroll-pb-52'
            }
          >
            {isReelsCanvas ? (
              <ReelsView
                tracks={allKnownTracks}
                currentUser={currentUser}
                isActive={isReelsCanvas}
                isOnline={isOnline}
                offlineMode={Boolean(preferences.offlineMode)}
                onOpenArtist={setSelectedArtistName}
                onOpenAddToPlaylist={setPlaylistModalTrack}
                onRegisterTracks={handleRegisterDiscoveredTracks}
              />
            ) : (
              <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8 pt-[calc(5.25rem+env(safe-area-inset-top))] sm:pt-24 pb-[calc(12.5rem+env(safe-area-inset-bottom))] sm:pb-48">
                {activePageContent}
              </div>
            )}
          </main>

          {/* Bottom Floating Mini-Player + Nav Dock */}
          <BottomDock
            activeTrack={effectiveTrack}
            isPlaying={isPlaying}
            currentTime={currentTime}
            activeNav={activeNav}
            isOnline={isOnline}
            showOnlineRestoredBanner={showOnlineRestoredBanner}
            bluetoothState={bluetoothState}
            connectedBluetoothDevice={connectedBluetoothDevice}
            onNavChange={handleNavChange}
            onTogglePlay={handleTogglePlay}
            onNextTrack={goToNextTrack}
            onOpenPlayer={() => setIsPlayerOpen(true)}
            onDismissMiniPlayer={handleDismissMiniPlayer}
            onOpenDevicesSettings={() => {
              setSettingsInitialSubPage('devices');
              setIsSettingsOpen(true);
            }}
          />
        </>
      )}

      {/* Action Feedback Pill */}
      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 bottom-40 z-[90] flex justify-center px-4">
          <div className="liquid-glass-elevated rounded-full px-4 py-2 text-xs font-semibold text-white shadow-2xl">
            {toastMessage}
          </div>
        </div>
      )}

      {/* Full-Screen Music Player & Time-Synced Lyrics Overlay */}
      <FullScreenPlayer
        isOpen={isPlayerOpen}
        track={effectiveTrack}
        queue={queue}
        allTracks={allKnownTracks}
        isPlaying={isPlaying}
        currentTime={currentTime}
        shuffleMode={shuffleMode}
        repeatMode={repeatMode}
        playbackSpeed={preferences.playbackSpeed ?? 1}
        isFavorite={Boolean(activeTrack && favoriteIds.has(activeTrack.id))}
        isDownloaded={Boolean(activeTrack && downloadedTrackIds.has(activeTrack.id))}
        activeDeviceId={activeDeviceId}
        showLyrics={showLyrics}
        streamingQuality={preferences.streamingQuality}
        autoScrollLyrics={preferences.autoScrollLyrics}
        onClose={() => {
          setIsPlayerOpen(false);
          setShowLyrics(false);
        }}
        onToggleLyrics={setShowLyrics}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onSkipBy={handleSkipBy}
        onChangePlaybackSpeed={handleChangePlaybackSpeed}
        onPrevTrack={goToPrevTrack}
        onNextTrack={goToNextTrack}
        onCycleShuffle={handleCycleShuffle}
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

      {/* Album, Playlist & Radio Collection Detail Modal */}
      <CollectionDetailModal
        collection={selectedCollection}
        activeTrackId={activeTrack?.id ?? ''}
        isPlaying={isPlaying}
        downloadedTrackIds={downloadedTrackIds}
        isOnline={isOnline}
        offlineMode={Boolean(preferences.offlineMode)}
        onClose={() => setSelectedCollection(null)}
        onPlayTrack={handlePlayTrack}
        onTogglePlay={handleTogglePlay}
        onToggleDownload={handleToggleDownload}
        onAddToQueue={handleAddToQueue}
        onOpenAddToPlaylist={setPlaylistModalTrack}
        onOpenArtist={setSelectedArtistName}
        onRegisterTracks={handleRegisterDiscoveredTracks}
      />

      {/* Podcast & Audiobook Show Detail Modal */}
      <ShowDetailModal
        show={selectedShow}
        activeTrackId={activeTrack?.id ?? null}
        isPlaying={isPlaying}
        showProgress={showProgress}
        downloadedTrackIds={downloadedTrackIds}
        playbackSpeed={preferences.playbackSpeed ?? 1}
        onChangePlaybackSpeed={handleChangePlaybackSpeed}
        onSkipBy={handleSkipBy}
        onClose={() => setSelectedShow(null)}
        onPlayEpisode={handlePlayEpisode}
        onTogglePlay={handleTogglePlay}
        onToggleDownload={handleToggleDownload}
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
        initialSubPage={settingsInitialSubPage}
        onClose={() => {
          setIsSettingsOpen(false);
          setSettingsInitialSubPage(null);
        }}
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
        battery={battery}
        accountDevices={accountDevices}
        onTransferPlaybackToDevice={handleTransferPlaybackToDevice}
        onConnectApp={handleConnectApp}
        onDisconnectApp={handleDisconnectApp}
        onRequestNotifications={handleRequestNotifications}
        tracks={allKnownTracks}
      />
    </div>
  );
}
