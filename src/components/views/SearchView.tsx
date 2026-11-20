import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Disc3,
  Globe,
  Headphones,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SEARCH_GENRES } from '../../data/catalog';
import { fetchRealArtistPhoto, getCachedArtistPhoto } from '../../services/artistProfiles';
import { mergeAndDeduplicateTracks } from '../../services/musicApi';
import { extractYouTubeVideoId, fetchYouTubeTrackMeta } from '../../services/playerEngine';
import { searchShowsCatalog } from '../../services/podcastsApi';
import { runSmartCatalogSearch } from '../../services/smartSearch';
import { PodcastShow, Track } from '../../types/music';
import { ItunesSearchResult } from '../../utils/itunesApi';
import { CollectionDetailTarget } from '../CollectionDetailModal';
import { CoverArt } from '../CoverArt';

interface SearchViewProps {
  tracks: Track[];
  activeTrackId: string;
  isPlaying: boolean;
  isOnline: boolean;
  offlineMode: boolean;
  downloadedTrackIds: Set<string>;
  recentSearches: string[];
  onAddRecentSearch: (term: string) => void;
  onRemoveRecentSearch: (term: string) => void;
  onClearRecentSearches: () => void;
  onPlayTrack: (track: Track, queueList?: Track[], startAtTime?: number) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onOpenArtist: (artistName: string) => void;
  onOpenShow: (show: PodcastShow) => void;
  onOpenCollection?: (collection: CollectionDetailTarget) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onToggleDownload: (track: Track) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  tracks,
  activeTrackId,
  isPlaying,
  isOnline,
  offlineMode,
  downloadedTrackIds,
  recentSearches,
  onAddRecentSearch,
  onRemoveRecentSearch,
  onClearRecentSearches,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onOpenArtist,
  onOpenShow,
  onOpenCollection,
  onOpenAddToPlaylist,
  onToggleDownload,
  onRegisterTracks,
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [itunesResult, setItunesResult] = useState<ItunesSearchResult>({
    tracks: [],
    albums: [],
    artists: [],
  });
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<PodcastShow[]>([]);
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({});
  const [directYtTrack, setDirectYtTrack] = useState<Track | null>(null);
  const [isLoadingYtMeta, setIsLoadingYtMeta] = useState(false);
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const trimmed = query.trim().toLowerCase();
  const detectedYtId = useMemo(() => extractYouTubeVideoId(query), [query]);
  const offlineOnly = !isOnline || offlineMode;

