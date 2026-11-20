import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Flame,
  Headphones,
  Pause,
  Play,
  Plus,
  Radio,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { formatTime } from '../../data/catalog';
import {
  ArtistAlbum,
  ListeningLogEntry,
  PlaylistItem,
  TopFilterTab,
  Track,
  UserAccount,
} from '../../types/music';
import {
  RealArtistCatalogEntry,
  fetchHomeCatalogFromItunes,
  fetchRealArtistsCatalog,
} from '../../utils/itunesApi';
import { rankCatalogForUser } from '../../utils/klynAiBlend';
import { BrandLogo } from '../BrandLogo';
import { CoverArt } from '../CoverArt';

interface HomeViewProps {
  tracks: Track[];
  currentUser: UserAccount;
  favoriteIds: Set<string>;
  playCounts: Record<string, number>;
  artistPlayCounts: Record<string, number>;
  playlists: PlaylistItem[];
  recentLog: ListeningLogEntry[];
  followedArtists: Set<string>;
  topFilter: TopFilterTab;
  activeTrackId: string;
  isPlaying: boolean;
  audioQuality: string;
  onPlayTrack: (track: Track, queueList?: Track[]) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onOpenSettings: () => void;
  onOpenArtist: (artistName: string) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export const HomeView: React.FC<HomeViewProps> = ({
  tracks,
  currentUser,
  favoriteIds,
  playCounts,
  artistPlayCounts,
  playlists,
  recentLog,
  followedArtists,
  topFilter,
  activeTrackId,
  isPlaying,
  audioQuality,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onOpenSettings,
  onOpenArtist,
  onOpenAddToPlaylist,
  onRegisterTracks,
}) => {
  const [greeting, setGreeting] = useState<string>(() => getGreeting());
  const [realArtists, setRealArtists] = useState<RealArtistCatalogEntry[]>([]);
  const [fetchedAlbums, setFetchedAlbums] = useState<
    Array<ArtistAlbum & { artistName: string; artistId?: number; genre: string }>
  >([]);
  const [isLoadingHomeCatalog, setIsLoadingHomeCatalog] = useState<boolean>(false);
  const [isLoadingArtists, setIsLoadingArtists] = useState<boolean>(false);

  useEffect(() => {
    const syncGreeting = () => setGreeting(getGreeting());
    syncGreeting();
    const timer = window.setInterval(syncGreeting, 30_000);
    window.addEventListener('focus', syncGreeting);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncGreeting);
    };
  }, []);

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
    const controller = new AbortController();
    setIsLoadingHomeCatalog(true);
    const genres = genresKey ? genresKey.split('|') : [];

    fetchHomeCatalogFromItunes(genres, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.albums.length > 0) {
          setFetchedAlbums(res.albums);
        }
        if (res.tracks.length > 0) {
          onRegisterTracks?.(res.tracks);
        }
      })
      .catch(() => {
        // Silent network resilience
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingHomeCatalog(false);
      });

    return () => controller.abort();
  }, [genresKey, onRegisterTracks]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingArtists(true);
    const genres = genresKey ? genresKey.split('|') : [];
    const priorities = priorityArtistKey ? priorityArtistKey.split('|') : [];

    fetchRealArtistsCatalog(genres, priorities, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        setRealArtists(entries);
        const fetchedTracks = entries.flatMap((entry) => entry.tracks);
        if (fetchedTracks.length > 0) {
          onRegisterTracks?.(fetchedTracks);
        }
      })
      .catch(() => {
        // Silent network resilience
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingArtists(false);
      });

    return () => controller.abort();
  }, [genresKey, priorityArtistKey, onRegisterTracks]);

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
      return personalizedCatalog.filter((t) => t.category === 'Music' || t.category === 'Spatial');
    }
    if (topFilter === 'Spatial') {
      return personalizedCatalog.filter(
        (t) => t.category === 'Spatial' || t.quality === 'Dolby Atmos',
      );
    }
    return personalizedCatalog.filter((t) => t.category === 'Mixes');
  }, [personalizedCatalog, topFilter]);

  const activeCatalog = filteredTracks.length > 0 ? filteredTracks : personalizedCatalog;

  // Quick Pics strictly powered by real listening data first, falling back to real discovery tracks only when 0 listens
  const quickPics = useMemo(() => {
    const allowedIds = new Set(activeCatalog.map((t) => t.id));
    const recentOrderMap = new Map<string, number>();
    recentLog.forEach((entry, idx) => {
      recentOrderMap.set(entry.trackId, idx);
    });

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
      if (picked.length >= 8) break;
    }

    if (picked.length < 4) {
      for (const t of activeCatalog) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          picked.push(t);
        }
        if (picked.length >= 6) break;
      }
    }

    return picked;
  }, [tracks, activeCatalog, topFilter, recentLog, playCounts, artistPlayCounts, favoriteIds]);

  const hasListeningHistory = useMemo(
    () =>
      recentLog.length > 0 ||
      Object.values(playCounts).some((count) => count > 0) ||
      favoriteIds.size > 0,
    [recentLog, playCounts, favoriteIds],
  );

  const heavyRotation = useMemo(() => {
    const playedTracks = activeCatalog
      .filter((t) => (playCounts[t.id] ?? 0) > 0)
      .sort((a, b) => (playCounts[b.id] ?? 0) - (playCounts[a.id] ?? 0));
    return playedTracks.length >= 3 ? playedTracks : [...activeCatalog].slice(0, 12).reverse();
  }, [activeCatalog, playCounts]);

  const trendingCharts = useMemo(
    () => activeCatalog.slice(0, 8),
    [activeCatalog],
  );

  const newReleases = useMemo(() => {
    const sorted = [...activeCatalog].sort((a, b) => b.year - a.year);
    return sorted.slice(0, 12);
  }, [activeCatalog]);

  const recentlyPlayedTracks = useMemo(() => {
    const mapped = recentLog
      .map((entry) => tracks.find((t) => t.id === entry.trackId))
      .filter((t): t is Track => Boolean(t));
    if (topFilter === 'All') return mapped;
    return mapped.filter((t) => activeCatalog.some((c) => c.id === t.id));
  }, [recentLog, tracks, topFilter, activeCatalog]);

  const albumsForYou = useMemo(() => {
    const preferredGenres = new Set(currentUser.favoriteGenres.map((g) => g.toLowerCase()));
    const map = new Map<
      string,
      ArtistAlbum & { artistName: string; artistId?: number; genre: string }
    >();

    for (const alb of fetchedAlbums) {
      const key = `${alb.artistName.toLowerCase()}::${alb.title.toLowerCase()}`;
      if (!map.has(key)) map.set(key, alb);
    }

    for (const t of activeCatalog) {
      const key = `${t.artist.toLowerCase()}::${t.album.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        if (!existing.trackIds.includes(t.id)) existing.trackIds.push(t.id);
      } else {
        map.set(key, {
          id: `alb-${t.collectionId ?? t.id}`,
          collectionId: t.collectionId,
          title: t.album,
          year: t.year,
          type: t.album.toLowerCase().includes('single') ? 'Single' : 'Album',
          coverUrl: t.coverUrl,
          trackIds: [t.id],
          artistName: t.artist,
          artistId: t.artistId,
          genre: t.genre,
        });
      }
    }

    const list = Array.from(map.values());
    const filtered =
      topFilter === 'All'
        ? list
        : list.filter((alb) =>
            alb.trackIds.some((id) => activeCatalog.some((t) => t.id === id)),
          );

    return [...filtered]
      .sort((a, b) => {
        const aMatch = preferredGenres.has(a.genre.toLowerCase()) ? 1 : 0;
        const bMatch = preferredGenres.has(b.genre.toLowerCase()) ? 1 : 0;
        return bMatch - aMatch;
      })
      .slice(0, 14);
  }, [fetchedAlbums, activeCatalog, topFilter, currentUser.favoriteGenres]);

  const artistProfilesList = useMemo(() => {
    const map = new Map<
      string,
      { id: string; artistId?: number; name: string; genre: string; coverUrl: string; userPlays: number }
    >();
    const usedIds = new Set<string>();

    realArtists.forEach((artist) => {
      const nameKey = artist.name.toLowerCase();
      if (!map.has(nameKey) && !usedIds.has(artist.id)) {
        usedIds.add(artist.id);
        map.set(nameKey, {
          id: artist.id,
          artistId: artist.artistId,
          name: artist.name,
          genre: artist.genre,
          coverUrl: artist.coverUrl,
          userPlays: artistPlayCounts[artist.name] ?? 0,
        });
      }
    });

    tracks.forEach((t) => {
      const nameKey = t.artist.toLowerCase();
      if (!map.has(nameKey)) {
        const slug = nameKey.replace(/[^a-z0-9]+/g, '-');
        let candidateId = `art-${t.artistId ?? slug}-${slug}`;
        if (usedIds.has(candidateId)) {
          candidateId = `art-${slug}`;
        }
        usedIds.add(candidateId);
        map.set(nameKey, {
          id: candidateId,
          artistId: t.artistId,
          name: t.artist,
          genre: t.genre,
          coverUrl: t.coverUrl,
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
  }, [realArtists, tracks, artistPlayCounts, followedArtists]);

  const featuredHeroes = useMemo(() => {
    const seenArtists = new Set<string>();
    const heroes: Array<{
      id: string;
      badge: string;
      title: string;
      subtitle: string;
      track: Track;
    }> = [];

    for (const t of activeCatalog) {
      const artKey = t.artist.toLowerCase();
      if (seenArtists.has(artKey)) continue;
      seenArtists.add(artKey);
      heroes.push({
        id: `hero-${t.id}`,
        badge: t.quality === 'Dolby Atmos' ? 'SPATIAL AUDIO' : `${t.genre.toUpperCase()} PICK`,
        title: t.title,
        subtitle: `${t.artist} · ${t.album}`,
        track: t,
      });
      if (heroes.length >= 4) break;
    }

    return heroes;
  }, [activeCatalog]);

  const mixClusters = useMemo(() => {
    const genreGroups = new Map<string, Track[]>();
    for (const t of activeCatalog) {
      const bucket = t.genre || 'Music';
      const list = genreGroups.get(bucket) ?? [];
      list.push(t);
      genreGroups.set(bucket, list);
    }
    return Array.from(genreGroups.entries())
      .slice(0, 4)
      .map(([genre, groupTracks]) => ({
        id: `mix-${genre.toLowerCase()}`,
        title: `${genre} Mix`,
        subtitle: `${groupTracks.length} tracks · Continuous session`,
        description: `Featuring ${groupTracks
          .slice(0, 2)
          .map((t) => t.artist)
          .join(', ')} and more.`,
        tracks: groupTracks,
        coverUrl: groupTracks[0]?.coverUrl ?? '',
      }));
  }, [activeCatalog]);

  const spatialLead = activeCatalog[0] ?? tracks[0];
  const firstName = currentUser.name.split(' ')[0] || currentUser.name;
  const topGenreSummary = currentUser.favoriteGenres.slice(0, 3).join(' · ');

  const handleTrackPress = (track: Track, list: Track[]) => {
    if (track.id === activeTrackId) {
      if (!isPlaying) onTogglePlay();
      onOpenPlayer();
    } else {
      onPlayTrack(track, list);
    }
  };

  return (
    <div className="space-y-9">
      {/* Greeting Header + Audio Quality Pill */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-white/55">
            {topFilter === 'All'
              ? topGenreSummary
                ? `Curated for ${firstName} · ${topGenreSummary}`
                : `Listen Now · ${firstName}`
              : topFilter === 'Music'
                ? 'Tracks, Albums & Singles'
                : topFilter === 'Spatial'
                  ? 'Dolby Atmos · 360° Soundstage'
                  : 'Curated Mixes & Radio'}
          </p>
          <h1 className="font-display mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            {topFilter === 'All' ? `${greeting}, ${firstName}` : topFilter}
          </h1>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          className="liquid-glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <BrandLogo className="h-4 w-4 rounded-[5px]" />
          <span>{audioQuality}</span>
        </button>
      </section>

      {/* Spatial Spotlight Banner when Spatial filter is active */}
      {topFilter === 'Spatial' && spatialLead && (
        <section aria-label="Spatial Audio Spotlight">
          <div className="liquid-glass relative overflow-hidden rounded-3xl p-5 sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-40 blur-3xl"
              style={{ background: spatialLead.primaryColor }}
            />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
              <CoverArt
                src={spatialLead.coverUrl}
                alt={spatialLead.album}
                fallbackGradient={spatialLead.fallbackGradient}
                className="h-44 w-44 sm:h-48 sm:w-48 shrink-0 rounded-2xl shadow-2xl"
              />
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] uppercase text-white/75">
                  <Headphones className="h-3.5 w-3.5" />
                  <span>Spatial Audio Spotlight · Dolby Atmos</span>
                </div>
                <h2 className="font-display mt-1.5 text-2xl sm:text-3xl font-bold text-white">
                  {spatialLead.title}
                </h2>
                <button
                  type="button"
                  onClick={() => onOpenArtist(spatialLead.artist)}
                  className="mt-1 text-sm text-white/70 hover:text-white hover:underline"
                >
                  {spatialLead.artist} · {spatialLead.album}
                </button>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                  Mastered for multi-dimensional Spatial Audio playback with full-length streaming
                  and time-synced lyrics.
                </p>
                <button
                  type="button"
                  onClick={() => handleTrackPress(spatialLead, activeCatalog)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-95"
                >
                  {spatialLead.id === activeTrackId && isPlaying ? (
                    <>
                      <Pause className="h-4 w-4 fill-current" />
                      <span>Pause Spatial Mix</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>Play in Spatial Audio</span>
                    </>
                  )}
                </button>
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

      {/* 1. QUICK PICS */}
      <section aria-label="Quick Pics">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white">Quick Pics</h2>
          <span className="text-xs text-white/50">
            {hasListeningHistory ? 'From your listening' : 'Personalized picks'}
          </span>
        </div>

        {quickPics.length === 0 && isLoadingHomeCatalog ? (
          <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`qp-skeleton-${idx}`}
                className="liquid-glass flex w-[260px] sm:w-[290px] shrink-0 items-center gap-3 rounded-2xl p-2.5 animate-pulse"
              >
                <div className="h-14 w-14 shrink-0 rounded-xl bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 rounded-full bg-white/10" />
                  <div className="h-2.5 w-20 rounded-full bg-white/[0.06]" />
                </div>
              </div>
            ))}
          </div>
        ) : quickPics.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-6 text-center text-xs text-white/60">
            Use Search to play any song or artist and populate your Quick Pics.
          </div>
        ) : (
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {quickPics.map((track, idx) => {
              const isCurrent = track.id === activeTrackId;
              const userPlays = playCounts[track.id] ?? 0;
              const recentEntry = recentLog.find((entry) => entry.trackId === track.id);
              const metaText =
                userPlays > 0
                  ? `${userPlays} ${userPlays === 1 ? 'play' : 'plays'}`
                  : recentEntry
                    ? recentEntry.playedAtLabel
                    : favoriteIds.has(track.id)
                      ? 'Liked'
                      : '';

              return (
                <div
                  key={`qp-${track.id}-${idx}`}
                  className={`liquid-glass group relative flex w-[260px] sm:w-[290px] shrink-0 snap-start items-center gap-3 overflow-hidden rounded-2xl p-2.5 pr-3 transition-all duration-200 hover:bg-white/[0.09] ${
                    isCurrent ? 'border-white/25 bg-white/[0.09]' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleTrackPress(track, quickPics)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                  >
                    <CoverArt
                      src={track.coverUrl}
                      alt={track.title}
                      fallbackGradient={track.fallbackGradient}
                      className="h-14 w-14 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                      <span
                        role="link"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenArtist(track.artist);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            onOpenArtist(track.artist);
                          }
                        }}
                        className="block truncate text-xs text-white/55 hover:text-white hover:underline"
                      >
                        {track.artist}
                        {metaText ? ` · ${metaText}` : ''}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrent) onTogglePlay();
                      else onPlayTrack(track, quickPics);
                    }}
                    aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                      isCurrent && isPlaying
                        ? 'bg-white text-black opacity-100 scale-100'
                        : 'bg-white text-black opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                    }`}
                  >
                    {isCurrent && isPlaying ? (
                      <Pause className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. HORIZONTAL SCROLLABLE ARTIST PROFILES ROW */}
      <section aria-label="Artist profiles">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white">Artists</h2>
          <span className="text-xs text-white/50">Tap to open profile</span>
        </div>

        <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          {artistProfilesList.length === 0 && isLoadingArtists ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={`artist-skeleton-${idx}`}
                className="liquid-glass flex w-32 sm:w-36 shrink-0 flex-col items-center rounded-3xl p-3.5 animate-pulse"
              >
                <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-white/10" />
                <div className="mt-2.5 h-3.5 w-20 rounded-full bg-white/10" />
                <div className="mt-1.5 h-2.5 w-14 rounded-full bg-white/[0.06]" />
              </div>
            ))
          ) : (
            artistProfilesList.map((artist, idx) => {
              const isFollowed = followedArtists.has(artist.name);
              const subLabel = isFollowed
                ? 'Following'
                : artist.userPlays > 0
                  ? `${artist.userPlays} ${artist.userPlays === 1 ? 'play' : 'plays'}`
                  : artist.genre.split(' · ')[0];
              return (
                <button
                  key={`artist-${artist.id}-${idx}`}
                  type="button"
                  onClick={() => onOpenArtist(artist.name)}
                  className="liquid-glass group flex w-32 sm:w-36 shrink-0 flex-col items-center rounded-3xl p-3.5 text-center transition-all duration-200 hover:bg-white/[0.09] active:scale-[0.98]"
                >
                  <div className="relative">
                    <CoverArt
                      src={artist.coverUrl}
                      alt={artist.name}
                      className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border border-white/18 shadow-lg transition-transform duration-300 group-hover:scale-105"
                    />
                    {isFollowed && (
                      <span
                        title="Following"
                        className="absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center rounded-full bg-white text-black shadow-md border-2 border-[#141417]"
                      >
                        <Check className="h-3 w-3" strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 w-full truncate text-xs sm:text-sm font-semibold text-white">
                    {artist.name}
                  </p>
                  <p className="w-full truncate text-[11px] text-white/50 mt-0.5">{subLabel}</p>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Featured Picks Carousel on All */}
      {topFilter === 'All' && featuredHeroes.length > 0 && (
        <section aria-label="Featured picks">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Featured Picks
            </h2>
            <span className="text-xs text-white/50">Swipe to explore</span>
          </div>

          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {featuredHeroes.map((hero) => {
              const isCurrent = hero.track.id === activeTrackId;
              return (
                <button
                  key={hero.id}
                  type="button"
                  onClick={() => handleTrackPress(hero.track, activeCatalog)}
                  className="group relative flex h-72 sm:h-80 w-[85vw] sm:w-[420px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-3xl border border-white/12 text-left transition-transform duration-300 hover:scale-[1.01] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <CoverArt
                    src={hero.track.coverUrl}
                    alt={hero.title}
                    fallbackGradient={hero.track.fallbackGradient}
                    className="absolute inset-0 h-full w-full"
                    imgClassName="transition-transform duration-700 group-hover:scale-105"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15"
                  />
                  <div className="relative z-10 p-5 sm:p-6">
                    <span className="inline-block text-[10px] font-bold tracking-[0.14em] uppercase text-white/75">
                      {hero.badge}
                    </span>
                    <h3 className="font-display mt-1 text-2xl sm:text-[26px] font-bold leading-tight text-white">
                      {hero.title}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs sm:text-sm text-white/70">
                      {hero.subtitle}
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/16 backdrop-blur-md border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-white">
                      {isCurrent && isPlaying ? (
                        <>
                          <Pause className="h-3.5 w-3.5 fill-current" />
                          <span>Playing Now</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Play Feature</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. ALBUMS FOR YOU */}
      {albumsForYou.length > 0 && (
        <section aria-label="Albums for you">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Albums for You
            </h2>
            <span className="text-xs text-white/50 tabular-nums">
              {albumsForYou.length} releases
            </span>
          </div>

          <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {albumsForYou.map((album, idx) => {
              const albTracks = tracks.filter((t) => album.trackIds.includes(t.id));
              const lead = albTracks[0] ?? activeCatalog[0];
              if (!lead) return null;

              return (
                <div
                  key={`alb-${album.id}-${idx}`}
                  className="liquid-glass group w-44 sm:w-48 shrink-0 rounded-2xl p-2.5 transition-all duration-200 hover:bg-white/[0.09]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleTrackPress(lead, albTracks.length ? albTracks : activeCatalog)
                    }
                    className="relative aspect-square w-full overflow-hidden rounded-xl block"
                  >
                    <CoverArt
                      src={album.coverUrl}
                      alt={album.title}
                      fallbackGradient={lead.fallbackGradient}
                      className="h-full w-full"
                      imgClassName="transition-transform duration-500 group-hover:scale-105"
                    />
                  </button>
                  <p className="mt-2.5 truncate text-sm font-semibold text-white">{album.title}</p>
                  <button
                    type="button"
                    onClick={() => onOpenArtist(album.artistName)}
                    className="block w-full truncate text-left text-xs text-white/55 hover:text-white hover:underline mt-0.5"
                  >
                    {album.artistName} · {album.type} · {album.year}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. MADE FOR YOU */}
      {activeCatalog.length > 0 && (
        <section aria-label="Made for you">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Made for {firstName}
            </h2>
            <span className="text-xs text-white/50 tabular-nums">
              {activeCatalog.length} tracks
            </span>
          </div>

          <div className="no-scrollbar flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {activeCatalog.map((track, idx) => (
              <div
                key={`mfy-${track.id}-${idx}`}
                className="liquid-glass group flex w-44 sm:w-48 shrink-0 snap-start flex-col rounded-2xl p-2.5 transition-all duration-200 hover:bg-white/[0.09]"
              >
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, activeCatalog)}
                  className="relative aspect-square w-full overflow-hidden rounded-xl text-left focus-visible:outline-none"
                >
                  <CoverArt
                    src={track.coverUrl}
                    alt={track.album}
                    fallbackGradient={track.fallbackGradient}
                    className="h-full w-full"
                    imgClassName="transition-transform duration-500 group-hover:scale-105"
                  />
                </button>

                <div className="mt-2.5 flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleTrackPress(track, activeCatalog)}
                      className="block w-full truncate text-left text-sm font-semibold text-white"
                    >
                      {track.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenArtist(track.artist)}
                      className="block w-full truncate text-left text-xs text-white/55 hover:text-white hover:underline mt-0.5"
                    >
                      {track.artist}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAddToPlaylist(track)}
                    aria-label={`Add ${track.title} to playlist`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/12 hover:text-white transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. HEAVY ROTATION */}
      {heavyRotation.length > 0 && (
        <section aria-label="Heavy rotation">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Flame className="h-4.5 w-4.5 text-white/75" />
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                Heavy Rotation
              </h2>
            </div>
            <span className="text-xs text-white/50">Curated daily</span>
          </div>

          <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {heavyRotation.map((track, idx) => (
              <div
                key={`heavy-${track.id}-${idx}`}
                className="liquid-glass group w-40 sm:w-44 shrink-0 rounded-2xl p-2.5 transition-all duration-200 hover:bg-white/[0.09]"
              >
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, heavyRotation)}
                  className="relative aspect-square w-full overflow-hidden rounded-xl block"
                >
                  <CoverArt
                    src={track.coverUrl}
                    alt={track.title}
                    fallbackGradient={track.fallbackGradient}
                    className="h-full w-full"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, heavyRotation)}
                  className="mt-2.5 block w-full truncate text-left text-sm font-semibold text-white"
                >
                  {track.title}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenArtist(track.artist)}
                  className="block w-full truncate text-left text-xs text-white/55 hover:text-white hover:underline mt-0.5"
                >
                  {track.artist}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. RECENTLY PLAYED */}
      {recentlyPlayedTracks.length > 0 && (
        <section aria-label="Recently played">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Recently Played
            </h2>
            <span className="text-xs text-white/50">Jump back in</span>
          </div>

          <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {recentlyPlayedTracks.map((track, idx) => (
              <div
                key={`recent-${track.id}-${idx}`}
                className="liquid-glass group w-40 sm:w-44 shrink-0 rounded-2xl p-2.5 transition-all hover:bg-white/[0.09]"
              >
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, recentlyPlayedTracks)}
                  className="relative aspect-square w-full overflow-hidden rounded-xl block"
                >
                  <CoverArt
                    src={track.coverUrl}
                    alt={track.title}
                    fallbackGradient={track.fallbackGradient}
                    className="h-full w-full"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, recentlyPlayedTracks)}
                  className="mt-2.5 block w-full truncate text-left text-sm font-semibold text-white"
                >
                  {track.title}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenArtist(track.artist)}
                  className="block w-full truncate text-left text-xs text-white/55 hover:text-white hover:underline mt-0.5"
                >
                  {track.artist}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. TRENDING / TOP CHARTS */}
      {trendingCharts.length > 0 && (
        <section aria-label="Trending and Top Charts">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4.5 w-4.5 text-white/75" />
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                Trending · Top Charts
              </h2>
            </div>
            <span className="text-xs text-white/50">Live catalog</span>
          </div>

          <div className="liquid-glass divide-y divide-white/[0.07] rounded-3xl px-3">
            {trendingCharts.slice(0, 5).map((track, idx) => {
              const isCurrent = track.id === activeTrackId;
              return (
                <div
                  key={`chart-${track.id}-${idx}`}
                  className="flex items-center gap-3.5 py-3 px-2 rounded-2xl hover:bg-white/[0.04] transition-colors"
                >
                  <span className="w-5 text-center text-xs font-bold text-white/45 tabular-nums">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTrackPress(track, trendingCharts)}
                    className="shrink-0 rounded-xl"
                  >
                    <CoverArt
                      src={track.coverUrl}
                      alt={track.title}
                      fallbackGradient={track.fallbackGradient}
                      className="h-12 w-12 rounded-xl"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleTrackPress(track, trendingCharts)}
                      className={`block w-full truncate text-left text-sm font-semibold ${
                        isCurrent ? 'text-white' : 'text-white/95'
                      }`}
                    >
                      {track.title}
                    </button>
                    <div className="flex items-center gap-1.5 text-xs text-white/55 truncate">
                      <button
                        type="button"
                        onClick={() => onOpenArtist(track.artist)}
                        className="truncate hover:text-white hover:underline"
                      >
                        {track.artist}
                      </button>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{track.genre}</span>
                    </div>
                  </div>
                  <span className="hidden sm:inline text-xs text-white/45 tabular-nums">
                    {formatTime(track.duration)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenAddToPlaylist(track)}
                    aria-label={`Add ${track.title} to playlist`}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/12 hover:text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 8. NEW RELEASES & PLAYLISTS */}
      {newReleases.length > 0 && (
        <section aria-label="New Releases">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-white/75" />
              <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                New Releases
              </h2>
            </div>
            <span className="text-xs text-white/50">Latest drops</span>
          </div>

          <div className="no-scrollbar flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {newReleases.map((track, idx) => (
              <div
                key={`new-${track.id}-${idx}`}
                className="liquid-glass group flex w-44 sm:w-48 shrink-0 snap-start flex-col rounded-2xl p-2.5 transition-all hover:bg-white/[0.09]"
              >
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, newReleases)}
                  className="relative aspect-square w-full overflow-hidden rounded-xl block"
                >
                  <CoverArt
                    src={track.coverUrl}
                    alt={track.title}
                    fallbackGradient={track.fallbackGradient}
                    className="h-full w-full"
                    imgClassName="transition-transform duration-500 group-hover:scale-105"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => handleTrackPress(track, newReleases)}
                  className="mt-2.5 block w-full truncate text-left text-sm font-semibold text-white"
                >
                  {track.title}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenArtist(track.artist)}
                  className="block w-full truncate text-left text-xs text-white/55 hover:text-white hover:underline mt-0.5"
                >
                  {track.artist} · {track.year}
                </button>
              </div>
            ))}
          </div>

          {/* User Playlists Strip */}
          {playlists.length > 0 && topFilter === 'All' && (
            <div className="mt-6">
              <h3 className="font-display mb-3 text-base font-bold text-white/85">
                Playlists in Your Rotation
              </h3>
              <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {playlists.map((pl, idx) => {
                  const plTracks = tracks.filter((t) => pl.trackIds.includes(t.id));
                  const first = plTracks[0];
                  return (
                    <button
                      key={`home-pl-${pl.id}-${idx}`}
                      type="button"
                      disabled={!first}
                      onClick={() => first && handleTrackPress(first, plTracks)}
                      className="liquid-glass flex items-center gap-3 rounded-2xl p-2 pr-4 shrink-0 hover:bg-white/[0.09] transition-colors disabled:opacity-50"
                    >
                      <CoverArt src={pl.coverUrl} alt={pl.title} className="h-11 w-11 rounded-xl" />
                      <div className="text-left">
                        <p className="text-xs font-semibold text-white whitespace-nowrap">
                          {pl.title}
                        </p>
                        <p className="text-[11px] text-white/50 tabular-nums">
                          {plTracks.length} {plTracks.length === 1 ? 'song' : 'songs'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
