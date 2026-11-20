import React, { useEffect, useRef, useState } from 'react';
import {
  Airplay,
  ArrowDownToLine,
  Bluetooth,
  Check,
  ChevronDown,
  Headphones,
  Heart,
  Laptop,
  ListMusic,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Quote,
  RefreshCw,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Smartphone,
  Speaker,
  Trash2,
  X,
} from 'lucide-react';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { playerEngine } from '../services/playerEngine';
import { RepeatMode, Track } from '../types/music';
import { CoverArt } from './CoverArt';
import { ExpandingScrubber } from './ExpandingScrubber';
import { FullLyricsView } from './FullLyricsView';
import { QueueDrawerModal } from './QueueDrawerModal';

interface FullScreenPlayerProps {
  isOpen: boolean;
  track: Track | null;
  queue: Track[];
  allTracks: Track[];
  isPlaying: boolean;
  currentTime: number;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  isFavorite: boolean;
  isDownloaded: boolean;
  activeDeviceId: string;
  showLyrics: boolean;
  streamingQuality: string;
  spatialEnabled: boolean;
  autoScrollLyrics: boolean;
  onClose: () => void;
  onToggleLyrics: (show: boolean) => void;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleFavorite: (trackId: string) => void;
  onToggleDownload: (track: Track) => void;
  onSelectTrackFromQueue: (track: Track) => void;
  onMoveQueueTrack: (fromIndex: number, toIndex: number) => void;
  onRemoveQueueTrack: (index: number) => void;
  onClearUpcomingQueue: () => void;
  onSelectDevice: (deviceId: string) => void;
  onAddToQueue: (track: Track) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onOpenArtist: (artistName: string) => void;
}

