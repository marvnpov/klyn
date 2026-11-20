import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { fetchRealArtistPhoto, getCachedArtistPhoto } from '../../services/artistProfiles';
import { fetchEnrichedHomeCatalog } from '../../services/musicApi';
import { fetchPodcastsAndAudiobooks } from '../../services/podcastsApi';
import {
  getSpotifyCategoryPlaylists,
  getSpotifyPlaylistTracks,
  SpotifyArtistProfile,
  SpotifyCategory,
  SpotifyCategoryPlaylist,
} from '../../services/spotifyApi';
import {
  ListeningLogEntry,
  PlaylistItem,
  PodcastShow,
  TopFilterTab,
  Track,
  UserAccount,
} from '../../types/music';
import {
  AlbumChartEntry,
  RealArtistCatalogEntry,
  fetchRealArtistsCatalog,
  lookupAlbumTracks,
  searchItunesCatalog,
} from '../../utils/itunesApi';
import { rankCatalogForUser } from '../../utils/klynAiBlend';
import { CollectionDetailTarget } from '../CollectionDetailModal';
import { CoverArt } from '../CoverArt';
import { KlynLogo } from '../KlynLogo';
import { PillTabItem, SpringPillTabs } from '../SpringPillTabs';

interface HomeViewProps {
  tracks: Track[];
  currentUser: UserAccount;
  favoriteIds: Set<string>;
  downloadedTrackIds: Set<string>;
  playCounts: Record<string, number>;
  artistPlayCounts: Record<string, number>;
  playlists: PlaylistItem[];
  recentLog: ListeningLogEntry[];
  followedArtists: Set<string>;
  topFilter: TopFilterTab;
  onFilterChange: (filter: TopFilterTab) => void;
  activeTrackId: string;
  isPlaying: boolean;
  isOnline: boolean;
  offlineMode: boolean;
  audioQuality: string;
  onPlayTrack: (track: Track, queueList?: Track[]) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onOpenSettings: () => void;
  onOpenArtist: (artistName: string) => void;
  onOpenShow: (show: PodcastShow) => void;
  onOpenCollection?: (collection: CollectionDetailTarget) => void;
  onShowsLoaded?: (shows: PodcastShow[]) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

const HOME_FILTER_TABS: PillTabItem<TopFilterTab>[] = [
  { id: 'All', label: 'All' },
  { id: 'Music', label: 'Music' },
  { id: 'Mixes', label: 'Mixes' },
];

export const HomeView: React.FC<HomeViewProps> = ({
  tracks,
  currentUser,
  favoriteIds,
  downloadedTrackIds: _downloadedTrackIds,
  playCounts,
  artistPlayCounts,
  playlists,
  recentLog,
  followedArtists,
  topFilter,
  onFilterChange,
  activeTrackId,
  isPlaying,
  isOnline,
  offlineMode,
  audioQuality,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onOpenSettings,
  onOpenArtist,
  onOpenShow,
  onOpenCollection,
  onShowsLoaded,
  onRegisterTracks,
}) => {
  const [realArtists, setRealArtists] = useState<RealArtistCatalogEntry[]>([]);
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({});
  const [podcastsAndBooks, setPodcastsAndBooks] = useState<PodcastShow[]>([]);
  const [chartTracks, setChartTracks] = useState<Track[]>([]);
  const [chartAlbums, setChartAlbums] = useState<AlbumChartEntry[]>([]);
  const [catalogAlbums, setCatalogAlbums] = useState<AlbumChartEntry[]>([]);
  const [spotifyCategories, setSpotifyCategories] = useState<SpotifyCategory[]>([]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyCategoryPlaylist[]>([]);
  const [spotifyArtists, setSpotifyArtists] = useState<SpotifyArtistProfile[]>([]);
  const [isLoadingHomeCatalog, setIsLoadingHomeCatalog] = useState<boolean>(false);
  const [homeCatalogError, setHomeCatalogError] = useState<boolean>(false);
  const [catalogRetryTick, setCatalogRetryTick] = useState<number>(0);
  const [isLoadingArtists, setIsLoadingArtists] = useState<boolean>(false);
  const [expandedShelf, setExpandedShelf] = useState<
    'forYou' | 'albumsForYou' | 'trending' | 'newReleases' | 'shows' | null
  >(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroAutoStopped, setHeroAutoStopped] = useState(false);
  const aiFetchedKeyRef = useRef('');

  const priorityRealArtistNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    const addName = (name: string) => {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        names.push(name);
      }
    };

    followedArtists.forEach(addName);
    Object.entries(artistPlayCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([artist]) => addName(artist));

    return names.slice(0, 6);
  }, [followedArtists, artistPlayCounts]);

  const genresKey = currentUser.favoriteGenres.join('|');
  const priorityArtistKey = priorityRealArtistNames.join('|');

  useEffect(() => {
    if (!isOnline || offlineMode) return;
    const controller = new AbortController();
    setIsLoadingHomeCatalog(true);
    setHomeCatalogError(false);
    const genres = genresKey ? genresKey.split('|') : [];

    fetchEnrichedHomeCatalog(genres, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.tracks.length > 0) onRegisterTracks?.(res.tracks);
        if (res.chartTracks && res.chartTracks.length > 0) setChartTracks(res.chartTracks);
        if (res.chartAlbums && res.chartAlbums.length > 0) setChartAlbums(res.chartAlbums);
        if (res.albums.length > 0) setCatalogAlbums(res.albums);
        if (res.spotifyCategories.length > 0) setSpotifyCategories(res.spotifyCategories);
        if (res.spotifyPlaylists.length > 0) setSpotifyPlaylists(res.spotifyPlaylists);
        if (res.spotifyArtists.length > 0) setSpotifyArtists(res.spotifyArtists);
        if (res.tracks.length === 0 && (res.chartTracks?.length ?? 0) === 0) {
          setHomeCatalogError(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setHomeCatalogError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingHomeCatalog(false);
      });

    return () => controller.abort();
  }, [genresKey, isOnline, offlineMode, catalogRetryTick, onRegisterTracks]);

  // Server-side AI Discovery recommendations enrichment
  useEffect(() => {
    if (!isOnline || offlineMode) return;
    const key = `${genresKey}::${priorityArtistKey}`;
    if (aiFetchedKeyRef.current === key) return;
    aiFetchedKeyRef.current = key;

    const controller = new AbortController();
    const recentArtists = priorityArtistKey ? priorityArtistKey.split('|').slice(0, 5) : [];
    const favoriteGenres = genresKey ? genresKey.split('|') : [];

    fetch('/api/gemini/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favoriteGenres, recentArtists }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data: { queries?: string[] } | null) => {
        if (!data?.queries || controller.signal.aborted) return;
        const settled = await Promise.allSettled(
          data.queries.slice(0, 3).map((q) => searchItunesCatalog(q, 8, controller.signal)),
        );
        if (controller.signal.aborted) return;
        const extraTracks: Track[] = [];
        for (const s of settled) {
          if (s.status === 'fulfilled') extraTracks.push(...s.value.tracks);
        }
        if (extraTracks.length > 0) onRegisterTracks?.(extraTracks);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [genresKey, priorityArtistKey, isOnline, offlineMode, onRegisterTracks]);

  // Fetch Podcasts & Audiobooks
  useEffect(() => {
    if (!isOnline || offlineMode) return;
    const controller = new AbortController();
    fetchPodcastsAndAudiobooks(controller.signal)
      .then((shows) => {
        if (controller.signal.aborted) return;
        setPodcastsAndBooks(shows);
        onShowsLoaded?.(shows);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isOnline, offlineMode, onShowsLoaded]);

  // Fetch Real Artist Profiles + Real Deezer Portraits
  useEffect(() => {
    if (!isOnline || offlineMode) return;
    const controller = new AbortController();
    setIsLoadingArtists(true);
    const genres = genresKey ? genresKey.split('|') : [];
    const priorities = priorityArtistKey ? priorityArtistKey.split('|') : [];

    fetchRealArtistsCatalog(genres, priorities, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        setRealArtists(entries);
        const fetchedTracks = entries.flatMap((entry) => entry.tracks);
        if (fetchedTracks.length > 0) onRegisterTracks?.(fetchedTracks);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingArtists(false);
      });

    return () => controller.abort();
  }, [genresKey, priorityArtistKey, isOnline, offlineMode, onRegisterTracks]);

  const personalizedCatalog = useMemo(
    () =>
      rankCatalogForUser(
        tracks,
        currentUser,
        favoriteIds,
        playCounts,
        artistPlayCounts,
        recentLog,
      ),
    [tracks, currentUser, favoriteIds, playCounts, artistPlayCounts, recentLog],
  );

  const filteredTracks = useMemo(() => {
    if (topFilter === 'All') return personalizedCatalog;
    if (topFilter === 'Music') {
      return personalizedCatalog.filter((t) => t.category === 'Music');
    }
    return personalizedCatalog.filter((t) => t.category === 'Mixes');
  }, [personalizedCatalog, topFilter]);

  const activeCatalog = filteredTracks.length > 0 ? filteredTracks : personalizedCatalog;

  // 1. FOR YOU (personalized picks blending listening signals + genre-ranked catalog)
  const forYouTracks = useMemo(() => {
    const allowedIds = new Set(activeCatalog.map((t) => t.id));
    const recentOrderMap = new Map<string, number>();
    recentLog.forEach((entry, idx) => recentOrderMap.set(entry.trackId, idx));

    const listeningScored = tracks
      .filter((t) => topFilter === 'All' || allowedIds.has(t.id))
      .map((t) => {
        const recentIdx = recentOrderMap.get(t.id);
        const playCount = playCounts[t.id] ?? 0;
        const artistPlays = artistPlayCounts[t.artist] ?? 0;
        const isFav = favoriteIds.has(t.id);
        const hasRealSignal =
          recentIdx !== undefined || playCount > 0 || isFav || artistPlays > 0;
        const score =
          (recentIdx !== undefined ? Math.max(20, 120 - recentIdx * 12) : 0) +
          playCount * 15 +
          artistPlays * 3 +
          (isFav ? 28 : 0);
        return { track: t, score, hasRealSignal };
      })
      .filter((item) => item.hasRealSignal)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.track);

    const picked: Track[] = [];
    const seenIds = new Set<string>();
    for (const t of listeningScored) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        picked.push(t);
      }
    }
    for (const t of activeCatalog) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        picked.push(t);
      }
      if (picked.length >= 16) break;
    }
    return picked;
  }, [tracks, activeCatalog, topFilter, recentLog, playCounts, artistPlayCounts, favoriteIds]);

  // 2. ALBUMS FOR YOU (Apple Top Albums RSS + discovered album records)
  const albumsForYou = useMemo(() => {
    const map = new Map<string, AlbumChartEntry>();
    const addAlbum = (alb: AlbumChartEntry) => {
      if (!alb.coverUrl || !alb.title) return;
      if (alb.type === 'Single' && alb.title.toLowerCase().includes('— single')) return;
      const key = `${alb.artistName.toLowerCase()}::${alb.title.toLowerCase()}`;
      if (!map.has(key)) map.set(key, alb);
    };

    chartAlbums.forEach(addAlbum);
    catalogAlbums.forEach(addAlbum);

    if (map.size < 8) {
      for (const t of activeCatalog) {
        if (!t.album || t.album.toLowerCase().includes('— single')) continue;
        addAlbum({
          id: `alb-tr-${t.collectionId ?? t.id}`,
          collectionId: t.collectionId,
          title: t.album,
          year: t.year,
          type: 'Album',
          coverUrl: t.coverUrl,
          trackIds: [t.id],
          artistName: t.artist,
          artistId: t.artistId,
          genre: t.genre,
        });
      }
    }

    return Array.from(map.values()).slice(0, 16);
  }, [chartAlbums, catalogAlbums, activeCatalog]);

  // 3. TRENDING (Apple RSS Most-Played Songs + top popularity catalog fallback)
  const trendingTracks = useMemo(() => {
    const seen = new Set<string>();
    const list: Track[] = [];
    const filterMatch = (t: Track) =>
      topFilter === 'All' || (topFilter === 'Mixes' ? t.category === 'Mixes' : t.category === 'Music');

    for (const t of chartTracks) {
      if (!seen.has(t.id) && filterMatch(t)) {
        seen.add(t.id);
        list.push(t);
      }
    }
    if (list.length < 10) {
      const sorted = [...activeCatalog].sort(
        (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
      );
      for (const t of sorted) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          list.push(t);
        }
        if (list.length >= 16) break;
      }
    }
    return list.slice(0, 16);
  }, [chartTracks, activeCatalog, topFilter]);

  // 4. NEW RELEASES (newest drops first)
  const newReleases = useMemo(
    () =>
      [...activeCatalog]
        .sort((a, b) => b.year - a.year || (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, 16),
    [activeCatalog],
  );

  const artistProfilesList = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        artistId?: number;
        spotifyUrl?: string;
        name: string;
        genre: string;
        coverUrl: string;
        userPlays: number;
      }
    >();
    const usedIds = new Set<string>();
    const spotifyByName = new Map(spotifyArtists.map((sp) => [sp.name.toLowerCase(), sp]));

    realArtists.forEach((artist) => {
      const nameKey = artist.name.toLowerCase();
      const sp = spotifyByName.get(nameKey);
      if (!map.has(nameKey) && !usedIds.has(artist.id)) {
        usedIds.add(artist.id);
        map.set(nameKey, {
          id: artist.id,
          artistId: artist.artistId,
          spotifyUrl: sp?.spotifyUrl,
          name: artist.name,
          genre: sp?.genres[0] || artist.genre,
          coverUrl: sp?.coverUrl || artist.coverUrl,
          userPlays: artistPlayCounts[artist.name] ?? 0,
        });
      }
    });

    tracks.forEach((t) => {
      const nameKey = t.artist.toLowerCase();
      const sp = spotifyByName.get(nameKey);
      if (!map.has(nameKey)) {
        const slug = nameKey.replace(/[^a-z0-9]+/g, '-');
        let candidateId = `art-${t.artistId ?? slug}-${slug}`;
        if (usedIds.has(candidateId)) candidateId = `art-${slug}`;
        usedIds.add(candidateId);
        map.set(nameKey, {
          id: candidateId,
          artistId: t.artistId,
          spotifyUrl: sp?.spotifyUrl,
          name: t.artist,
          genre: sp?.genres[0] || t.genre,
          coverUrl: sp?.coverUrl || t.coverUrl,
          userPlays: artistPlayCounts[t.artist] ?? 0,
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => {
        const aFollowed = followedArtists.has(a.name) ? 1 : 0;
        const bFollowed = followedArtists.has(b.name) ? 1 : 0;
        if (aFollowed !== bFollowed) return bFollowed - aFollowed;
        return b.userPlays - a.userPlays;
      })
      .slice(0, 16);
  }, [realArtists, spotifyArtists, tracks, artistPlayCounts, followedArtists]);

  // Fetch real Deezer portraits for circular artist row
  useEffect(() => {
    if (artistProfilesList.length === 0) return;
    let cancelled = false;

    artistProfilesList.forEach((art) => {
      const cached = getCachedArtistPhoto(art.name);
      if (cached) {
        setArtistPhotos((prev) => (prev[art.name] ? prev : { ...prev, [art.name]: cached }));
        return;
      }
      if (!isOnline || offlineMode) return;
      fetchRealArtistPhoto(art.name, art.coverUrl).then((url) => {
        if (!cancelled && url) {
          setArtistPhotos((prev) => ({ ...prev, [art.name]: url }));
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [artistProfilesList, isOnline, offlineMode]);

  // Wide 14-track multi-genre spotlight pool cycling cleanly every 1.5s (non-looping)
  const featuredHeroes = useMemo(() => {
    const seenArtists = new Set<string>();
    const pool = [...chartTracks, ...activeCatalog];
    const genreBuckets = new Map<string, Track[]>();

    for (const t of pool) {
      const artKey = t.artist.toLowerCase();
      if (seenArtists.has(artKey)) continue;
      seenArtists.add(artKey);
      const bucketKey = (t.genre || 'Music').toLowerCase();
      const bucket = genreBuckets.get(bucketKey) ?? [];
      bucket.push(t);
      genreBuckets.set(bucketKey, bucket);
    }

    const interleaved: Track[] = [];
    const iterators = Array.from(genreBuckets.values());
    let added = true;
    let pass = 0;
    while (added && interleaved.length < 14) {
      added = false;
      for (const bucket of iterators) {
        if (pass < bucket.length) {
          interleaved.push(bucket[pass]);
          added = true;
          if (interleaved.length >= 14) break;
        }
      }
      pass += 1;
    }

    return interleaved.map((t) => ({
      id: `hero-${t.id}`,
      badge: `${(t.genre || 'FEATURED').toUpperCase()} PICK`,
      title: t.title,
      subtitle: t.artist,
      track: t,
    }));
  }, [chartTracks, activeCatalog]);

  // Auto-advance hero banner every 1.5s and stop cleanly on final slide (non-looping)
  useEffect(() => {
    if (heroAutoStopped || featuredHeroes.length <= 1) return;
    if (heroIndex >= featuredHeroes.length - 1) {
      setHeroAutoStopped(true);
      return;
    }
    const timer = window.setInterval(() => {
      setHeroIndex((cur) => {
        if (cur >= featuredHeroes.length - 1) {
          setHeroAutoStopped(true);
          return cur;
        }
        return cur + 1;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [heroAutoStopped, heroIndex, featuredHeroes.length]);

  useEffect(() => {
    if (heroIndex >= featuredHeroes.length && featuredHeroes.length > 0) {
      setHeroIndex(0);
    }
  }, [featuredHeroes.length, heroIndex]);

  const mixClusters = useMemo(() => {
    const genreGroups = new Map<string, Track[]>();
    for (const t of activeCatalog) {
      const bucket = t.genre || 'Music';
      const list = genreGroups.get(bucket) ?? [];
      list.push(t);
      genreGroups.set(bucket, list);
    }
    return Array.from(genreGroups.entries())
      .slice(0, 6)
      .map(([genre, groupTracks]) => ({
        id: `mix-${genre.toLowerCase()}`,
        title: `${genre} Radio`,
        subtitle: `${groupTracks.length} tracks · Continuous session`,
        description: `Featuring ${groupTracks
          .slice(0, 2)
          .map((t) => t.artist)
          .join(', ')} and more.`,
        tracks: groupTracks,
        coverUrl: groupTracks[0]?.coverUrl ?? '',
      }));
  }, [activeCatalog]);

  const currentHero = featuredHeroes[heroIndex] ?? featuredHeroes[0];

  const handleTrackPress = (track: Track, list: Track[]) => {
    if (track.id === activeTrackId) {
      if (!isPlaying) onTogglePlay();
      onOpenPlayer();
    } else {
      onPlayTrack(track, list);
    }
  };

  const handleAlbumPress = async (alb: AlbumChartEntry) => {
    const existingTracks = tracks.filter(
      (t) =>
        (alb.collectionId && t.collectionId === alb.collectionId) ||
        alb.trackIds.includes(t.id) ||
        (t.artist.toLowerCase() === alb.artistName.toLowerCase() &&
          t.album.toLowerCase() === alb.title.toLowerCase()),
    );

    if (onOpenCollection) {
      onOpenCollection({
        id: alb.id,
        kind: 'album',
        title: alb.title,
        subtitle: alb.artistName,
        coverUrl: alb.coverUrl,
        year: alb.year,
        genre: alb.genre,
        collectionId: alb.collectionId,
        tracks: existingTracks,
      });
      return;
    }

    if (existingTracks.length >= 2) {
      handleTrackPress(existingTracks[0], existingTracks);
      return;
    }

    let resolved: Track[] = [];
    if (alb.collectionId && isOnline && !offlineMode) {
      resolved = await lookupAlbumTracks(alb.collectionId);
    }
    if (resolved.length === 0 && isOnline && !offlineMode) {
      const searchRes = await searchItunesCatalog(`${alb.title} ${alb.artistName}`, 12);
      const exactAlb = searchRes.tracks.filter(
        (t) =>
          t.album.toLowerCase().includes(alb.title.toLowerCase()) ||
          t.artist.toLowerCase().includes(alb.artistName.toLowerCase()),
      );
      resolved = exactAlb.length > 0 ? exactAlb : searchRes.tracks;
    }
    if (resolved.length > 0) {
      onRegisterTracks?.(resolved);
      onPlayTrack(resolved[0], resolved);
    } else if (existingTracks.length > 0) {
      handleTrackPress(existingTracks[0], existingTracks);
    }
  };

  const renderNetflixTrackCard = (
    track: Track,
    list: Track[],
    keyPrefix: string,
    idx: number,
    gridMode: boolean,
  ) => {
    const isCurrent = track.id === activeTrackId;
    return (
      <div
        key={`${keyPrefix}-${track.id}-${idx}`}
        className={`spring-card group flex flex-col ${
          gridMode ? 'w-full' : 'w-64 sm:w-72 shrink-0 snap-start'
        }`}
      >
        <button
          type="button"
          onClick={() => handleTrackPress(track, list)}
          className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-950 text-left focus-visible:outline-none ${
            isCurrent ? 'ring-1 ring-white/55' : ''
          }`}
        >
          <CoverArt
            src={track.coverUrl}
            alt={track.title}
            fallbackGradient={track.fallbackGradient}
            className="h-full w-full transition-transform duration-300 group-hover:scale-105"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
            <p className="truncate text-sm font-bold text-white leading-tight">{track.title}</p>
            <p className="mt-0.5 truncate text-xs text-white/75">{track.artist}</p>
          </div>
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header Filters + Audio Quality Pill */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <SpringPillTabs
          items={HOME_FILTER_TABS}
          activeId={topFilter}
          onChange={onFilterChange}
          variant="hug"
          size="sm"
          ariaLabel="Home feed filter"
          className="liquid-glass p-1"
        />

        <div className="flex items-center gap-2">
          {(!isOnline || offlineMode) && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-200">
              <WifiOff className="h-3 w-3" />
              <span>Offline</span>
            </span>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <KlynLogo className="h-4 w-4 rounded-[4px]" />
            <span>{audioQuality}</span>
          </button>
        </div>
      </section>

      {/* Compact Auto-Advancing (1.5s, Non-Looping) Diverse Hero Recommendation Banner */}
      {topFilter === 'All' && currentHero && (
        <section aria-label="Recommended spotlight">
          <div className="liquid-glass-elevated relative overflow-hidden rounded-3xl p-4 sm:p-5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-14 -top-14 h-56 w-56 rounded-full opacity-40 blur-3xl transition-colors duration-700"
              style={{ background: currentHero.track.primaryColor }}
            />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
              <button
                type="button"
                onClick={() => handleTrackPress(currentHero.track, activeCatalog)}
                className="relative aspect-video sm:aspect-square w-full sm:w-36 shrink-0 overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl"
              >
                <CoverArt
                  src={currentHero.track.coverUrl}
                  alt={currentHero.title}
                  fallbackGradient={currentHero.track.fallbackGradient}
                  className="h-full w-full"
                />
              </button>

              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em] uppercase text-white/70">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{currentHero.badge}</span>
                </div>
                <h1 className="font-display mt-1 text-xl sm:text-3xl font-bold tracking-tight text-white line-clamp-1">
                  {currentHero.title}
                </h1>
                <button
                  type="button"
                  onClick={() => onOpenArtist(currentHero.subtitle)}
                  className="mt-0.5 text-sm font-medium text-white/70 hover:text-white hover:underline"
                >
                  {currentHero.subtitle}
                </button>

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleTrackPress(currentHero.track, activeCatalog)}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition-transform hover:scale-[1.02] active:scale-95"
                    >
                      {currentHero.track.id === activeTrackId && isPlaying ? (
                        <>
                          <Pause className="h-3.5 w-3.5 fill-current" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Listen Now</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenArtist(currentHero.subtitle)}
                      className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white/90 hover:bg-white/14 transition-colors"
                    >
                      <span>Artist Profile</span>
                    </button>
                  </div>

                  {featuredHeroes.length > 1 && (
                    <div className="flex items-center gap-1">
                      {featuredHeroes.map((h, i) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => {
                            setHeroAutoStopped(true);
                            setHeroIndex(i);
                          }}
                          aria-label={`View recommendation ${i + 1}`}
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            i === heroIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Dynamic Mixes Section when Mixes filter is active */}
      {topFilter === 'Mixes' && mixClusters.length > 0 && (
        <section aria-label="Curated mixes and playlists">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Curated Mixes &amp; Radio
            </h2>
            <span className="text-xs text-white/50">Continuous sessions</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {mixClusters.map((mix) => {
              const first = mix.tracks[0];
              if (!first) return null;
              const isActive = mix.tracks.some((t) => t.id === activeTrackId);

              return (
                <button
                  key={mix.id}
                  type="button"
                  onClick={() => handleTrackPress(first, mix.tracks)}
                  className="liquid-glass group relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-left transition-all duration-200 hover:bg-white/[0.09] active:scale-[0.99]"
                >
                  <CoverArt
                    src={mix.coverUrl}
                    alt={mix.title}
                    fallbackGradient={first.fallbackGradient}
                    className="h-20 w-20 shrink-0 rounded-2xl"
                  />
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
                      <Radio className="h-3.5 w-3.5" />
                      <span>{mix.subtitle}</span>
                    </div>
                    <h3 className="font-display mt-0.5 truncate text-lg font-bold text-white">
                      {mix.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-white/65">{mix.description}</p>
                  </div>
                  <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white group-hover:bg-white group-hover:text-black transition-colors">
                    {isActive && isPlaying ? (
                      <Pause className="h-4 w-4 fill-current" />
                    ) : (
                      <Play className="h-4 w-4 fill-current translate-x-0.5" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 1. FOR YOU */}
      <section aria-label="For You">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white">For You</h2>
          {forYouTracks.length > 0 && (
            <button
              type="button"
              onClick={() => setExpandedShelf((cur) => (cur === 'forYou' ? null : 'forYou'))}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white/65 hover:text-white transition-colors"
            >
              <span>{expandedShelf === 'forYou' ? 'Collapse' : 'Show All'}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  expandedShelf === 'forYou' ? 'rotate-90' : ''
                }`}
              />
            </button>
          )}
        </div>

        {forYouTracks.length === 0 && isLoadingHomeCatalog ? (
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`fy-skeleton-${idx}`}
                className="aspect-video w-64 sm:w-72 shrink-0 rounded-2xl bg-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : forYouTracks.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-6 text-center space-y-3">
            <p className="text-xs text-white/65">
              {homeCatalogError && isOnline && !offlineMode
                ? 'Live catalog is currently unreachable.'
                : 'Use Search to play any song or artist and build your For You mix.'}
            </p>
            {homeCatalogError && isOnline && !offlineMode && (
              <button
                type="button"
                onClick={() => setCatalogRetryTick((t) => t + 1)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/12 border border-white/16 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              expandedShelf === 'forYou'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0'
            }
          >
            {forYouTracks.map((track, idx) =>
              renderNetflixTrackCard(
                track,
                forYouTracks,
                'fy',
                idx,
                expandedShelf === 'forYou',
              ),
            )}
          </div>
        )}
      </section>

      {/* 2. ALBUMS FOR YOU */}
      {albumsForYou.length > 0 && (
        <section aria-label="Albums For You">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Albums For You
            </h2>
            <button
              type="button"
              onClick={() =>
                setExpandedShelf((cur) => (cur === 'albumsForYou' ? null : 'albumsForYou'))
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-white/65 hover:text-white transition-colors"
            >
              <span>{expandedShelf === 'albumsForYou' ? 'Collapse' : 'Show All'}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  expandedShelf === 'albumsForYou' ? 'rotate-90' : ''
                }`}
              />
            </button>
          </div>

          <div
            className={
              expandedShelf === 'albumsForYou'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0'
            }
          >
            {albumsForYou.map((alb, idx) => (
              <div
                key={`alb-fy-${alb.id}-${idx}`}
                className={`spring-card group flex flex-col ${
                  expandedShelf === 'albumsForYou'
                    ? 'w-full'
                    : 'w-64 sm:w-72 shrink-0 snap-start'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void handleAlbumPress(alb)}
                  className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-950 text-left focus-visible:outline-none"
                >
                  <CoverArt
                    src={alb.coverUrl}
                    alt={alb.title}
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                    <p className="truncate text-sm font-bold text-white leading-tight">
                      {alb.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/75">{alb.artistName}</p>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. TRENDING */}
      {trendingTracks.length > 0 && (
        <section aria-label="Trending">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">Trending</h2>
            <button
              type="button"
              onClick={() => setExpandedShelf((cur) => (cur === 'trending' ? null : 'trending'))}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white/65 hover:text-white transition-colors"
            >
              <span>{expandedShelf === 'trending' ? 'Collapse' : 'Show All'}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  expandedShelf === 'trending' ? 'rotate-90' : ''
                }`}
              />
            </button>
          </div>

          <div
            className={
              expandedShelf === 'trending'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0'
            }
          >
            {trendingTracks.map((track, idx) =>
              renderNetflixTrackCard(
                track,
                trendingTracks,
                'trend',
                idx,
                expandedShelf === 'trending',
              ),
            )}
          </div>
        </section>
      )}

      {/* 4. NEW RELEASES */}
      {newReleases.length > 0 && (
        <section aria-label="New Releases">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              New Releases
            </h2>
            <button
              type="button"
              onClick={() =>
                setExpandedShelf((cur) => (cur === 'newReleases' ? null : 'newReleases'))
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-white/65 hover:text-white transition-colors"
            >
              <span>{expandedShelf === 'newReleases' ? 'Collapse' : 'Show All'}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  expandedShelf === 'newReleases' ? 'rotate-90' : ''
                }`}
              />
            </button>
          </div>

          <div
            className={
              expandedShelf === 'newReleases'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0'
            }
          >
            {newReleases.map((track, idx) =>
              renderNetflixTrackCard(
                track,
                newReleases,
                'new',
                idx,
                expandedShelf === 'newReleases',
              ),
            )}
          </div>
        </section>
      )}

      {/* 5. YOUR TOP ARTISTS (Pure Borderless Circular Portraits, Zero Boxes/Rings) */}
      <section aria-label="Your Top Artists">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
            Your Top Artists
          </h2>
          <span className="text-xs text-white/50">Tap to open</span>
        </div>

        <div className="no-scrollbar flex gap-5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {artistProfilesList.length === 0 && isLoadingArtists ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`artist-skeleton-${idx}`}
                className="flex w-24 sm:w-28 shrink-0 flex-col items-center animate-pulse"
              >
                <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-white/10" />
                <div className="mt-2.5 h-3 w-18 rounded-full bg-white/10" />
              </div>
            ))
          ) : (
            artistProfilesList.map((artist, idx) => {
              const photoUrl =
                artistPhotos[artist.name] || getCachedArtistPhoto(artist.name) || artist.coverUrl;
              return (
                <button
                  key={`artist-${artist.id}-${idx}`}
                  type="button"
                  onClick={() => onOpenArtist(artist.name)}
                  className="spring-card group flex w-24 sm:w-28 shrink-0 flex-col items-center text-center focus-visible:outline-none"
                >
                  <div className="h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full bg-zinc-900">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={artist.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white/75">
                        {artist.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="mt-2.5 w-full truncate text-xs sm:text-sm font-semibold text-white">
                    {artist.name}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* 6. SYNCED PLAYLISTS & RADIOS */}
      {(playlists.length > 0 || spotifyPlaylists.length > 0 || mixClusters.length > 0) && (
        <section aria-label="Synced Playlists and Radios">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Synced Playlists &amp; Radios
            </h2>
            <span className="text-xs text-white/50">Playlists &amp; genre mixes</span>
          </div>

          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {playlists.map((pl, idx) => {
              const plTracks = tracks.filter((t) => pl.trackIds.includes(t.id));
              const first = plTracks[0] ?? activeCatalog[0];
              const subLabel = pl.sourceProvider
                ? `${pl.sourceProvider.charAt(0).toUpperCase() + pl.sourceProvider.slice(1)} Sync`
                : pl.curator;
              return (
                <button
                  key={`home-pl-${pl.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (onOpenCollection) {
                      onOpenCollection({
                        id: pl.id,
                        kind: 'playlist',
                        title: pl.title,
                        subtitle: subLabel,
                        description: pl.description,
                        coverUrl: pl.coverUrl || first?.coverUrl || '',
                        spotifyId: pl.spotifyId,
                        spotifyUrl: pl.spotifyUrl,
                        tracks: plTracks,
                      });
                    } else if (first) {
                      handleTrackPress(first, plTracks.length > 0 ? plTracks : activeCatalog);
                    }
                  }}
                  className="spring-card group relative aspect-video w-64 sm:w-72 shrink-0 snap-start overflow-hidden rounded-2xl bg-zinc-950 text-left focus-visible:outline-none"
                >
                  <CoverArt
                    src={pl.coverUrl || first?.coverUrl || ''}
                    alt={pl.title}
                    fallbackGradient={first?.fallbackGradient}
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                    <p className="truncate text-sm font-bold text-white leading-tight">{pl.title}</p>
                    <p className="mt-0.5 truncate text-xs text-white/75">{subLabel}</p>
                  </div>
                </button>
              );
            })}

            {spotifyPlaylists.map((spl, idx) => (
              <div
                key={`sp-pl-${spl.id}-${idx}`}
                className="spring-card group flex w-64 sm:w-72 shrink-0 snap-start flex-col gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenCollection) {
                      onOpenCollection({
                        id: `sp-pl-${spl.id}`,
                        kind: 'playlist',
                        title: spl.name,
                        subtitle: `${spl.ownerName} · ${spl.categoryName}`,
                        description: spl.description,
                        coverUrl: spl.coverUrl,
                        spotifyId: spl.id,
                        spotifyUrl: spl.spotifyUrl,
                        tracks: [],
                      });
                    } else {
                      void getSpotifyPlaylistTracks(spl.id, 20).then((plTracks) => {
                        if (plTracks.length > 0) {
                          onRegisterTracks?.(plTracks);
                          onPlayTrack(plTracks[0], plTracks);
                        }
                      });
                    }
                  }}
                  className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black text-left focus-visible:outline-none"
                >
                  <img
                    src={spl.coverUrl}
                    alt={spl.name}
                    className="h-full w-full object-contain bg-black"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                    <p className="truncate text-sm font-bold text-white leading-tight">{spl.name}</p>
                    <p className="mt-0.5 truncate text-xs text-white/75">{spl.categoryName}</p>
                  </div>
                </button>
                <a
                  href={spl.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1 text-[11px] font-medium text-white/50 hover:text-white/85"
                >
                  <span>Spotify</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            ))}

            {mixClusters.map((mix, idx) => {
              const first = mix.tracks[0];
              if (!first) return null;
              return (
                <button
                  key={`home-mix-${mix.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (onOpenCollection) {
                      onOpenCollection({
                        id: mix.id,
                        kind: 'radio',
                        title: mix.title,
                        subtitle: mix.subtitle,
                        description: mix.description,
                        coverUrl: mix.coverUrl,
                        tracks: mix.tracks,
                      });
                    } else {
                      handleTrackPress(first, mix.tracks);
                    }
                  }}
                  className="spring-card group relative aspect-video w-64 sm:w-72 shrink-0 snap-start overflow-hidden rounded-2xl bg-zinc-950 text-left focus-visible:outline-none"
                >
                  <CoverArt
                    src={mix.coverUrl}
                    alt={mix.title}
                    fallbackGradient={first.fallbackGradient}
                    className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                    <p className="truncate text-sm font-bold text-white leading-tight">{mix.title}</p>
                    <p className="mt-0.5 truncate text-xs text-white/75">{mix.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* BROWSE CATEGORIES (Spotify Categories when token available) */}
      {spotifyCategories.length > 0 && (
        <section aria-label="Browse Categories">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Browse Categories
            </h2>
            <a
              href="https://open.spotify.com/search"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-white/55 hover:text-white"
            >
              <span>Spotify Categories</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {spotifyCategories.map((cat) => (
              <div
                key={`sp-cat-${cat.id}`}
                className="spring-card group flex w-64 sm:w-72 shrink-0 snap-start flex-col gap-1.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    void getSpotifyCategoryPlaylists(cat.id, 10, cat.name).then(async (pls) => {
                      const firstPl = pls[0];
                      if (firstPl && onOpenCollection) {
                        onOpenCollection({
                          id: `sp-pl-${firstPl.id}`,
                          kind: 'playlist',
                          title: firstPl.name,
                          subtitle: `${cat.name} · ${firstPl.ownerName}`,
                          description: firstPl.description,
                          coverUrl: firstPl.coverUrl,
                          spotifyId: firstPl.id,
                          spotifyUrl: firstPl.spotifyUrl,
                          tracks: [],
                        });
                      } else {
                        const fallback = await searchItunesCatalog(cat.name, 16);
                        if (fallback.tracks.length > 0) {
                          onRegisterTracks?.(fallback.tracks);
                          if (onOpenCollection) {
                            onOpenCollection({
                              id: `cat-${cat.id}`,
                              kind: 'playlist',
                              title: cat.name,
                              subtitle: 'Category Mix',
                              coverUrl: cat.coverUrl,
                              spotifyUrl: cat.spotifyUrl,
                              tracks: fallback.tracks,
                            });
                          } else {
                            onPlayTrack(fallback.tracks[0], fallback.tracks);
                          }
                        }
                      }
                    });
                  }}
                  className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black text-left focus-visible:outline-none"
                >
                  <img
                    src={cat.coverUrl}
                    alt={cat.name}
                    className="h-full w-full object-contain bg-black"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"
                  />
                  <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                    <p className="truncate text-sm font-bold text-white leading-tight">{cat.name}</p>
                  </div>
                </button>
                <a
                  href={cat.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1 text-[11px] font-medium text-white/50 hover:text-white/85"
                >
                  <span>Spotify</span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. PODCASTS & AUDIOBOOKS */}
      {podcastsAndBooks.length > 0 && (
        <section aria-label="Podcasts and Audiobooks">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Podcasts &amp; Audiobooks
            </h2>
            <button
              type="button"
              onClick={() => setExpandedShelf((cur) => (cur === 'shows' ? null : 'shows'))}
              className="inline-flex items-center gap-1 text-xs font-semibold text-white/65 hover:text-white transition-colors"
            >
              <span>{expandedShelf === 'shows' ? 'Collapse' : 'Show All'}</span>
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${
                  expandedShelf === 'shows' ? 'rotate-90' : ''
                }`}
              />
            </button>
          </div>

          <div
            className={
              expandedShelf === 'shows'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0'
            }
          >
            {podcastsAndBooks.map((show, idx) => (
              <button
                key={`show-${show.id}-${idx}`}
                type="button"
                onClick={() => onOpenShow(show)}
                className={`spring-card group relative aspect-video overflow-hidden rounded-2xl bg-zinc-950 text-left ${
                  expandedShelf === 'shows' ? 'w-full' : 'w-64 sm:w-72 shrink-0 snap-start'
                }`}
              >
                <CoverArt
                  src={show.coverUrl}
                  alt={show.title}
                  className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
                  <p className="truncate text-sm font-bold text-white leading-tight">{show.title}</p>
                  <p className="mt-0.5 truncate text-xs text-white/75">
                    {show.author} · {show.kind === 'audiobook' ? 'Audiobook' : 'Podcast'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
