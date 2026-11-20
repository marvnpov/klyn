import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  BellRing,
  BookOpen,
  Check,
  Headphones,
  Heart,
  ListMusic,
  Pause,
  Pin,
  Play,
  Plus,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { formatTime } from '../../data/catalog';
import { fetchRealArtistPhoto, getCachedArtistPhoto } from '../../services/artistProfiles';
import { getOfflineStorageStats, OfflineStorageStats } from '../../services/offlineCache';
import {
  LibrarySubTab,
  LikedSongsCustomization,
  PlaylistItem,
  PodcastShow,
  ShowProgressEntry,
  Track,
} from '../../types/music';
import { ACCENT_GRADIENT_PRESETS, CustomizePlaylistModal, CustomizePlaylistTarget } from '../CustomizePlaylistModal';
import { CoverArt } from '../CoverArt';
import { PillTabItem, SpringPillTabs } from '../SpringPillTabs';

interface LibraryViewProps {
  tracks: Track[];
  playlists: PlaylistItem[];
  shows: PodcastShow[];
  showProgress: Record<string, ShowProgressEntry>;
  likedSongsCustomization: LikedSongsCustomization;
  activeTrackId: string;
  isPlaying: boolean;
  favoriteIds: Set<string>;
  downloadedTrackIds: Set<string>;
  followedArtists: Set<string>;
  onPlayTrack: (track: Track, queueList?: Track[]) => void;
  onTogglePlay: () => void;
  onOpenPlayer: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleDownload: (track: Track) => void;
  onDownloadTracks: (tracks: Track[], label?: string) => void;
  onClearDownloads: () => void;
  onOpenArtist: (artistName: string) => void;
  onOpenShow: (show: PodcastShow) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onOpenCreatePlaylist: () => void;
  onOpenQueue: () => void;
  onTogglePinPlaylist: (playlistId: string) => void;
  onTogglePinLikedSongs: () => void;
  onUpdatePlaylist: (playlistId: string, patch: Partial<PlaylistItem>) => void;
  onUpdateLikedSongsCustomization: (patch: Partial<LikedSongsCustomization>) => void;
  onToggleTrackInPlaylist: (playlistId: string, track: Track) => void;
}

const LIBRARY_TABS: PillTabItem<LibrarySubTab>[] = [
  { id: 'Playlists', label: 'Playlists' },
  { id: 'Albums', label: 'Albums' },
  { id: 'Artists', label: 'Artists' },
  { id: 'Shows', label: 'Shows' },
  { id: 'Downloaded', label: 'Downloaded' },
];

