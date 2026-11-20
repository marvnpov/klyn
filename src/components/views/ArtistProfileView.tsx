import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  BadgeCheck,
  BellRing,
  Check,
  Disc,
  Heart,
  Loader2,
  Pause,
  Play,
  Plus,
  UserPlus,
} from 'lucide-react';
import { formatTime } from '../../data/catalog';
import { ArtistAlbum, Track } from '../../types/music';
import { lookupArtistCatalog } from '../../utils/itunesApi';
import { CoverArt } from '../CoverArt';

interface ArtistProfileViewProps {
  artistName: string;
  tracks: Track[];
  activeTrackId: string;
  isPlaying: boolean;
  isFollowing: boolean;
  favoriteIds: Set<string>;
  downloadedTrackIds: Set<string>;
  onBack: () => void;
  onToggleFollow: (artistName: string) => void;
  onPlayTrack: (track: Track, queueList?: Track[]) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleDownload: (track: Track) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onRegisterTracks?: (tracks: Track[]) => void;
}

export const ArtistProfileView: React.FC<ArtistProfileViewProps> = ({
  artistName,
  tracks,
  activeTrackId,
  isPlaying,
  isFollowing,
  favoriteIds,
  downloadedTrackIds,
  onBack,
  onToggleFollow,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onToggleFavorite,
  onToggleDownload,
  onOpenAddToPlaylist,
  onRegisterTracks,
}) => {
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [isLoadingArtist, setIsLoadingArtist] = useState(false);
  const [fetchedAlbums, setFetchedAlbums] = useState<ArtistAlbum[]>([]);

  const artistTracks = useMemo(
    () => tracks.filter((t) => t.artist.toLowerCase() === artistName.toLowerCase()),
    [tracks, artistName],
  );
  const knownArtistId = useMemo(
    () => artistTracks.find((t) => t.artistId)?.artistId,
    [artistTracks],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingArtist(true);

    lookupArtistCatalog({ artistId: knownArtistId, artistName }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.tracks.length > 0) {
          onRegisterTracks?.(res.tracks);
        }
        if (res.albums.length > 0) {
          setFetchedAlbums(res.albums);
        }
      })
      .catch(() => {
        // Resilient fallback to existing tracks
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingArtist(false);
      });

    return () => controller.abort();
  }, [artistName, knownArtistId, onRegisterTracks]);

  const leadTrack = artistTracks[0];
  const isArtistPlaying = artistTracks.some((t) => t.id === activeTrackId) && isPlaying;

  const mergedAlbums = useMemo(() => {
    const map = new Map<string, ArtistAlbum>();
    for (const alb of fetchedAlbums) {
      map.set(alb.title.toLowerCase(), { ...alb });
    }
    for (const t of artistTracks) {
      const key = t.album.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.trackIds.includes(t.id)) {
          existing.trackIds.push(t.id);
        }
      } else {
        map.set(key, {
          id: `alb-${t.collectionId ?? t.id}`,
          collectionId: t.collectionId,
          title: t.album,
          year: t.year,
          type: t.album.toLowerCase().includes('single') ? 'Single' : 'Album',
          coverUrl: t.coverUrl,
          trackIds: [t.id],
        });
      }
    }
    return Array.from(map.values());
  }, [fetchedAlbums, artistTracks]);

  return (
    <div className="space-y-8">
      {/* Back Pill */}
      <div>
        <button
          type="button"
          onClick={onBack}
          className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/12 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </button>
      </div>

      {/* Artist Hero Header */}
      <section className="liquid-glass relative overflow-hidden rounded-3xl p-5 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ background: leadTrack?.primaryColor ?? '#C27838' }}
        />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
          <CoverArt
            src={leadTrack?.coverUrl ?? ''}
            alt={artistName}
            fallbackGradient={leadTrack?.fallbackGradient}
            className="h-32 w-32 sm:h-40 sm:w-40 shrink-0 rounded-full border border-white/20 shadow-2xl"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/65">
              <span className="inline-flex items-center gap-1 text-white/90 font-semibold">
                <BadgeCheck className="h-4 w-4" />
                <span>Artist</span>
              </span>
              {leadTrack && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{leadTrack.genre}</span>
                </>
              )}
              {isLoadingArtist && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-white/60">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading catalog</span>
                  </span>
                </>
              )}
            </div>

            <h1 className="font-display mt-1.5 text-3xl sm:text-5xl font-bold tracking-tight text-white">
              {artistName}
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
              {artistTracks.length > 0
                ? `${artistTracks.length} songs and ${mergedAlbums.length} releases indexed on klyn.`
                : isLoadingArtist
                  ? 'Fetching artist discography from music catalog…'
                  : 'Explore releases and play full-length audio.'}
            </p>

            {/* Primary Actions: Play + Follow / Following */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {leadTrack && (
                <button
                  type="button"
                  onClick={() => {
                    if (isArtistPlaying) onTogglePlay();
                    else onPlayTrack(leadTrack, artistTracks);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-95"
                >
                  {isArtistPlaying ? (
                    <>
                      <Pause className="h-4 w-4 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>Play Popular</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggleFollow(artistName)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all active:scale-95 ${
                  isFollowing
                    ? 'bg-white/18 border border-white/30 text-white'
                    : 'liquid-glass text-white hover:bg-white/12'
                }`}
              >
                {isFollowing ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    <span>Follow</span>
                  </>
                )}
              </button>

              {isFollowing && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85">
                  <BellRing className="h-3.5 w-3.5" />
                  <span>New Release Alerts Active</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Popular Songs */}
      <section aria-label="Popular songs">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-white">Popular Songs</h2>
          <span className="text-xs text-white/50 tabular-nums">
            {artistTracks.length} {artistTracks.length === 1 ? 'track' : 'tracks'}
          </span>
        </div>

        {artistTracks.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-8 text-center">
            {isLoadingArtist ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-white/75" />
                <p className="text-xs text-white/60">Loading {artistName} songs…</p>
              </div>
            ) : (
              <p className="text-sm text-white/60">No tracks found for {artistName}.</p>
            )}
          </div>
        ) : (
          <div className="liquid-glass divide-y divide-white/[0.07] rounded-3xl px-2 sm:px-4">
            {artistTracks.map((track, index) => {
              const isCurrent = track.id === activeTrackId;
              const isFav = favoriteIds.has(track.id);
              return (
                <div
                  key={`art-song-${track.id}-${index}`}
                  className="flex items-center gap-3 sm:gap-4 py-3 px-2 rounded-2xl hover:bg-white/[0.04] transition-colors"
                >
                  <span className="w-5 text-center text-xs font-semibold text-white/45 tabular-nums">
                    {index + 1}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      if (isCurrent) {
                        if (!isPlaying) onTogglePlay();
                        onOpenPlayer();
                      } else {
                        onPlayTrack(track, artistTracks);
                      }
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <CoverArt
                      src={track.coverUrl}
                      alt={track.title}
                      fallbackGradient={track.fallbackGradient}
                      className="h-12 w-12 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{track.title}</p>
                      <p className="truncate text-xs text-white/55">
                        {track.album} · {track.year}
                      </p>
                    </div>
                  </button>

                  <span className="hidden sm:inline text-xs text-white/45 tabular-nums">
                    {formatTime(track.duration)}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleDownload(track)}
                      aria-label={
                        downloadedTrackIds.has(track.id)
                          ? `Remove ${track.title} from downloads`
                          : `Download ${track.title}`
                      }
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                        downloadedTrackIds.has(track.id)
                          ? 'bg-white text-black'
                          : 'text-white/60 hover:bg-white/10 hover:text-white'
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
                      onClick={() => onToggleFavorite(track.id)}
                      aria-label={isFav ? `Remove ${track.title} from favorites` : `Favorite ${track.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Heart className={`h-4 w-4 ${isFav ? 'fill-white text-white' : ''}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenAddToPlaylist(track)}
                      aria-label={`Add ${track.title} to playlist`}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Albums & Releases */}
      {mergedAlbums.length > 0 && (
        <section aria-label="Albums and releases">
          <div className="mb-3.5 flex items-baseline justify-between">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Albums &amp; Releases
            </h2>
            <span className="text-xs text-white/50 tabular-nums">
              {mergedAlbums.length} releases
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mergedAlbums.map((album, albIdx) => {
              const albumTracks = artistTracks.filter(
                (t) =>
                  album.trackIds.includes(t.id) ||
                  t.album.toLowerCase() === album.title.toLowerCase(),
              );
              const firstTrack = albumTracks[0] ?? leadTrack;
              const isExpanded = expandedAlbumId === album.id;

              return (
                <div key={`art-alb-${album.id}-${albIdx}`} className="liquid-glass rounded-3xl p-4 space-y-3">
                  <div className="flex items-center gap-3.5">
                    <CoverArt
                      src={album.coverUrl}
                      alt={album.title}
                      className="h-20 w-20 shrink-0 rounded-2xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-white/55">
                        {album.type} · {album.year}
                      </p>
                      <h3 className="font-display mt-0.5 truncate text-base font-bold text-white">
                        {album.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-white/50 tabular-nums">
                        {albumTracks.length} {albumTracks.length === 1 ? 'track' : 'tracks'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!firstTrack}
                      onClick={() =>
                        firstTrack &&
                        onPlayTrack(firstTrack, albumTracks.length ? albumTracks : artistTracks)
                      }
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white py-2 px-3 text-xs font-semibold text-black hover:scale-[1.01] active:scale-95 transition-transform disabled:opacity-40"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Play {album.type}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedAlbumId(isExpanded ? null : album.id)}
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 py-2 px-3 text-xs font-medium text-white/85 hover:bg-white/16 transition-colors"
                    >
                      <Disc className="h-3.5 w-3.5" />
                      <span>{isExpanded ? 'Hide' : 'Tracks'}</span>
                    </button>
                  </div>

                  {isExpanded && albumTracks.length > 0 && (
                    <div className="border-t border-white/10 pt-2 space-y-1">
                      {albumTracks.map((t, idx) => (
                        <button
                          key={`art-alb-tr-${album.id}-${t.id}-${idx}`}
                          type="button"
                          onClick={() => {
                            if (t.id === activeTrackId) {
                              if (!isPlaying) onTogglePlay();
                              onOpenPlayer();
                            } else {
                              onPlayTrack(t, albumTracks);
                            }
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-white/8 transition-colors"
                        >
                          <span className="truncate text-white/85">
                            {idx + 1}. {t.title}
                          </span>
                          <span className="text-white/45 tabular-nums">
                            {formatTime(t.duration)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