export const FullScreenPlayer: React.FC<FullScreenPlayerProps> = ({
  isOpen,
  track,
  queue,
  allTracks,
  isPlaying,
  currentTime,
  isShuffled,
  repeatMode,
  isFavorite,
  isDownloaded,
  activeDeviceId,
  showLyrics,
  streamingQuality,
  spatialEnabled,
  autoScrollLyrics,
  onClose,
  onToggleLyrics,
  onTogglePlay,
  onSeek,
  onPrevTrack,
  onNextTrack,
  onToggleShuffle,
  onCycleRepeat,
  onToggleFavorite,
  onToggleDownload,
  onSelectTrackFromQueue,
  onMoveQueueTrack,
  onRemoveQueueTrack,
  onClearUpcomingQueue,
  onSelectDevice,
  onAddToQueue,
  onOpenAddToPlaylist,
  onOpenArtist,
}) => {
  const [drawerMode, setDrawerMode] = useState<'none' | 'queue' | 'devices' | 'options'>('none');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const {
    devices: audioDevices,
    isScanningBluetooth,
    scanStatus,
    scanBluetoothDevices,
    refreshAudioOutputs,
    removeBluetoothDevice,
  } = useAudioDevices();

  const hasTrack = Boolean(track);

  useEffect(() => {
    playerEngine.attachYouTubeHost(ytHostRef.current);
    return () => {
      playerEngine.attachYouTubeHost(null);
    };
  }, [hasTrack]);

  // Horizontal swipe gesture state on the Liquid Glass cover stage
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [swipeCue, setSwipeCue] = useState<'prev' | 'next' | null>(null);

  if (!track) return null;

  const triggerCueFeedback = (direction: 'prev' | 'next') => {
    setSwipeCue(direction);
    if (direction === 'next') onNextTrack();
    else onPrevTrack();
    window.setTimeout(() => {
      setSwipeCue((cur) => (cur === direction ? null : cur));
    }, 950);
  };

  const handleCoverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragOffsetX(0);
  };

  const handleCoverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      setDragOffsetX(Math.max(-96, Math.min(96, dx * 0.55)));
    }
  };

  const handleCoverPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = null;
    setDragOffsetX(0);

    // Require clear horizontal swipe (> 48px) to avoid accidental tap skips
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      triggerCueFeedback(dx < 0 ? 'next' : 'prev');
    }
  };

  const handleShare = () => {
    setCopiedNotice(true);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(`${track.title} — ${track.artist} on klyn`).catch(() => {});
    }
    setTimeout(() => setCopiedNotice(false), 1800);
  };

  const qualityHint = `${streamingQuality}${spatialEnabled ? ' · Spatial' : ''}`;

  return (
    <div
      aria-hidden={!isOpen}
      data-quality={qualityHint}
      className={`fixed inset-0 z-50 flex flex-col bg-black transition-all duration-500 ${
        isOpen
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-full opacity-0'
      }`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.32, 1.08, 0.36, 1)',
      }}
    >
      {/* Active Track Radial Ambient Glow */}
      <div
        aria-hidden="true"
        className="ambient-glow-transition pointer-events-none fixed inset-0 opacity-35 blur-[110px]"
        style={{
          background: `radial-gradient(circle at 50% 28%, ${track.primaryColor} 0%, ${track.secondaryColor} 45%, #000000 85%)`,
        }}
      />

      {showLyrics && (
        <div className="relative z-20 h-full w-full">
          <FullLyricsView
            track={track}
            isPlaying={isPlaying}
            currentTime={currentTime}
            autoScrollLyrics={autoScrollLyrics}
            onSeek={onSeek}
            onTogglePlay={onTogglePlay}
            onPrevTrack={onPrevTrack}
            onNextTrack={onNextTrack}
            onExitLyrics={() => onToggleLyrics(false)}
            onCollapsePlayer={() => {
              onToggleLyrics(false);
              onClose();
            }}
          />
        </div>
      )}

      {/* Main Full-Screen Player Canvas */}
      <div
        className={`mx-auto flex h-full w-full max-w-2xl flex-col justify-between px-5 sm:px-8 pt-4 sm:pt-7 pb-6 sm:pb-9 overflow-y-auto no-scrollbar ${
          showLyrics
            ? 'pointer-events-none absolute inset-0 z-0 opacity-0'
            : 'relative z-10 opacity-100'
        }`}
      >
          {/* Top Header */}
          <header className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Minimize player"
              className="liquid-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/15 active:scale-95 transition-all"
            >
              <ChevronDown className="h-5 w-5" />
            </button>

            <div className="min-w-0 text-center">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-white/50">
                PLAYING FROM PLAYLIST
              </p>
              <p className="truncate text-xs sm:text-sm font-semibold text-white/90 mt-0.5">
                {track.playlistName}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDrawerMode((m) => (m === 'options' ? 'none' : 'options'))}
              aria-label="Track options"
              className="liquid-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 hover:bg-white/15 active:scale-95 transition-all"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </header>

          {/* Liquid Glass Cover Stage & Refractive Rim */}
          <div className="my-4 sm:my-6 flex flex-1 flex-col items-center justify-center">
            <div
              onPointerDown={handleCoverPointerDown}
              onPointerMove={handleCoverPointerMove}
              onPointerUp={handleCoverPointerEnd}
              onPointerCancel={handleCoverPointerEnd}
              className="artwork-spring group relative aspect-square w-full max-w-[330px] sm:max-w-[390px] touch-pan-y select-none"
              style={{
                transform: `translate3d(${dragOffsetX}px, 0, 0) scale(${
                  isPlaying ? 1 : 0.86
                }) rotate(${dragOffsetX * 0.045}deg)`,
              }}
            >
              {/* Soft Ambient Light Halo Behind Cover */}
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-5 rounded-[40px] blur-2xl transition-opacity duration-500 ${
                  isPlaying ? 'animate-cover-glow-playing' : ''
                }`}
                style={{
                  background: `radial-gradient(circle, ${track.primaryColor} 0%, ${track.secondaryColor} 65%, transparent 100%)`,
                  opacity: isPlaying ? undefined : 0.14,
                }}
              />

              {/* Generously Rounded Refractive Glass Frame */}
              <div
                className="relative h-full w-full overflow-hidden rounded-[28px] md:rounded-[34px] bg-zinc-950"
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  boxShadow:
                    'inset 0 1px 0 0 rgba(255, 255, 255, 0.25), 0 24px 60px rgba(0, 0, 0, 0.85)',
                }}
              >
                {/* Masked 240x240 YouTube IFrame Mount Behind Opaque Album Artwork */}
                <div
                  ref={ytHostRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
                />

                {/* Crisp Opaque Album Cover Artwork */}
                <CoverArt
                  src={track.coverUrl}
                  alt={track.album}
                  fallbackGradient={track.fallbackGradient}
                  className="relative z-10 h-full w-full bg-zinc-950"
                />

                {/* Delicate Top-Left Specular Glass Sheen Highlight */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-20 rounded-[28px] md:rounded-[34px]"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 45%)',
                  }}
                />

                {/* Quick Swipe Cue Feedback Pill */}
                {swipeCue && (
                  <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
                    <span className="liquid-glass-elevated rounded-full px-3 py-1 text-[11px] font-semibold text-white">
                      {swipeCue === 'next' ? 'Next Track' : 'Previous Track'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls Stack */}
          <div className="space-y-5">
            {/* Track Info Row + Add to Playlist + Heart */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-display truncate text-2xl sm:text-[28px] font-bold leading-tight text-white">
                  {track.title}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenArtist(track.artist);
                  }}
                  className="truncate text-left text-base text-white/65 hover:text-white hover:underline mt-0.5 transition-colors block max-w-full"
                >
                  {track.artist}
                </button>
              </div>

              <div className="mt-0.5 flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleDownload(track)}
                  aria-label={isDownloaded ? 'Remove from App Downloads' : 'Download to App Downloads'}
                  aria-pressed={isDownloaded}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 hover:scale-105 active:scale-90 ${
                    isDownloaded
                      ? 'bg-white text-black shadow-md'
                      : 'liquid-glass text-white/85 hover:bg-white/14'
                  }`}
                >
                  {isDownloaded ? (
                    <Check className="h-4.5 w-4.5" />
                  ) : (
                    <ArrowDownToLine className="h-4.5 w-4.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAddToPlaylist(track)}
                  aria-label="Add to Playlist"
                  className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-transform duration-150 hover:scale-105 hover:bg-white/14 active:scale-90"
                >
                  <Plus className="h-4.5 w-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFavorite(track.id)}
                  aria-label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                  className="liquid-glass flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform duration-150 hover:scale-105 active:scale-90"
                >
                  <Heart
                    className={`h-4.5 w-4.5 transition-colors ${
                      isFavorite ? 'fill-white text-white' : 'text-white/80'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Apple-Style Expanding Interactive Scrubber */}
            <ExpandingScrubber
              currentTime={currentTime}
              duration={track.duration}
              onSeek={onSeek}
              showTimestamps
            />

            {/* Transport Controls */}
            <div className="flex items-center justify-between px-1 sm:px-4">
              <button
                type="button"
                onClick={onToggleShuffle}
                aria-label="Toggle shuffle"
                aria-pressed={isShuffled}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                  isShuffled
                    ? 'bg-white/16 text-white'
                    : 'text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Shuffle className="h-4.5 w-4.5" />
              </button>

              <button
                type="button"
                onClick={onPrevTrack}
                aria-label="Previous track"
                className="flex h-12 w-12 items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-90 transition-all"
              >
                <SkipBack className="h-7 w-7 fill-current" />
              </button>

              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="flex h-16 w-16 sm:h-[72px] sm:w-[72px] items-center justify-center rounded-full bg-white text-black shadow-2xl transition-transform duration-150 hover:scale-[1.03] active:scale-90"
              >
                {isPlaying ? (
                  <Pause className="h-7 w-7 fill-current" />
                ) : (
                  <Play className="h-7 w-7 fill-current translate-x-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onNextTrack}
                aria-label="Next track"
                className="flex h-12 w-12 items-center justify-center rounded-full text-white hover:bg-white/10 active:scale-90 transition-all"
              >
                <SkipForward className="h-7 w-7 fill-current" />
              </button>

              <button
                type="button"
                onClick={onCycleRepeat}
                aria-label={`Repeat mode: ${repeatMode}`}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                  repeatMode !== 'off'
                    ? 'bg-white/16 text-white'
                    : 'text-white/55 hover:bg-white/10 hover:text-white'
                }`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="h-4.5 w-4.5" />
                ) : (
                  <Repeat className="h-4.5 w-4.5" />
                )}
              </button>
            </div>

            {/* Bottom Action Pills: Lyrics, AirPlay / Devices, Up Next Queue */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onToggleLyrics(true)}
                className="liquid-glass flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs sm:text-sm font-medium text-white/90 hover:bg-white/14 active:scale-95 transition-all"
              >
                <Quote className="h-4 w-4 shrink-0" />
                <span>Lyrics</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerMode('devices')}
                className="liquid-glass flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs sm:text-sm font-medium text-white/90 hover:bg-white/14 active:scale-95 transition-all"
              >
                <Airplay className="h-4 w-4 shrink-0" />
                <span className="truncate">Devices</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerMode('queue')}
                className="liquid-glass flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs sm:text-sm font-medium text-white/90 hover:bg-white/14 active:scale-95 transition-all"
              >
                <ListMusic className="h-4 w-4 shrink-0" />
                <span className="truncate">Queue</span>
              </button>
            </div>
          </div>
        </div>

      {/* Full Queue Management Modal */}
      <QueueDrawerModal
        isOpen={drawerMode === 'queue'}
        onClose={() => setDrawerMode('none')}
        activeTrack={track}
        queue={queue}
        allTracks={allTracks}
        onSelectTrack={(t) => {
          onSelectTrackFromQueue(t);
          setDrawerMode('none');
        }}
        onMoveTrack={onMoveQueueTrack}
        onRemoveTrack={onRemoveQueueTrack}
        onClearUpcoming={onClearUpcomingQueue}
        onAddTrack={onAddToQueue}
      />

      {/* Glass Sheet Drawer for AirPlay Devices / Track Options */}
      {(drawerMode === 'devices' || drawerMode === 'options') && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4 backdrop-blur-md"
          onClick={() => setDrawerMode('none')}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass-elevated w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 text-white max-h-[75dvh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="font-display text-lg font-bold">
                {drawerMode === 'devices' ? 'Bluetooth & Output' : 'Track Options'}
              </h3>
              <button
                type="button"
                onClick={() => setDrawerMode('none')}
                aria-label="Close drawer"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {drawerMode === 'devices' && (
              <div className="mt-4 space-y-3 overflow-y-auto no-scrollbar">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isScanningBluetooth}
                    onClick={() => {
                      void scanBluetoothDevices().then((added) => {
                        if (added) onSelectDevice(added.id);
                      });
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-2.5 px-4 text-xs font-semibold text-black hover:scale-[1.01] active:scale-95 transition-transform disabled:opacity-70"
                  >
                    {isScanningBluetooth ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Bluetooth className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {isScanningBluetooth ? 'Scanning Bluetooth...' : 'Scan Bluetooth Devices'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void refreshAudioOutputs()}
                    aria-label="Refresh audio outputs"
                    className="liquid-glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/85 hover:bg-white/14 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {scanStatus && (
                  <p className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-[11px] text-white/75">
                    {scanStatus}
                  </p>
                )}

                <div className="space-y-2">
                  {audioDevices.map((device) => {
                    const selected = device.id === activeDeviceId;
                    const Icon =
                      device.type === 'bluetooth'
                        ? Bluetooth
                        : device.type === 'headphones'
                          ? Headphones
                          : device.type === 'desktop'
                            ? Laptop
                            : device.type === 'phone'
                              ? Smartphone
                              : Speaker;

                    return (
                      <div
                        key={device.id}
                        className={`flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 transition-colors ${
                          selected
                            ? 'bg-white/16 border border-white/20'
                            : 'bg-white/[0.04] border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectDevice(device.id);
                            setDrawerMode('none');
                          }}
                          className="flex flex-1 min-w-0 items-center gap-3 text-left"
                        >
                          <Icon className="h-5 w-5 shrink-0 text-white/85" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{device.name}</p>
                            <p className="truncate text-xs text-white/55">{device.detail}</p>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {selected && <Check className="h-4 w-4 text-white" />}
                          {device.source === 'bluetooth' && (
                            <button
                              type="button"
                              onClick={() => {
                                removeBluetoothDevice(device.id);
                                if (selected) onSelectDevice('system-default');
                              }}
                              aria-label={`Remove ${device.name}`}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/12 hover:text-white transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {drawerMode === 'options' && (
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerMode('none');
                    onToggleLyrics(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left text-sm font-medium hover:bg-white/12 transition-colors"
                >
                  <Quote className="h-4 w-4 text-white/80" />
                  <span>Open Time-Synced Lyrics</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleFavorite(track.id);
                    setDrawerMode('none');
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left text-sm font-medium hover:bg-white/12 transition-colors"
                >
                  <Heart className={`h-4 w-4 ${isFavorite ? 'fill-white text-white' : 'text-white/80'}`} />
                  <span>{isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleDownload(track);
                    setDrawerMode('none');
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left text-sm font-medium hover:bg-white/12 transition-colors"
                >
                  {isDownloaded ? (
                    <Check className="h-4 w-4 text-white" />
                  ) : (
                    <ArrowDownToLine className="h-4 w-4 text-white/80" />
                  )}
                  <span>
                    {isDownloaded ? 'Remove from App Downloads' : 'Download for Offline Listening'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddToQueue(track);
                    setDrawerMode('none');
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left text-sm font-medium hover:bg-white/12 transition-colors"
                >
                  <ListMusic className="h-4 w-4 text-white/80" />
                  <span>Play Next in Queue</span>
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left text-sm font-medium hover:bg-white/12 transition-colors"
                >
                  <Share2 className="h-4 w-4 text-white/80" />
                  <span>{copiedNotice ? 'Copied Track Link' : 'Share Track'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