export const LibraryView: React.FC<LibraryViewProps> = ({
  tracks,
  playlists,
  shows,
  showProgress,
  likedSongsCustomization,
  activeTrackId,
  isPlaying,
  favoriteIds,
  downloadedTrackIds,
  followedArtists,
  onPlayTrack,
  onTogglePlay,
  onOpenPlayer,
  onToggleFavorite,
  onToggleDownload,
  onDownloadTracks,
  onClearDownloads,
  onOpenArtist,
  onOpenShow,
  onOpenAddToPlaylist,
  onOpenCreatePlaylist,
  onOpenQueue,
  onTogglePinPlaylist,
  onTogglePinLikedSongs,
  onUpdatePlaylist,
  onUpdateLikedSongsCustomization,
  onToggleTrackInPlaylist,
}) => {
  const [subTab, setSubTab] = useState<LibrarySubTab>('Playlists');
  const [openedCollectionId, setOpenedCollectionId] = useState<string | null>(null);
  const [customizeTarget, setCustomizeTarget] = useState<CustomizePlaylistTarget | null>(null);
  const [showAddSongsDrawer, setShowAddSongsDrawer] = useState(false);
  const [storageStats, setStorageStats] = useState<OfflineStorageStats | null>(null);
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({});
  const lastStatsKeyRef = useRef<string>('');

  useEffect(() => {
    if (subTab !== 'Downloaded') {
      lastStatsKeyRef.current = '';
      return;
    }
    const key = `Downloaded::${downloadedTrackIds.size}`;
    if (lastStatsKeyRef.current === key) return;
    lastStatsKeyRef.current = key;

    let active = true;
    getOfflineStorageStats()
      .then((stats) => {
        if (active) setStorageStats(stats);
      })
      .catch(() => {
        // Ignore storage read failures in restricted frames
      });
    return () => {
      active = false;
    };
  }, [subTab, downloadedTrackIds.size]);

  const favoriteTracks = useMemo(
    () => tracks.filter((t) => favoriteIds.has(t.id)),
    [tracks, favoriteIds],
  );

  const sortedPlaylists = useMemo(
    () =>
      [...playlists].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return 0;
      }),
    [playlists],
  );

  const downloadedTracks = useMemo(
    () => tracks.filter((t) => downloadedTrackIds.has(t.id) || t.downloaded),
    [tracks, downloadedTrackIds],
  );

  const artists = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach((t) => {
      const list = map.get(t.artist) ?? [];
      list.push(t);
      map.set(t.artist, list);
    });
    return Array.from(map.entries());
  }, [tracks]);

  const followedArtistEntries = useMemo(
    () => artists.filter(([name]) => followedArtists.has(name)),
    [artists, followedArtists],
  );

  // Preload real borderless artist portraits when viewing Artists tab
  useEffect(() => {
    if (subTab !== 'Artists' || artists.length === 0) return;
    let cancelled = false;
    artists.slice(0, 24).forEach(([artistName, artTracks]) => {
      const cached = getCachedArtistPhoto(artistName);
      if (cached) {
        setArtistPhotos((prev) => (prev[artistName] ? prev : { ...prev, [artistName]: cached }));
        return;
      }
      fetchRealArtistPhoto(artistName, artTracks[0]?.coverUrl ?? '').then((url) => {
        if (!cancelled && url) {
          setArtistPhotos((prev) => ({ ...prev, [artistName]: url }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [subTab, artists]);

  const activePlaylist =
    openedCollectionId && openedCollectionId !== 'liked-songs'
      ? playlists.find((p) => p.id === openedCollectionId) ?? null
      : null;

  const isViewingLikedSongs = openedCollectionId === 'liked-songs';
  const isViewingDetail = isViewingLikedSongs || activePlaylist !== null;

  const detailTracks = useMemo(() => {
    if (isViewingLikedSongs) return favoriteTracks;
    if (activePlaylist) return tracks.filter((t) => activePlaylist.trackIds.includes(t.id));
    return [];
  }, [isViewingLikedSongs, favoriteTracks, activePlaylist, tracks]);

  const totalDetailDuration = detailTracks.reduce((acc, t) => acc + t.duration, 0);

  const openCustomizeForLikedSongs = () => {
    setCustomizeTarget({
      isLikedSongs: true,
      id: 'liked-songs',
      title: likedSongsCustomization.title,
      description: likedSongsCustomization.description,
      pinned: likedSongsCustomization.pinned,
      accentGradient: likedSongsCustomization.accentGradient,
      displayMode: likedSongsCustomization.displayMode,
      showQualityBadges: likedSongsCustomization.showQualityBadges,
    });
  };

  const openCustomizeForPlaylist = (pl: PlaylistItem) => {
    setCustomizeTarget({
      isLikedSongs: false,
      id: pl.id,
      title: pl.title,
      description: pl.description,
      coverUrl: pl.coverUrl,
      pinned: Boolean(pl.pinned),
      accentGradient: pl.accentGradient ?? ACCENT_GRADIENT_PRESETS[0].gradient,
      displayMode: pl.displayMode ?? 'comfortable',
      showQualityBadges: pl.showQualityBadges ?? true,
    });
  };

  const handleSaveCustomization = (updated: CustomizePlaylistTarget) => {
    if (updated.isLikedSongs) {
      onUpdateLikedSongsCustomization({
        title: updated.title,
        description: updated.description,
        pinned: updated.pinned,
        accentGradient: updated.accentGradient,
        displayMode: updated.displayMode,
        showQualityBadges: updated.showQualityBadges,
      });
    } else {
      onUpdatePlaylist(updated.id, {
        title: updated.title,
        description: updated.description,
        coverUrl: updated.coverUrl,
        pinned: updated.pinned,
        accentGradient: updated.accentGradient,
        displayMode: updated.displayMode,
        showQualityBadges: updated.showQualityBadges,
      });
    }
  };

  // ================= DETAIL VIEW FOR OPENED PLAYLIST OR LIKED SONGS =================
  if (isViewingDetail) {
    const title = isViewingLikedSongs
      ? likedSongsCustomization.title
      : activePlaylist?.title ?? 'Playlist';
    const description = isViewingLikedSongs
      ? likedSongsCustomization.description
      : activePlaylist?.description ?? '';
    const curator = isViewingLikedSongs
      ? 'Personal Favorites'
      : activePlaylist?.curator ?? 'klyn';
    const isPinned = isViewingLikedSongs
      ? likedSongsCustomization.pinned
      : Boolean(activePlaylist?.pinned);
    const accentGradient = isViewingLikedSongs
      ? likedSongsCustomization.accentGradient
      : activePlaylist?.accentGradient ?? ACCENT_GRADIENT_PRESETS[0].gradient;
    const displayMode = isViewingLikedSongs
      ? likedSongsCustomization.displayMode
      : activePlaylist?.displayMode ?? 'comfortable';
    const showQualityBadges = isViewingLikedSongs
      ? likedSongsCustomization.showQualityBadges
      : activePlaylist?.showQualityBadges ?? true;

    const isCollectionPlaying =
      detailTracks.some((t) => t.id === activeTrackId) && isPlaying;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setOpenedCollectionId(null);
              setShowAddSongsDrawer(false);
            }}
            className="liquid-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/14 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Library</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isViewingLikedSongs) onTogglePinLikedSongs();
                else if (activePlaylist) onTogglePinPlaylist(activePlaylist.id);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                isPinned
                  ? 'bg-white text-black'
                  : 'liquid-glass text-white/85 hover:bg-white/14'
              }`}
            >
              <Pin className="h-3.5 w-3.5" />
              <span>{isPinned ? 'Pinned' : 'Pin'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isViewingLikedSongs) openCustomizeForLikedSongs();
                else if (activePlaylist) openCustomizeForPlaylist(activePlaylist);
              }}
              className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white/90 hover:bg-white/14 transition-colors"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Customize</span>
            </button>
          </div>
        </div>

        {/* Hero Banner */}
        <section
          className="liquid-glass-elevated relative overflow-hidden rounded-3xl p-5 sm:p-7"
          style={{ background: accentGradient }}
        >
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            {isViewingLikedSongs ? (
              <div
                className="flex h-36 w-36 sm:h-40 sm:w-40 shrink-0 items-center justify-center rounded-3xl border border-white/25 shadow-2xl"
                style={{ background: accentGradient }}
              >
                <Heart className="h-14 w-14 fill-white text-white" />
              </div>
            ) : (
              <CoverArt
                src={activePlaylist?.coverUrl ?? detailTracks[0]?.coverUrl ?? ''}
                alt={title}
                className="h-36 w-36 sm:h-40 sm:w-40 shrink-0 rounded-3xl border border-white/20 shadow-2xl"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/75">
                {activePlaylist?.isAiBlend && (
                  <span className="inline-flex items-center gap-1 text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Klyn AI Blend</span>
                    <span aria-hidden="true">·</span>
                  </span>
                )}
                <span>{curator}</span>
                {isPinned && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Pinned</span>
                  </>
                )}
              </div>

              <h1 className="font-display mt-1 text-3xl sm:text-4xl font-bold text-white leading-tight">
                {title}
              </h1>
              <p className="mt-1.5 text-sm text-white/75">{description}</p>
              <p className="mt-2 text-xs text-white/60 tabular-nums">
                {detailTracks.length} {detailTracks.length === 1 ? 'track' : 'tracks'} ·{' '}
                {Math.max(1, Math.round(totalDetailDuration / 60))} min total
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={detailTracks.length === 0}
                  onClick={() => {
                    if (detailTracks.length === 0) return;
                    if (isCollectionPlaying) onTogglePlay();
                    else onPlayTrack(detailTracks[0], detailTracks);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                >
                  {isCollectionPlaying ? (
                    <>
                      <Pause className="h-4 w-4 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>Play All</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={detailTracks.length === 0}
                  onClick={() => {
                    if (detailTracks.length === 0) return;
                    const shuffled = [...detailTracks].sort(() => Math.random() - 0.5);
                    onPlayTrack(shuffled[0], shuffled);
                  }}
                  className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/16 transition-colors disabled:opacity-40"
                >
                  <Shuffle className="h-4 w-4" />
                  <span>Shuffle</span>
                </button>

                <button
                  type="button"
                  disabled={detailTracks.length === 0}
                  onClick={() => onDownloadTracks(detailTracks, title)}
                  className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/16 transition-colors disabled:opacity-40"
                >
                  {detailTracks.length > 0 &&
                  detailTracks.every((t) => downloadedTrackIds.has(t.id)) ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Downloaded</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="h-4 w-4" />
                      <span>Download</span>
                    </>
                  )}
                </button>

                {!isViewingLikedSongs && activePlaylist && (
                  <button
                    type="button"
                    onClick={() => setShowAddSongsDrawer((v) => !v)}
                    className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/16 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{showAddSongsDrawer ? 'Done Adding' : 'Add Tracks'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Inline Add Tracks Drawer for regular playlists */}
        {showAddSongsDrawer && activePlaylist && (
          <section className="liquid-glass rounded-3xl p-4 sm:p-5 space-y-3">
            <p className="text-xs font-semibold text-white/65">
              Tap to add or remove tracks from &ldquo;{activePlaylist.title}&rdquo;
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tracks.map((t, idx) => {
                const included = activePlaylist.trackIds.includes(t.id);
                return (
                  <button
                    key={`edit-tr-${t.id}-${idx}`}
                    type="button"
                    onClick={() => onToggleTrackInPlaylist(activePlaylist.id, t)}
                    className={`flex items-center justify-between gap-2.5 rounded-2xl p-2 text-left transition-colors ${
                      included
                        ? 'bg-white/14 border border-white/25'
                        : 'bg-white/[0.04] border border-transparent hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CoverArt src={t.coverUrl} alt={t.title} className="h-9 w-9 shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{t.title}</p>
                        <p className="truncate text-[11px] text-white/55">{t.artist}</p>
                      </div>
                    </div>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        included ? 'bg-white text-black' : 'bg-white/10 text-white/75'
                      }`}
                    >
                      {included ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Tracklist */}
        <section aria-label="Playlist tracks">
          {detailTracks.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 text-center">
              <p className="text-sm font-semibold text-white">No tracks here yet</p>
              <p className="mt-1 text-xs text-white/55">
                {isViewingLikedSongs
                  ? 'Tap the heart on any song to save it to your Liked Songs.'
                  : 'Use "Add Tracks" above to populate this playlist.'}
              </p>
            </div>
          ) : (
            <div className="liquid-glass divide-y divide-white/[0.07] rounded-3xl px-2 sm:px-4">
              {detailTracks.map((track, idx) => {
                const isCurrent = track.id === activeTrackId;
                return (
                  <div
                    key={`detail-${track.id}-${idx}`}
                    className={`flex items-center gap-3 sm:gap-4 px-2 rounded-2xl hover:bg-white/[0.04] transition-colors ${
                      displayMode === 'compact' ? 'py-2' : 'py-3'
                    }`}
                  >
                    <span className="w-5 text-center text-xs font-semibold text-white/45 tabular-nums">
                      {idx + 1}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrent) {
                          if (!isPlaying) onTogglePlay();
                          onOpenPlayer();
                        } else {
                          onPlayTrack(track, detailTracks);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <CoverArt
                        src={track.coverUrl}
                        alt={track.title}
                        fallbackGradient={track.fallbackGradient}
                        className={`${
                          displayMode === 'compact' ? 'h-9 w-9' : 'h-12 w-12'
                        } shrink-0 rounded-xl`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {track.title}
                        </p>
                        <p className="truncate text-xs text-white/55">
                          {track.artist}
                          {showQualityBadges ? ` · ${track.quality}` : ''}
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
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                          downloadedTrackIds.has(track.id)
                            ? 'bg-white text-black'
                            : 'text-white/55 hover:bg-white/12 hover:text-white'
                        }`}
                      >
                        {downloadedTrackIds.has(track.id) ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) onTogglePlay();
                          else onPlayTrack(track, detailTracks);
                        }}
                        aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white hover:text-black transition-colors"
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isViewingLikedSongs) onToggleFavorite(track.id);
                          else if (activePlaylist) onToggleTrackInPlaylist(activePlaylist.id, track);
                        }}
                        aria-label={
                          isViewingLikedSongs
                            ? `Unlike ${track.title}`
                            : `Remove ${track.title} from ${title}`
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/12 hover:text-white transition-colors"
                      >
                        {isViewingLikedSongs ? (
                          <Heart className="h-3.5 w-3.5 fill-white text-white" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <CustomizePlaylistModal
          target={customizeTarget}
          tracks={tracks}
          onClose={() => setCustomizeTarget(null)}
          onSave={handleSaveCustomization}
        />
      </div>
    );
  }

  // ================= MAIN LIBRARY VIEW =================
  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-white/55">Your Collection</p>
            <h1 className="font-display mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Library
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenQueue}
              className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white/90 hover:bg-white/12 transition-colors"
            >
              <ListMusic className="h-3.5 w-3.5" />
              <span>Queue</span>
            </button>

            <button
              type="button"
              onClick={onOpenCreatePlaylist}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Playlist</span>
            </button>
          </div>
        </div>

        {/* Secondary Spring-Sliding Pill Switcher */}
        <SpringPillTabs
          items={LIBRARY_TABS}
          activeId={subTab}
          onChange={setSubTab}
          variant="hug"
          size="sm"
          ariaLabel="Library categories"
          className="liquid-glass p-1 self-start overflow-x-auto max-w-full"
        />
      </div>

      {/* Playlists Tab */}
      {subTab === 'Playlists' && (
        <div className="space-y-3">
          {/* Dynamic Liked Songs Card (Tap card to view tracks; controls to play, pin, or customize) */}
          <div className="liquid-glass group flex w-full items-center gap-3.5 rounded-2xl p-3.5 transition-colors hover:bg-white/[0.09]">
            <button
              type="button"
              onClick={() => setOpenedCollectionId('liked-songs')}
              className="flex min-w-0 flex-1 items-center gap-4 text-left focus-visible:outline-none"
            >
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-white/20 shadow-lg"
                style={{ background: likedSongsCustomization.accentGradient }}
              >
                <Heart className="h-7 w-7 fill-white text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {likedSongsCustomization.pinned && <Pin className="h-3 w-3 text-white/60" />}
                  <span className="text-[11px] font-medium text-white/60">
                    {likedSongsCustomization.pinned ? 'Pinned Playlist' : 'Favorites Collection'} · Tap to view tracks
                  </span>
                </div>
                <p className="mt-0.5 truncate font-display text-base sm:text-lg font-bold text-white">
                  {likedSongsCustomization.title}
                </p>
                <p className="truncate text-xs text-white/55 tabular-nums">
                  {favoriteTracks.length} {favoriteTracks.length === 1 ? 'track' : 'tracks'} ·{' '}
                  {likedSongsCustomization.description}
                </p>
              </div>
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePinLikedSongs}
                aria-label={likedSongsCustomization.pinned ? 'Unpin Liked Songs' : 'Pin Liked Songs'}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  likedSongsCustomization.pinned
                    ? 'bg-white/20 text-white'
                    : 'bg-white/[0.06] text-white/60 hover:bg-white/14 hover:text-white'
                }`}
              >
                <Pin className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={openCustomizeForLikedSongs}
                aria-label="Customize Liked Songs"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/70 hover:bg-white/14 hover:text-white transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                disabled={favoriteTracks.length === 0}
                onClick={() => {
                  const target = favoriteTracks[0];
                  if (!target) return;
                  if (target.id === activeTrackId) onTogglePlay();
                  else onPlayTrack(target, favoriteTracks);
                }}
                aria-label="Play Liked Songs"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-white hover:bg-white hover:text-black transition-colors disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-current translate-x-0.5" />
              </button>
            </div>
          </div>

          {/* Editorial & User Playlists (Pinned sorted first) */}
          {sortedPlaylists.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 text-center">
              <p className="text-sm font-semibold text-white">No custom playlists yet</p>
              <p className="mt-1 text-xs text-white/55">
                Tap &ldquo;Create Playlist&rdquo; above or use + on any track to build your library.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortedPlaylists.map((pl, idx) => {
                const plTracks = tracks.filter((t) => pl.trackIds.includes(t.id));
                const first = plTracks[0];
                const isActive = plTracks.some((t) => t.id === activeTrackId);

              return (
                <div
                  key={`lib-pl-${pl.id}-${idx}`}
                  className="liquid-glass group flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-white/[0.09]"
                >
                  <button
                    type="button"
                    onClick={() => setOpenedCollectionId(pl.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                  >
                    <CoverArt
                      src={pl.coverUrl}
                      alt={pl.title}
                      className="h-16 w-16 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {pl.pinned && <Pin className="h-3 w-3 shrink-0 text-white/65" />}
                        {pl.isAiBlend && <Sparkles className="h-3 w-3 shrink-0 text-white/75" />}
                        <span className="truncate text-xs text-white/55">{pl.curator}</span>
                      </div>
                      <p className="mt-0.5 truncate font-display text-base font-bold text-white">
                        {pl.title}
                      </p>
                      <p className="truncate text-xs text-white/50 tabular-nums">
                        {plTracks.length} {plTracks.length === 1 ? 'song' : 'songs'} · {pl.description}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTogglePinPlaylist(pl.id)}
                      aria-label={pl.pinned ? `Unpin ${pl.title}` : `Pin ${pl.title}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        pl.pinned
                          ? 'bg-white/20 text-white'
                          : 'bg-white/[0.05] text-white/55 hover:bg-white/14 hover:text-white'
                      }`}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => openCustomizeForPlaylist(pl)}
                      aria-label={`Customize ${pl.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/65 hover:bg-white/14 hover:text-white transition-colors"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={!first}
                      onClick={() => {
                        if (!first) return;
                        if (isActive && first.id === activeTrackId) onTogglePlay();
                        else onPlayTrack(first, plTracks);
                      }}
                      aria-label={isActive && isPlaying ? `Pause ${pl.title}` : `Play ${pl.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white hover:text-black transition-colors disabled:opacity-40"
                    >
                      {isActive && isPlaying ? (
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
        </div>
      )}

      {/* Albums Tab */}
      {subTab === 'Albums' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {tracks.map((track, idx) => {
            const isCurrent = track.id === activeTrackId;
            return (
              <div
                key={`lib-alb-${track.id}-${idx}`}
                className="liquid-glass group flex flex-col rounded-2xl p-2.5 transition-colors hover:bg-white/[0.09]"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isCurrent) {
                      if (!isPlaying) onTogglePlay();
                      onOpenPlayer();
                    } else {
                      onPlayTrack(track, tracks);
                    }
                  }}
                  className="relative aspect-square w-full overflow-hidden rounded-xl"
                >
                  <CoverArt
                    src={track.coverUrl}
                    alt={track.album}
                    fallbackGradient={track.fallbackGradient}
                    className="h-full w-full"
                  />
                </button>
                <p className="mt-2.5 truncate text-sm font-semibold text-white">{track.album}</p>
                <button
                  type="button"
                  onClick={() => onOpenArtist(track.artist)}
                  className="truncate text-left text-xs text-white/55 hover:text-white hover:underline mt-0.5"
                >
                  {track.artist} · {track.year}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Artists Tab (Pure Borderless Circular Portraits) */}
      {subTab === 'Artists' && (
        <div className="space-y-8">
          {followedArtistEntries.length > 0 && (
            <section aria-label="Following artists">
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">Following Artists</h2>
                <span className="text-xs text-white/50 tabular-nums">
                  {followedArtistEntries.length} followed
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-5">
                {followedArtistEntries.map(([artistName, artistTracks], idx) => {
                  const lead = artistTracks[0];
                  const photoUrl =
                    artistPhotos[artistName] ||
                    getCachedArtistPhoto(artistName) ||
                    lead?.coverUrl ||
                    '';
                  return (
                    <button
                      key={`followed-${artistName}-${idx}`}
                      type="button"
                      onClick={() => onOpenArtist(artistName)}
                      className="spring-card group flex flex-col items-center text-center"
                    >
                      <div className="h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full bg-zinc-900">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={artistName}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white/75">
                            {artistName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <p className="mt-2.5 w-full truncate font-display text-xs sm:text-sm font-bold text-white">
                        {artistName}
                      </p>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-white/55">
                        <BellRing className="h-2.5 w-2.5" />
                        <span>Alerts on</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-label="All artists">
            <h2 className="font-display mb-4 text-lg font-bold text-white">All Artists</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-5">
              {artists.map(([artistName, artistTracks], idx) => {
                const lead = artistTracks[0];
                const photoUrl =
                  artistPhotos[artistName] ||
                  getCachedArtistPhoto(artistName) ||
                  lead?.coverUrl ||
                  '';
                return (
                  <button
                    key={`lib-art-${artistName}-${idx}`}
                    type="button"
                    onClick={() => onOpenArtist(artistName)}
                    className="spring-card group flex flex-col items-center text-center"
                  >
                    <div className="h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full bg-zinc-900">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={artistName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/75">
                          {artistName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <p className="mt-2 w-full truncate font-display text-xs sm:text-sm font-semibold text-white">
                      {artistName}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Shows Tab (Podcasts & Audiobooks) */}
      {subTab === 'Shows' && (
        <div className="space-y-4">
          {shows.length === 0 ? (
            <div className="liquid-glass rounded-3xl p-8 text-center space-y-2">
              <Headphones className="mx-auto h-7 w-7 text-white/45" />
              <p className="text-sm font-semibold text-white">Podcasts &amp; Audiobooks</p>
              <p className="text-xs text-white/55">
                Explore shows on Home or Search to resume episodes and audiobooks here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shows.map((show, idx) => {
                const prog = showProgress[show.id];
                return (
                  <button
                    key={`lib-show-${show.id}-${idx}`}
                    type="button"
                    onClick={() => onOpenShow(show)}
                    className="spring-card liquid-glass flex items-center gap-3.5 rounded-2xl p-3 text-left hover:bg-white/[0.09]"
                  >
                    <CoverArt
                      src={show.coverUrl}
                      alt={show.title}
                      className="h-16 w-16 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/55">
                        {show.kind === 'audiobook' ? (
                          <BookOpen className="h-3 w-3" />
                        ) : (
                          <Headphones className="h-3 w-3" />
                        )}
                        <span>{show.kind === 'audiobook' ? 'Audiobook' : 'Podcast'}</span>
                      </span>
                      <p className="truncate font-display text-sm font-bold text-white mt-0.5">
                        {show.title}
                      </p>
                      <p className="truncate text-xs text-white/55">{show.author}</p>
                      {prog && prog.position > 5 && (
                        <p className="mt-1 text-[10px] font-semibold text-emerald-300 tabular-nums">
                          Resume from {formatTime(prog.position)}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Downloaded Tab */}
      {subTab === 'Downloaded' && (
        downloadedTracks.length === 0 ? (
          <div className="liquid-glass rounded-3xl p-8 text-center space-y-2">
            <ArrowDownToLine className="mx-auto h-7 w-7 text-white/45" />
            <p className="text-sm font-semibold text-white">No offline downloads yet</p>
            <p className="mt-1 text-xs text-white/55">
              Tap the Download button in the Player, Search, Artist profiles, or any Playlist to save songs for offline playback.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="liquid-glass-elevated flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  App Downloads · IndexedDB
                </p>
                <p className="font-display mt-0.5 text-lg font-bold text-white tabular-nums">
                  {downloadedTracks.length} {downloadedTracks.length === 1 ? 'track' : 'tracks'} ready offline
                  {storageStats ? ` · ${storageStats.formattedSize}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPlayTrack(downloadedTracks[0], downloadedTracks)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:scale-[1.02] transition-transform"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Play All</span>
                </button>
                <button
                  type="button"
                  onClick={onClearDownloads}
                  className="liquid-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/14 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            <div className="liquid-glass divide-y divide-white/[0.07] rounded-3xl px-3">
              {downloadedTracks.map((track, idx) => {
                const isCurrent = track.id === activeTrackId;
                return (
                  <div
                    key={`dl-${track.id}-${idx}`}
                    className="flex items-center gap-3.5 py-3 px-2 rounded-2xl hover:bg-white/[0.04] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isCurrent) {
                          if (!isPlaying) onTogglePlay();
                          onOpenPlayer();
                        } else {
                          onPlayTrack(track, downloadedTracks);
                        }
                      }}
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (isCurrent) {
                              if (!isPlaying) onTogglePlay();
                              onOpenPlayer();
                            } else {
                              onPlayTrack(track, downloadedTracks);
                            }
                          }}
                          className="truncate text-left text-sm font-semibold text-white"
                        >
                          {track.title}
                        </button>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                          <Check className="h-2.5 w-2.5" />
                          <span>Offline</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenArtist(track.artist)}
                        className="block truncate text-left text-xs text-white/55 hover:text-white hover:underline"
                      >
                        {track.artist} · {track.quality} · {formatTime(track.duration)}
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrent) onTogglePlay();
                          else onPlayTrack(track, downloadedTracks);
                        }}
                        aria-label={isCurrent && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/12 text-white hover:bg-white hover:text-black transition-colors"
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current translate-x-0.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenAddToPlaylist(track)}
                        aria-label={`Add ${track.title} to playlist`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/12 hover:text-white transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleDownload(track)}
                        aria-label={`Remove ${track.title} from downloads`}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/12 hover:text-white transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      <CustomizePlaylistModal
        target={customizeTarget}
        tracks={tracks}
        onClose={() => setCustomizeTarget(null)}
        onSave={handleSaveCustomization}
      />
    </div>
  );
};
