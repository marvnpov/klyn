import React, { useEffect, useState } from 'react';
import {
  Check,
  Disc3,
  Download,
  ExternalLink,
  ListMusic,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Shuffle,
  X,
} from 'lucide-react';
import { formatTime } from '../data/catalog';
import { getSpotifyPlaylistTracks } from '../services/spotifyApi';
import { Track } from '../types/music';
import { lookupAlbumTracks, searchItunesCatalog } from '../utils/itunesApi';
import { CoverArt } from './CoverArt';

export interface CollectionDetailTarget {
  id: string;
  kind: 'album' | 'playlist' | 'radio';
  title: string;
  subtitle: string;
  description?: string;
  coverUrl: string;
  year?: number;
  genre?: string;
  collectionId?: number;
  spotifyId?: string;
  spotifyUrl?: string;
  tracks: Track[];
}

interface CollectionDetailModalProps {
  collection: CollectionDetailTarget | null;
  activeTrackId: string;
  isPlaying: boolean;
  downloadedTrackIds: Set<string>;
  isOnline: boolean;
  offlineMode: boolean;
  onClose: () => void;
  onPlayTrack: (track: Track, queueList?: Track[]) => void;
  onTogglePlay: () => void;
  onToggleDownload: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onOpenArtist: (artistName: string) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

export const CollectionDetailModal: React.FC<CollectionDetailModalProps> = ({
  collection,
  activeTrackId,
  isPlaying,
  downloadedTrackIds,
  isOnline,
  offlineMode,
  onClose,
  onPlayTrack,
  onTogglePlay,
  onToggleDownload,
  onAddToQueue,
  onOpenAddToPlaylist,
  onOpenArtist,
  onRegisterTracks,
}) => {
  const [resolvedTracks, setResolvedTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!collection) {
      setResolvedTracks([]);
      setIsLoading(false);
      return;
    }

    setResolvedTracks(collection.tracks);

    const shouldFetchSpotifyPlaylist =
      collection.kind === 'playlist' && Boolean(collection.spotifyId) && collection.tracks.length === 0;
    const shouldFetchAlbum =
      collection.kind === 'album' && collection.tracks.length < 3;

    if ((!shouldFetchAlbum && !shouldFetchSpotifyPlaylist) || !isOnline || offlineMode) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    const resolveCollection = async () => {
      try {
        let fetched: Track[] = [];
        if (shouldFetchSpotifyPlaylist && collection.spotifyId) {
          fetched = await getSpotifyPlaylistTracks(collection.spotifyId, 25, controller.signal);
          if (fetched.length === 0) {
            const fallback = await searchItunesCatalog(collection.title, 14, controller.signal);
            fetched = fallback.tracks;
          }
        } else if (shouldFetchAlbum) {
          if (collection.collectionId) {
            fetched = await lookupAlbumTracks(collection.collectionId, controller.signal);
          }
          if (fetched.length === 0) {
            const searchRes = await searchItunesCatalog(
              `${collection.title} ${collection.subtitle}`,
              16,
              controller.signal,
            );
            const cleanTitle = collection.title.toLowerCase();
            const cleanArtist = collection.subtitle.toLowerCase();
            const exact = searchRes.tracks.filter(
              (t) =>
                t.album.toLowerCase().includes(cleanTitle) ||
                t.artist.toLowerCase() === cleanArtist,
            );
            fetched = exact.length > 0 ? exact : searchRes.tracks;
          }
        }
        if (!controller.signal.aborted && fetched.length > 0) {
          const merged = Array.from(
            new Map([...collection.tracks, ...fetched].map((t) => [t.id, t])).values(),
          );
          setResolvedTracks(merged);
          onRegisterTracks?.(merged);
        }
      } catch {
        // Ignore transient failures; user can retry cleanly
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void resolveCollection();
    return () => controller.abort();
  }, [collection, isOnline, offlineMode, retryCount, onRegisterTracks]);

  if (!collection) return null;

  const isCollectionPlaying = resolvedTracks.some((t) => t.id === activeTrackId) && isPlaying;
  const KindIcon =
    collection.kind === 'album' ? Disc3 : collection.kind === 'radio' ? Radio : ListMusic;
  const kindLabel =
    collection.kind === 'album'
      ? 'Album'
      : collection.kind === 'radio'
        ? 'Live Radio'
        : 'Playlist';

  const handlePlayAll = () => {
    const first = resolvedTracks[0];
    if (!first) return;
    if (resolvedTracks.some((t) => t.id === activeTrackId)) {
      onTogglePlay();
    } else {
      onPlayTrack(first, resolvedTracks);
    }
  };

  const handleShufflePlay = () => {
    if (resolvedTracks.length === 0) return;
    const shuffled = [...resolvedTracks];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    onPlayTrack(shuffled[0], shuffled);
  };

  return (
    <div
      className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center bg-black/82 p-0 sm:p-4 backdrop-blur-2xl"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={collection.title}
        onClick={(e) => e.stopPropagation()}
        className="liquid-glass-elevated flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#000000]/90 text-white shadow-2xl"
      >
        {/* Featured #1 Collection Hero Banner */}
        <div className="relative overflow-hidden border-b border-white/10 p-5 sm:p-6">
          <div className="relative z-10 flex items-start gap-4">
            <CoverArt
              src={collection.coverUrl || resolvedTracks[0]?.coverUrl || ''}
              alt={collection.title}
              fallbackGradient={resolvedTracks[0]?.fallbackGradient}
              className="h-24 w-24 sm:h-28 sm:w-28 shrink-0 rounded-2xl shadow-2xl"
            />
            <div className="min-w-0 flex-1 pr-8">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
                <KindIcon className="h-3.5 w-3.5" />
                <span>
                  {kindLabel}
                  {collection.year ? ` · ${collection.year}` : ''}
                  {collection.genre ? ` · ${collection.genre}` : ''}
                </span>
              </div>

              <h2 className="font-display mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-white line-clamp-2">
                {collection.title}
              </h2>

              {collection.kind === 'album' ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenArtist(collection.subtitle);
                  }}
                  className="mt-0.5 text-sm font-medium text-white/75 hover:text-white hover:underline truncate max-w-full block text-left"
                >
                  {collection.subtitle}
                </button>
              ) : (
                <p className="mt-0.5 text-sm font-medium text-white/70 truncate">
                  {collection.subtitle}
                </p>
              )}

              {collection.description && (
                <p className="mt-1.5 text-xs text-white/50 line-clamp-2">
                  {collection.description}
                </p>
              )}

              {collection.spotifyUrl && (
                <a
                  href={collection.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-white/70 hover:text-white underline-offset-2 hover:underline"
                >
                  <span>View on Spotify</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close collection detail"
              className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Primary Play / Shuffle Strip */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={resolvedTracks.length === 0}
                onClick={handlePlayAll}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-semibold text-black hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-45"
              >
                {isCollectionPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
                    <span>Play All</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={resolvedTracks.length < 2}
                onClick={handleShufflePlay}
                className="liquid-glass inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white hover:bg-white/15 active:scale-95 transition-all disabled:opacity-45"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Shuffle</span>
              </button>
            </div>

            <span className="text-xs font-medium text-white/50 tabular-nums">
              {isLoading ? 'Loading tracks…' : `${resolvedTracks.length} tracks`}
            </span>
          </div>
        </div>

        {/* Tracklist */}
        <div className="glass-scroll flex-1 overflow-y-auto p-4 sm:p-5 space-y-1.5">
          {isLoading && resolvedTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/75" />
              <p className="text-xs text-white/55">Loading full tracklist…</p>
            </div>
          ) : resolvedTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm font-semibold text-white">Tracklist unavailable right now</p>
              <p className="text-xs text-white/55">
                {isOnline && !offlineMode
                  ? 'Tap retry to fetch this release again.'
                  : 'Connect to the internet or disable Offline Mode to load tracks.'}
              </p>
              {isOnline && !offlineMode && (
                <button
                  type="button"
                  onClick={() => setRetryCount((c) => c + 1)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/12 border border-white/16 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          ) : (
            resolvedTracks.map((track, idx) => {
              const isCurrent = track.id === activeTrackId;
              const isDownloaded = downloadedTrackIds.has(track.id);
              return (
                <div
                  key={`${track.id}-${idx}`}
                  className={`flex items-center justify-between gap-2.5 rounded-2xl px-3 py-2.5 transition-colors ${
                    isCurrent
                      ? 'bg-white/14 border border-white/20'
                      : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.08]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrent) onTogglePlay();
                      else onPlayTrack(track, resolvedTracks);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-white/45 tabular-nums">
                      {isCurrent && isPlaying ? (
                        <Pause className="mx-auto h-3.5 w-3.5 fill-white text-white" />
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <CoverArt
                      src={track.coverUrl}
                      alt={track.title}
                      fallbackGradient={track.fallbackGradient}
                      className="h-10 w-10 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                      <p className="truncate text-xs text-white/55">
                        {track.artist} · {formatTime(track.duration)}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onAddToQueue(track)}
                      aria-label={`Queue ${track.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/12 hover:text-white transition-colors"
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenAddToPlaylist(track)}
                      aria-label={`Add ${track.title} to playlist`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/12 hover:text-white transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleDownload(track)}
                      aria-label={isDownloaded ? 'Remove offline download' : 'Download offline'}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        isDownloaded
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-white/55 hover:bg-white/12 hover:text-white'
                      }`}
                    >
                      {isDownloaded ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