  useEffect(() => {
    if (!detectedYtId || offlineOnly) {
      setDirectYtTrack(null);
      setIsLoadingYtMeta(false);
      return;
    }

    let cancelled = false;
    setIsLoadingYtMeta(true);
    fetchYouTubeTrackMeta(detectedYtId)
      .then((meta) => {
        if (cancelled) return;
        setDirectYtTrack(meta);
        if (meta) onRegisterTracks?.([meta]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingYtMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detectedYtId, offlineOnly, onRegisterTracks]);

  // Typo-tolerant online catalog + Podcasts/Audiobooks search
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2 || detectedYtId || offlineOnly) {
      setItunesResult({ tracks: [], albums: [], artists: [] });
      setNextPageToken(null);
      setIsLoadingMore(false);
      setShowResults([]);
      setCorrectedQuery(null);
      setIsSearchingApi(false);
      setApiError(null);
      return;
    }

    const controller = new AbortController();
    setIsSearchingApi(true);
    setApiError(null);
    setNextPageToken(null);

    const timer = window.setTimeout(async () => {
      try {
        const [smartRes, showsRes] = await Promise.all([
          runSmartCatalogSearch(clean, tracks, 18, controller.signal),
          searchShowsCatalog(clean, controller.signal).catch(() => []),
        ]);
        if (!controller.signal.aborted) {
          setItunesResult({
            tracks: smartRes.tracks,
            albums: smartRes.albums,
            artists: smartRes.artists,
          });
          setNextPageToken(smartRes.nextPageToken);
          setCorrectedQuery(smartRes.correctedQuery);
          setShowResults(showsRes);
          setIsSearchingApi(false);
          if (smartRes.tracks.length > 0) {
            onRegisterTracks?.(smartRes.tracks);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setIsSearchingApi(false);
          setApiError(
            err instanceof Error ? err.message : 'Unable to reach catalog discovery right now.',
          );
        }
      }
    }, 340);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, detectedYtId, offlineOnly, retryToken, tracks, onRegisterTracks]);

  const handleLoadMore = async () => {
    const clean = (correctedQuery || query).trim();
    if (!clean || !nextPageToken || isLoadingMore || offlineOnly) return;
    setIsLoadingMore(true);
    try {
      const nextRes = await runSmartCatalogSearch(clean, tracks, 25, undefined, nextPageToken);
      if (nextRes.tracks.length > 0) {
        onRegisterTracks?.(nextRes.tracks);
        setItunesResult((prev) => ({
          ...prev,
          tracks: mergeAndDeduplicateTracks([prev.tracks, nextRes.tracks]),
        }));
      }
      setNextPageToken(nextRes.nextPageToken);
    } catch {
      setNextPageToken(null);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Preload real Deezer portraits for matched artists
  useEffect(() => {
    if (itunesResult.artists.length === 0) return;
    let cancelled = false;
    itunesResult.artists.slice(0, 8).forEach((art) => {
      const cached = getCachedArtistPhoto(art.name);
      if (cached) {
        setArtistPhotos((prev) => (prev[art.name] ? prev : { ...prev, [art.name]: cached }));
        return;
      }
      if (offlineOnly) return;
      fetchRealArtistPhoto(art.name, art.coverUrl).then((url) => {
        if (!cancelled && url) {
          setArtistPhotos((prev) => ({ ...prev, [art.name]: url }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [itunesResult.artists, offlineOnly]);

  // Local/downloaded matches (always works offline too)
  const localMatches = useMemo(() => {
    if (!trimmed || detectedYtId) return [];
    const apiIds = new Set(itunesResult.tracks.map((t) => t.id));
    const pool = offlineOnly
      ? tracks.filter((t) => downloadedTrackIds.has(t.id) || t.downloaded)
      : tracks;
    return pool
      .filter((t) => !apiIds.has(t.id))
      .filter(
        (t) =>
          t.title.toLowerCase().includes(trimmed) ||
          t.artist.toLowerCase().includes(trimmed) ||
          t.album.toLowerCase().includes(trimmed) ||
          t.genre.toLowerCase().includes(trimmed),
      )
      .slice(0, offlineOnly ? 20 : 6);
  }, [tracks, trimmed, detectedYtId, itunesResult.tracks, offlineOnly, downloadedTrackIds]);

  const combinedPlayQueue = useMemo(() => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    if (directYtTrack) {
      seen.add(directYtTrack.id);
      merged.push(directYtTrack);
    }
    for (const t of itunesResult.tracks) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
    for (const t of localMatches) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
    return merged;
  }, [directYtTrack, itunesResult.tracks, localMatches]);

  const handleTrackPress = (track: Track) => {
    if (query.trim().length >= 2) {
      onAddRecentSearch(query.trim());
    }
    if (track.id === activeTrackId) {
      if (!isPlaying) onTogglePlay();
      onOpenPlayer();
    } else {
      onPlayTrack(track, combinedPlayQueue);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      onAddRecentSearch(query.trim());
    }
    inputRef.current?.blur();
  };

  const handleCancelSearch = () => {
    setQuery('');
    setIsFocused(false);
    inputRef.current?.blur();
  };

  const displayedTracks = offlineOnly
    ? localMatches
    : [...itunesResult.tracks, ...localMatches];

  return (
    <div className="space-y-7">
      {!isFocused && !trimmed && (
        <div>
          <p className="text-xs font-medium text-white/55">
            {offlineOnly ? 'Offline Library Search' : 'Global Music Catalog & Direct Links'}
          </p>
          <h1 className="font-display mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Search
          </h1>
        </div>
      )}

      {/* Morphing YouTube-Style Liquid Glass Search Bar with Cancel / Back */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
        {(isFocused || trimmed.length > 0) && (
          <button
            type="button"
            onClick={handleCancelSearch}
            aria-label="Back to browse"
            className="liquid-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/14 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
        )}

        <div className="liquid-glass-elevated flex flex-1 items-center gap-3 rounded-full px-4 py-2.5 transition-all duration-200 focus-within:border-white/30">
          <Search className="h-4.5 w-4.5 shrink-0 text-white/60" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              offlineOnly
                ? 'Search downloaded songs & artists...'
                : 'Search songs, artists, podcasts, audiobooks, or YouTube URL...'
            }
            aria-label="Search tracks, artists, shows, or YouTube URL"
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder:text-white/40 focus:outline-none"
          />
          {(isSearchingApi || isLoadingYtMeta) && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/70" />
          )}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/80 hover:bg-white/25 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>

      {/* Dual View: (1) Focused Blank Sheet with Recent Searches vs (2) Inactive Explore Genres */}
      {!trimmed ? (
        isFocused ? (
          <section aria-label="Recent searches" className="min-h-[45vh] space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-white/75 uppercase tracking-wider">
                Recent Searches
              </h2>
              {recentSearches.length > 0 && (
                <button
                  type="button"
                  onClick={onClearRecentSearches}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white/55 hover:text-white"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {recentSearches.length === 0 ? (
              <p className="py-12 text-center text-xs text-white/45">
                Start typing a song, artist, podcast, or YouTube link.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {recentSearches.map((term) => (
                  <div
                    key={term}
                    className="flex items-center justify-between gap-3 py-2.5 px-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        onAddRecentSearch(term);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm text-white/85 hover:text-white"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-white/40" />
                      <span className="truncate">{term}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveRecentSearch(term)}
                      aria-label={`Remove ${term}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section aria-label="Browse genres">
            <h2 className="font-display mb-4 text-lg sm:text-xl font-bold text-white">
              Explore Genres
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {SEARCH_GENRES.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => {
                    setIsFocused(true);
                    setQuery(genre.name);
                  }}
                  className="spring-card liquid-glass group relative flex h-28 sm:h-32 flex-col justify-between overflow-hidden rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  style={{
                    background: `radial-gradient(circle at 85% 85%, ${genre.color}70 0%, rgba(20, 20, 24, 0.85) 75%)`,
                  }}
                >
                  <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/55">
                    Genre
                  </span>
                  <span className="font-display text-base sm:text-lg font-bold text-white">
                    {genre.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      ) : (
        <div className="space-y-8">
          {/* Smart Typo-Correction Pill */}
          {correctedQuery && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs text-white/80">
              <Sparkles className="h-3.5 w-3.5 text-white" />
              <span>
                Showing results for <strong className="text-white">{correctedQuery}</strong>
              </span>
            </div>
          )}

          {/* Direct YouTube URL / Video ID Card */}
          {detectedYtId && directYtTrack && (
            <section aria-label="Direct YouTube track" className="space-y-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-white/65" />
                <h2 className="font-display text-lg font-bold text-white">Direct YouTube Track</h2>
              </div>

              <div className="liquid-glass-elevated flex items-center gap-3.5 rounded-2xl p-3.5">
                <button
                  type="button"
                  onClick={() => handleTrackPress(directYtTrack)}
                  className="shrink-0 rounded-xl"
                >
                  <CoverArt
                    src={directYtTrack.coverUrl}
                    alt={directYtTrack.title}
                    fallbackGradient={directYtTrack.fallbackGradient}
                    className="h-14 w-14 rounded-xl"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => handleTrackPress(directYtTrack)}
                    className="block w-full truncate text-left text-sm sm:text-base font-semibold text-white"
                  >
                    {directYtTrack.title}
                  </button>
                  <p className="truncate text-xs text-white/55">{directYtTrack.artist}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleDownload(directYtTrack)}
                    aria-label="Toggle offline download"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                      downloadedTrackIds.has(directYtTrack.id)
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-white/60 hover:bg-white/12 hover:text-white'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAddToPlaylist(directYtTrack)}
                    aria-label="Add to playlist"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/12 hover:text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (directYtTrack.id === activeTrackId) onTogglePlay();
                      else handleTrackPress(directYtTrack);
                    }}
                    aria-label={`Play ${directYtTrack.title}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black"
                  >
                    {directYtTrack.id === activeTrackId && isPlaying ? (
                      <Pause className="h-4 w-4 fill-current" />
                    ) : (
                      <Play className="h-4 w-4 fill-current translate-x-0.5" />
                    )}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Pure Borderless Circular Artists Strip */}
          {itunesResult.artists.length > 0 && (
            <section aria-label="Matching artists">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base sm:text-lg font-bold text-white">Artists</h2>
                <span className="text-xs text-white/50 tabular-nums">
                  {itunesResult.artists.length} found
                </span>
              </div>
              <div className="no-scrollbar flex gap-5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {itunesResult.artists.slice(0, 8).map((artist, idx) => {
                  const photo =
                    artistPhotos[artist.name] ||
                    getCachedArtistPhoto(artist.name) ||
                    artist.coverUrl;
                  return (
                    <button
                      key={`search-art-${artist.artistId ?? artist.name}-${idx}`}
                      type="button"
                      onClick={() => onOpenArtist(artist.name)}
                      className="spring-card group flex w-24 shrink-0 flex-col items-center text-center"
                    >
                      <div className="h-20 w-20 overflow-hidden rounded-full bg-zinc-900">
                        <img
                          src={photo}
                          alt={artist.name}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <p className="mt-2 w-full truncate text-xs font-semibold text-white">
                        {artist.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Netflix-Style Aspect-Video Landscape Music Results */}
          {!detectedYtId && (
            <section aria-label="Music search results" className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-white/65" />
                  <h2 className="font-display text-lg font-bold text-white">
                    {offlineOnly ? 'Offline Downloads Match' : 'Songs'}
                  </h2>
                </div>
                <span className="text-xs text-white/50 tabular-nums">
                  {isSearchingApi
                    ? 'Searching…'
                    : `${displayedTracks.length} ${displayedTracks.length === 1 ? 'track' : 'tracks'}`}
                </span>
              </div>

              {apiError ? (
                <div className="liquid-glass rounded-3xl p-6 text-center space-y-3">
                  <p className="text-sm font-semibold text-white">Catalog lookup unavailable</p>
                  <p className="text-xs text-white/55">{apiError}</p>
                  <button
                    type="button"
                    onClick={() => setRetryToken((n) => n + 1)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/14 border border-white/18 px-4 py-2 text-xs font-semibold text-white hover:bg-white/22"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Search</span>
                  </button>
                </div>
              ) : isSearchingApi && displayedTracks.length === 0 ? (
                <div className="liquid-glass rounded-3xl p-8 flex flex-col items-center justify-center gap-2 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white/80" />
                  <p className="text-xs text-white/60">
                    Searching catalog for &ldquo;{query}&rdquo;…
                  </p>
                </div>
              ) : displayedTracks.length === 0 ? (
                <div className="liquid-glass rounded-3xl p-8 text-center">
                  <p className="text-base font-semibold text-white">
                    No matches for &ldquo;{query}&rdquo;
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    {offlineOnly
                      ? 'Only downloaded songs can be searched while offline.'
                      : 'Try another artist, song title, or paste any YouTube URL.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedTracks.map((track, idx) => {
                    const isCurrent = track.id === activeTrackId;
                    return (
                      <div key={`search-tr-${track.id}-${idx}`} className="spring-card group flex flex-col">
                        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-950">
                          <button
                            type="button"
                            onClick={() => handleTrackPress(track)}
                            className={`relative block h-full w-full text-left ${
                              isCurrent ? 'ring-1 ring-white/55 rounded-2xl' : ''
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
                            <div className="absolute inset-x-0 bottom-0 z-10 p-3.5 pr-12">
                              <p className="truncate text-sm font-bold text-white leading-tight">
                                {track.title}
                              </p>
                              <p className="mt-0.5 truncate text-xs text-white/75">{track.artist}</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenAddToPlaylist(track)}
                            aria-label={`Add ${track.title} to playlist`}
                            className="absolute bottom-3 right-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 backdrop-blur-md text-white/90 hover:bg-white hover:text-black transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!offlineOnly && nextPageToken && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    disabled={isLoadingMore}
                    onClick={() => void handleLoadMore()}
                    className="liquid-glass inline-flex min-h-[40px] items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold text-white hover:bg-white/14 transition-colors disabled:opacity-50"
                  >
                    {isLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isLoadingMore ? 'Loading more…' : 'Load More Results'}</span>
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Podcasts & Audiobooks Matching Row */}
          {showResults.length > 0 && (
            <section aria-label="Podcasts and audiobooks">
              <div className="mb-3 flex items-center gap-2">
                <Headphones className="h-4 w-4 text-white/65" />
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  Podcasts &amp; Audiobooks
                </h2>
              </div>
              <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                {showResults.map((show, idx) => (
                  <button
                    key={`search-show-${show.id}-${idx}`}
                    type="button"
                    onClick={() => onOpenShow(show)}
                    className="spring-card group relative aspect-video w-60 shrink-0 snap-start overflow-hidden rounded-2xl bg-zinc-950 text-left"
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
                    <div className="absolute inset-x-0 bottom-0 z-10 p-3">
                      <p className="truncate text-xs font-bold text-white">{show.title}</p>
                      <p className="truncate text-[11px] text-white/75">
                        {show.author} · {show.kind === 'audiobook' ? 'Audiobook' : 'Podcast'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Discovered Albums Shelf (Netflix Landscape Cards) */}
          {itunesResult.albums.length > 0 && (
            <section aria-label="Matching albums">
              <div className="mb-3 flex items-center gap-2">
                <Disc3 className="h-4 w-4 text-white/65" />
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  Albums &amp; Singles
                </h2>
              </div>
              <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                {itunesResult.albums.slice(0, 8).map((album, idx) => {
                  const albTracks = itunesResult.tracks.filter((t) =>
                    album.trackIds.includes(t.id),
                  );
                  const lead = albTracks[0] ?? itunesResult.tracks[0];
                  return (
                    <button
                      key={`search-alb-${album.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (onOpenCollection) {
                          onOpenCollection({
                            id: album.id,
                            kind: 'album',
                            title: album.title,
                            subtitle: album.artistName,
                            coverUrl: album.coverUrl,
                            year: album.year,
                            genre: album.genre,
                            collectionId: album.collectionId,
                            tracks: albTracks,
                          });
                        } else if (lead) {
                          onPlayTrack(lead, albTracks.length ? albTracks : combinedPlayQueue);
                        }
                      }}
                      className="spring-card group relative aspect-video w-60 shrink-0 overflow-hidden rounded-2xl bg-zinc-950 text-left"
                    >
                      <CoverArt
                        src={album.coverUrl}
                        alt={album.title}
                        className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"
                      />
                      <div className="absolute inset-x-0 bottom-0 z-10 p-3">
                        <p className="truncate text-xs font-bold text-white">{album.title}</p>
                        <p className="truncate text-[11px] text-white/75">{album.artistName}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
