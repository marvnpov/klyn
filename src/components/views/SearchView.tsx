import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  Disc3,
  Globe,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  User,
  X,
} from 'lucide-react';
import { SEARCH_GENRES, formatTime } from '../../data/catalog';
import { extractYouTubeVideoId, fetchYouTubeTrackMeta } from '../../services/playerEngine';
import { Track } from '../../types/music';
import { ItunesSearchResult, searchItunesCatalog } from '../../utils/itunesApi';
import { CoverArt } from '../CoverArt';

interface SearchViewProps {
  tracks: Track[];
  activeTrackId: string;
  isPlaying: boolean;
  downloadedTrackIds: Set<string>;
  onPlayTrack: (track: Track, queueList?: Track[], startAtTime?: number) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onOpenArtist: (artistName: string) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onToggleDownload: (track: Track) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  tracks,
  activeTrackId,
  isPlaying,
  downloadedTrackIds,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onOpenArtist,
  onOpenAddToPlaylist,
  onToggleDownload,
  onRegisterTracks,
}) => {
  const [query, setQuery] = useState('');
  const [itunesResult, setItunesResult] = useState<ItunesSearchResult>({
    tracks: [],
    albums: [],
    artists: [],
  });
  const [directYtTrack, setDirectYtTrack] = useState<Track | null>(null);
  const [isLoadingYtMeta, setIsLoadingYtMeta] = useState(false);
  const [isSearchingApi, setIsSearchingApi] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const trimmed = query.trim().toLowerCase();
  const detectedYtId = useMemo(() => extractYouTubeVideoId(query), [query]);

  // Direct YouTube URL / Video ID metadata lookup
  useEffect(() => {
    if (!detectedYtId) {
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
  }, [detectedYtId, onRegisterTracks]);

  // Debounced live iTunes Search API discovery
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2 || detectedYtId) {
      setItunesResult({ tracks: [], albums: [], artists: [] });
      setIsSearchingApi(false);
      setApiError(null);
      return;
    }

    const controller = new AbortController();
    setIsSearchingApi(true);
    setApiError(null);

    const timer = window.setTimeout(async () => {
      try {
        const res = await searchItunesCatalog(clean, 18, controller.signal);
        if (!controller.signal.aborted) {
          setItunesResult(res);
          setIsSearchingApi(false);
          if (res.tracks.length > 0) {
            onRegisterTracks?.(res.tracks);
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
  }, [query, detectedYtId, retryToken, onRegisterTracks]);

  // Matching discovered tracks from session library (if user searched something already loaded)
  const sessionMatches = useMemo(() => {
    if (!trimmed || detectedYtId) return [];
    const apiIds = new Set(itunesResult.tracks.map((t) => t.id));
    return tracks
      .filter((t) => !apiIds.has(t.id))
      .filter(
        (t) =>
          t.title.toLowerCase().includes(trimmed) ||
          t.artist.toLowerCase().includes(trimmed) ||
          t.album.toLowerCase().includes(trimmed),
      )
      .slice(0, 6);
  }, [tracks, trimmed, detectedYtId, itunesResult.tracks]);

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
    for (const t of sessionMatches) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }
    return merged;
  }, [directYtTrack, itunesResult.tracks, sessionMatches]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-white/55">
          Global Music Catalog &amp; Direct YouTube Links
        </p>
        <h1 className="font-display mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Search
        </h1>
      </div>

      {/* Morphing Liquid Glass Search Pill */}
      <div className="liquid-glass-elevated flex items-center gap-3 rounded-full px-4 py-2.5 transition-all duration-200 focus-within:border-white/30">
        <Search className="h-4.5 w-4.5 shrink-0 text-white/60" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any song, artist, album, or paste a YouTube URL / ID..."
          aria-label="Search tracks, artists, or paste a YouTube URL"
          className="w-full bg-transparent text-sm sm:text-base text-white placeholder:text-white/40 focus:outline-none"
        />
        {(isSearchingApi || isLoadingYtMeta) && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/70" />
        )}
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/80 hover:bg-white/25 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Empty Query: Clean Liquid Glass Genre Grid */}
      {!trimmed ? (
        <section aria-label="Browse genres">
          <h2 className="font-display mb-4 text-lg sm:text-xl font-bold text-white">
            Explore Genres
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {SEARCH_GENRES.map((genre) => (
              <button
                key={genre.id}
                type="button"
                onClick={() => setQuery(genre.name)}
                className="liquid-glass group relative flex h-28 sm:h-32 flex-col justify-between overflow-hidden rounded-2xl p-4 text-left transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
      ) : (
        <div className="space-y-8">
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
                  onClick={() => onPlayTrack(directYtTrack, combinedPlayQueue)}
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
                    onClick={() => onPlayTrack(directYtTrack, combinedPlayQueue)}
                    className="block w-full truncate text-left text-sm sm:text-base font-semibold text-white"
                  >
                    {directYtTrack.title}
                  </button>
                  <p className="truncate text-xs text-white/55">
                    {directYtTrack.artist} · YouTube ID: {detectedYtId}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleDownload(directYtTrack)}
                    aria-label={
                      downloadedTrackIds.has(directYtTrack.id)
                        ? `Remove ${directYtTrack.title} from downloads`
                        : `Download ${directYtTrack.title}`
                    }
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                      downloadedTrackIds.has(directYtTrack.id)
                        ? 'bg-white text-black'
                        : 'text-white/60 hover:bg-white/12 hover:text-white'
                    }`}
                  >
                    {downloadedTrackIds.has(directYtTrack.id) ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <ArrowDownToLine className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenAddToPlaylist(directYtTrack)}
                    aria-label={`Add ${directYtTrack.title} to playlist`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/12 hover:text-white transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (directYtTrack.id === activeTrackId) onTogglePlay();
                      else onPlayTrack(directYtTrack, combinedPlayQueue);
                    }}
                    aria-label={`Play ${directYtTrack.title}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
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

          {/* Discovered Artists Strip */}
          {itunesResult.artists.length > 0 && (
            <section aria-label="Matching artists">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base sm:text-lg font-bold text-white">Artists</h2>
                <span className="text-xs text-white/50 tabular-nums">
                  {itunesResult.artists.length} found
                </span>
              </div>
              <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                {itunesResult.artists.slice(0, 8).map((artist, idx) => (
                  <button
                    key={`search-art-${artist.artistId ?? artist.name}-${idx}`}
                    type="button"
                    onClick={() => onOpenArtist(artist.name)}
                    className="liquid-glass group flex w-32 shrink-0 flex-col items-center rounded-3xl p-3 text-center hover:bg-white/[0.09] transition-colors"
                  >
                    <CoverArt
                      src={artist.coverUrl}
                      alt={artist.name}
                      className="h-16 w-16 rounded-full border border-white/18"
                    />
                    <p className="mt-2 w-full truncate text-xs font-semibold text-white">
                      {artist.name}
                    </p>
                    <p className="w-full truncate text-[10px] text-white/50 mt-0.5">
                      {artist.genre}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Global iTunes Music Catalog Results */}
          {!detectedYtId && (
            <section aria-label="Global music search results" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-white/65" />
                  <h2 className="font-display text-lg font-bold text-white">Music Catalog</h2>
                </div>
                <span className="text-xs text-white/50 tabular-nums">
                  {isSearchingApi
                    ? 'Searching…'
                    : `${itunesResult.tracks.length} ${itunesResult.tracks.length === 1 ? 'track' : 'tracks'}`}
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
              ) : isSearchingApi && itunesResult.tracks.length === 0 ? (
                <div className="liquid-glass rounded-3xl p-8 flex flex-col items-center justify-center gap-2 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-white/80" />
                  <p className="text-xs text-white/60">
                    Searching catalog for &ldquo;{query}&rdquo;…
                  </p>
                </div>
              ) : itunesResult.tracks.length === 0 && sessionMatches.length === 0 ? (
                <div className="liquid-glass rounded-3xl p-8 text-center">
                  <p className="text-base font-semibold text-white">
                    No matches for &ldquo;{query}&rdquo;
                  </p>
                  <p className="mt-1 text-sm text-white/55">
                    Try another artist name, track title, or paste any YouTube URL / 11-char ID.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {[...itunesResult.tracks, ...sessionMatches].map((track, idx) => {
                    const isCurrent = track.id === activeTrackId;
                    const openRow = () => {
                      if (isCurrent) {
                        if (!isPlaying) onTogglePlay();
                        onOpenPlayer();
                      } else {
                        onPlayTrack(track, combinedPlayQueue);
                      }
                    };
                    const togglePlayRow = () => {
                      if (isCurrent) onTogglePlay();
                      else onPlayTrack(track, combinedPlayQueue);
                    };

                    return (
                      <div
                        key={`search-tr-${track.id}-${idx}`}
                        className="liquid-glass group flex w-full items-center gap-3.5 rounded-2xl p-3 transition-colors hover:bg-white/[0.09]"
                      >
                        <button type="button" onClick={openRow} className="shrink-0 rounded-xl">
                          <CoverArt
                            src={track.coverUrl}
                            alt={track.title}
                            fallbackGradient={track.fallbackGradient}
                            className="h-14 w-14 rounded-xl"
                          />
                        </button>

                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={openRow}
                            className="block w-full truncate text-left text-sm sm:text-base font-semibold text-white"
                          >
                            {track.title}
                          </button>
                          <div className="flex items-center gap-1.5 truncate text-xs text-white/55">
                            <button
                              type="button"
                              onClick={() => onOpenArtist(track.artist)}
                              className="inline-flex items-center gap-1 truncate hover:text-white hover:underline transition-colors"
                            >
                              <User className="h-3 w-3 shrink-0 text-white/40" />
                              <span>{track.artist}</span>
                            </button>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{track.album}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-white/45 tabular-nums">
                            {track.genre} · {formatTime(track.duration)}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onToggleDownload(track)}
                            aria-label={
                              downloadedTrackIds.has(track.id)
                                ? `Remove ${track.title} from downloads`
                                : `Download ${track.title}`
                            }
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                              downloadedTrackIds.has(track.id)
                                ? 'bg-white text-black'
                                : 'text-white/60 hover:bg-white/12 hover:text-white'
                            }`}
                          >
                            {downloadedTrackIds.has(track.id) ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <ArrowDownToLine className="h-4 w-4" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenAddToPlaylist(track)}
                            aria-label={`Add ${track.title} to playlist`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/12 hover:text-white transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={togglePlayRow}
                            aria-label={
                              isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-white group-hover:bg-white group-hover:text-black transition-colors"
                          >
                            {isCurrent && isPlaying ? (
                              <Pause className="h-4 w-4 fill-current" />
                            ) : (
                              <Play className="h-4 w-4 fill-current translate-x-0.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Discovered Albums Shelf */}
          {itunesResult.albums.length > 0 && (
            <section aria-label="Matching albums">
              <div className="mb-3 flex items-center gap-2">
                <Disc3 className="h-4 w-4 text-white/65" />
                <h2 className="font-display text-base sm:text-lg font-bold text-white">
                  Albums &amp; Singles
                </h2>
              </div>
              <div className="no-scrollbar flex gap-3.5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                {itunesResult.albums.slice(0, 8).map((album, idx) => {
                  const albTracks = itunesResult.tracks.filter((t) =>
                    album.trackIds.includes(t.id),
                  );
                  const lead = albTracks[0] ?? itunesResult.tracks[0];
                  return (
                    <div
                      key={`search-alb-${album.id}-${idx}`}
                      className="liquid-glass group w-40 shrink-0 rounded-2xl p-2.5 hover:bg-white/[0.09] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          lead && onPlayTrack(lead, albTracks.length ? albTracks : combinedPlayQueue)
                        }
                        className="aspect-square w-full overflow-hidden rounded-xl block"
                      >
                        <CoverArt
                          src={album.coverUrl}
                          alt={album.title}
                          className="h-full w-full"
                          imgClassName="transition-transform duration-500 group-hover:scale-105"
                        />
                      </button>
                      <p className="mt-2 truncate text-xs font-semibold text-white">
                        {album.title}
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenArtist(album.artistName)}
                        className="block w-full truncate text-left text-[11px] text-white/55 hover:text-white hover:underline"
                      >
                        {album.artistName} · {album.year}
                      </button>
                    </div>
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
